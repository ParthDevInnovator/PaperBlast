"use server"

import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function uploadPaperAction(formData: FormData) {
    const title = formData.get("title") as string
    const yearValidation = parseInt(formData.get("year") as string, 10)
    const file = formData.get("file") as File

    if (!title || !yearValidation || !file) {
        return { error: "Missing required fields." }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Unauthorized" }
    }

    // 1. Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from("papers")
        .upload(fileName, file)

    if (uploadError) {
        return { error: `Storage error: ${uploadError.message}` }
    }

    // Get the public URL to save in the database
    const { data: publicUrlData } = supabase.storage
        .from("papers")
        .getPublicUrl(fileName)

    // 2. Create the Paper in the Database
    try {
        await prisma.paper.create({
            data: {
                title,
                year: yearValidation,
                sourcePdfUrl: publicUrlData.publicUrl,
                status: "PENDING",
            },
        })
    } catch (dbError: any) {
        return { error: `Database error: ${dbError.message}` }
    }

    revalidatePath("/dashboard")
    return { success: true }
}

export async function extractPaperAction(paperId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Unauthorized" }
    }

    const paper = await prisma.paper.findUnique({ where: { id: paperId } })
    if (!paper) return { error: "Paper not found." }

    if (paper.status !== "PENDING") {
        return { error: "Paper is already extracted." }
    }

    // Update status immediately to EXTRACTING
    await prisma.paper.update({
        where: { id: paperId },
        data: { status: "EXTRACTING" }
    })

    revalidatePath("/dashboard")

    try {
        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1)

        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from("papers")
            .download(fileName)

        if (downloadError) throw new Error("Failed to download PDF from storage")

        const arrayBuffer = await fileBlob.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // We dynamically import pdf-parse so it doesn't block edge routes accidentally if ran elsewhere
        const pdf = (await import("pdf-parse")).default
        const pdfData = await pdf(buffer)
        const text = pdfData.text

        // --- Basic Heuristic chunking for JEE Format MVP ---
        // Look for lines starting with Q1., 1., Q.1 etc. 
        // This is an extremely naive heuristic intended to just get raw blocks for the Admin Review UI
        const rawQuestions = text.split(/(?:^|\n)(?:Q|Question)?\s*\.?\s*\d+[\.\:\)]/gi).filter(Boolean)

        // The very first chunk is often the cover page/instructions. We can skip it if it's too unstructured, but we'll include it tentatively for the reviewer to manually delete.

        const mappedQuestions = rawQuestions.map(rawText => ({
            paperId: paper.id,
            subject: "PHYSICS" as const, // Placeholder, reviewer sets real subject
            questionText: rawText.substring(0, 1500).trim(), // Crop weirdly large chunks just in case
            options: { "A": "Option 1", "B": "Option 2", "C": "Option 3", "D": "Option 4" }, // Dummy options
            correctAnswer: "A",
            questionType: "MCQ" as const,
            isVerified: false
        }))

        // Bulk insert
        if (mappedQuestions.length > 0) {
            await prisma.question.createMany({
                data: mappedQuestions
            })
        }

        // Set to REVIEW
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "REVIEW" }
        })

        revalidatePath("/dashboard")
        return { success: true, count: mappedQuestions.length }

    } catch (error: any) {
        // Revert status if completely failed
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "PENDING" }
        })
        console.error("Extraction error:", error)
        return { error: error.message || "Failed to extract PDF text." }
    }
}

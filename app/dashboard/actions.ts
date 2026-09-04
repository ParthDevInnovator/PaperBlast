"use server"

import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { runExtraction } from "@/lib/run-extraction"

export async function createPaperRecordAction(params: {
    title: string
    year: number
    publicUrl: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    try {
        await prisma.paper.create({
            data: {
                title: params.title,
                year: params.year,
                sourcePdfUrl: params.publicUrl,
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

    try {
        // Mark as extracting immediately for the UI
        await prisma.paper.update({ where: { id: paperId }, data: { status: "EXTRACTING" } })

        // ── Fire & Forget Background Job ──
        // (In a full prod system, enqueue into QStash. For Vercel/Node: just don't await)
        Promise.resolve().then(() => runExtraction(paperId)).catch(console.error);

        revalidatePath("/dashboard")
        return { success: true }

    } catch (error: any) {
        console.error("Extraction action error:", error)
        return { error: "Failed to start extraction job." }
    }
}

export async function deletePaperAction(paperId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    try {
        // 1. Get the paper so we can delete the file from Storage too
        const paper = await prisma.paper.findUnique({ where: { id: paperId } })
        if (!paper) return { error: "Paper not found" }

        // 2. Delete all questions (cascade-safe; Prisma onDelete may not be set)
        await prisma.question.deleteMany({ where: { paperId } })

        // 3. Delete all mock sessions for this paper
        await prisma.mock.deleteMany({ where: { paperId } })

        // 4. Delete the paper record
        await prisma.paper.delete({ where: { id: paperId } })

        // 5. Best-effort: delete the PDF file from Supabase Storage
        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1)
        await supabase.storage.from("papers").remove([fileName])

        revalidatePath("/dashboard")
        return { success: true }
    } catch (e: any) {
        console.error("Delete paper error:", e)
        return { error: e.message || "Failed to delete paper." }
    }
}

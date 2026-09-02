import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { parseJeePaper } from "@/lib/jee-parser";

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { paperId } = await request.json();

        if (!paperId) {
            return NextResponse.json({ error: "Missing paperId" }, { status: 400 });
        }

        // Idempotency check 
        const existingCount = await prisma.question.count({ where: { paperId } });
        if (existingCount > 0) {
            return NextResponse.json({ error: "Already extracted. Go to Review." }, { status: 409 });
        }

        const paper = await prisma.paper.findUnique({ where: { id: paperId } });
        if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

        if (paper.status !== "PENDING" && paper.status !== "EXTRACTING") {
            return NextResponse.json({ error: "Paper is already extracted." }, { status: 400 });
        }

        // Keep it simple for now, if PENDING, let's update it to EXTRACTING just in case it fails later.
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "EXTRACTING" }
        });

        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);

        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from("papers")
            .download(fileName);

        if (downloadError) throw new Error("Failed to download PDF from storage");

        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const _mod = require("pdf-parse");
        // Turbopack wraps CJS default exports as { default: fn }; plain Node.js returns fn directly.
        const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
            typeof _mod === "function" ? _mod : _mod.default ?? _mod;
        const pdfData = await pdfParse(buffer);
        const text = pdfData.text;

        const parsedQuestions = parseJeePaper(text);

        const mappedQuestions = parsedQuestions.map((q: any) => ({
            paperId: paper.id,
            subject: "PHYSICS" as const, // Placeholder
            questionText: q.questionText,
            options: q.options ? JSON.parse(JSON.stringify(q.options)) : null, // Store options correctly
            correctAnswer: q.options ? "A" : "0", // Default dummy values
            questionType: (q.detectedType === "UNKNOWN" ? "INTEGER" : q.detectedType) as "MCQ" | "INTEGER",
            isVerified: false,
            // Prefix low confidence for reviewers in solution text
            solutionText: q.confidence === "LOW" ? "[LOW CONFIDENCE] Please check." : null
        }));

        if (mappedQuestions.length > 0) {
            await prisma.question.createMany({
                data: mappedQuestions
            });
        }

        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "REVIEW" }
        });

        return NextResponse.json({
            success: true,
            count: mappedQuestions.length,
            highConf: parsedQuestions.filter((q: any) => q.confidence === "HIGH").length,
            lowConf: parsedQuestions.filter((q: any) => q.confidence === "LOW").length
        });

    } catch (e: any) {
        console.error("Extraction error:", e);

        try {
            // Attempt to revert status if paperId is passed and failed
            const { paperId } = await request.json();
            if (paperId) {
                await prisma.paper.update({
                    where: { id: paperId },
                    data: { status: "PENDING" }
                });
            }
        } catch (revertErr) {
            // Ignore revert errors
        }

        return NextResponse.json({ error: e.message || "Failed to extract PDF text." }, { status: 500 });
    }
}

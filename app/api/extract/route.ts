import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { parseJeePaper } from "@/lib/jee-parser";

export const runtime = "nodejs"; // Ensure Node.js runtime (not Edge) for pdf-parse

export async function POST(request: Request) {
    // Hoist paperId so the catch block can revert the paper status on failure
    let paperId: string | null = null;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Read body exactly once — Request body stream can only be consumed once
        const body = await request.json();
        paperId = body.paperId as string | null;

        if (!paperId) {
            return NextResponse.json({ error: "Missing paperId" }, { status: 400 });
        }

        // Idempotency guard — prevent double-extraction
        const existingCount = await prisma.question.count({ where: { paperId } });
        if (existingCount > 0) {
            return NextResponse.json(
                { error: "Already extracted. Go to Review." },
                { status: 409 }
            );
        }

        const paper = await prisma.paper.findUnique({ where: { id: paperId } });
        if (!paper) {
            return NextResponse.json({ error: "Paper not found." }, { status: 404 });
        }

        if (paper.status !== "PENDING" && paper.status !== "EXTRACTING") {
            return NextResponse.json(
                { error: "Paper is already extracted." },
                { status: 400 }
            );
        }

        // Mark as in-progress immediately
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "EXTRACTING" },
        });

        // Download PDF from Supabase Storage
        const fileName = paper.sourcePdfUrl.substring(
            paper.sourcePdfUrl.lastIndexOf("/") + 1
        );

        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from("papers")
            .download(fileName);

        if (downloadError) throw new Error("Failed to download PDF from storage");

        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // pdf-parse v2 uses a class API — PDFParse({ data: buffer }) → .getText() → .destroy()
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PDFParse } = require("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const pdfData = await parser.getText();
        await parser.destroy();
        const text: string = pdfData.text;

        // Run JEE-aware parser to split into structured question rows
        const parsedQuestions = parseJeePaper(text);

        const mappedQuestions = parsedQuestions.map((q) => ({
            paperId: paper.id,
            subject: "PHYSICS" as const, // Placeholder — reviewer assigns correct subject
            questionText: q.questionText,
            options: q.options ?? null,
            correctAnswer: q.options ? "A" : "0", // Dummy defaults for reviewer to correct
            questionType: (
                q.detectedType === "UNKNOWN" ? "INTEGER" : q.detectedType
            ) as "MCQ" | "INTEGER",
            isVerified: false,
            solutionText:
                q.confidence === "LOW" ? "[LOW CONFIDENCE] Please check." : null,
        }));

        if (mappedQuestions.length > 0) {
            await prisma.question.createMany({ data: mappedQuestions });
        }

        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "REVIEW" },
        });

        return NextResponse.json({
            success: true,
            count: mappedQuestions.length,
            highConf: parsedQuestions.filter((q) => q.confidence === "HIGH").length,
            lowConf: parsedQuestions.filter((q) => q.confidence === "LOW").length,
        });

    } catch (e: any) {
        console.error("Extraction error:", e);

        // Revert paper status to PENDING so user can try again
        if (paperId) {
            try {
                await prisma.paper.update({
                    where: { id: paperId },
                    data: { status: "PENDING" },
                });
            } catch (_) {
                // Ignore revert failure — not critical
            }
        }

        return NextResponse.json(
            { error: e.message || "Failed to extract PDF text." },
            { status: 500 }
        );
    }
}

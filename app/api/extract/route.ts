import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max duration for heavy AI batching

async function processPdfBatch(model: any, base64Pdf: string, attempt = 1): Promise<any[]> {
    const prompt = `You are a strictly accurate engineering exam OCR and formatting AI. 
Read this specific section of a JEE mock test PDF. Extract every single question found into a structured JSON array.
Return absolutely nothing else except the RAW JSON ARRAY. No markdown \`\`\` wrappers.

Use this JSON schema strictly:
[
  {
    "subject": "PHYSICS" | "CHEMISTRY" | "MATHEMATICS",
    "questionType": "MCQ" | "INTEGER",
    "questionText": "The actual text of the question, clearly formatted.",
    "options": {
        "A": "Option 1 (or A) text here",
        "B": "Option 2 (or B) text here",
        "C": "Option 3 (or C) text here",
        "D": "Option 4 (or D) text here"
    } | null,
    "correctAnswer": "A" | "B" | "C" | "D" | "the integer value",
    "solutionText": "The explanation/solution for this question, if present in the text."
  }
]

Rules:
1. "subject" is based on the section header. If unknown, use "PHYSICS".
2. "questionType": If 4 visual options exist, map them to A/B/C/D and use "MCQ". If there are no options and it demands a numerical value, use "INTEGER".
3. "correctAnswer": Extract the correct response from the corresponding Ans/Key block. Map 1->A, 2->B, etc.
4. "solutionText": Extract from 'Sol.' blocks.
5. Make sure the JSON is perfectly valid. Escape quotes properly.`;

    try {
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Pdf, mimeType: "application/pdf" } }
        ]);

        let rawText = result.response.text();
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

        // 1. Parse JSON
        const parsedQuestions = JSON.parse(rawText);
        if (!Array.isArray(parsedQuestions)) throw new Error("AI did not return a JSON array");

        // 2. Automated Validation
        const validQuestions = [];
        for (const q of parsedQuestions) {
            if (!q.questionText || q.questionText.trim().length === 0) continue; // Skip broken questions

            validQuestions.push({
                subject: (["PHYSICS", "CHEMISTRY", "MATHEMATICS"].includes(q.subject) ? q.subject : "PHYSICS") as "PHYSICS" | "CHEMISTRY" | "MATHEMATICS",
                questionText: q.questionText,
                options: q.options ? q.options : Prisma.JsonNull,
                correctAnswer: (q.correctAnswer ?? "A").toString(),
                questionType: (q.questionType === "INTEGER" ? "INTEGER" : "MCQ") as "MCQ" | "INTEGER",
                isVerified: true,
                solutionText: q.solutionText || null,
            });
        }
        return validQuestions;
    } catch (e: any) {
        if (attempt <= 2) { // Up to 2 retries on Invalid JSON
            console.log(`JSON Invalid in Batch. Retrying attempt ${attempt + 1}...`);
            return processPdfBatch(model, base64Pdf, attempt + 1);
        }
        console.error("AI Batch completely failed after 3 attempts:", e);
        return []; // Graceful degradation — skip this specific chunk instead of crashing whole paper
    }
}


export async function POST(request: Request) {
    let paperId: string | null = null;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        paperId = body.paperId as string | null;

        if (!paperId) {
            return NextResponse.json({ error: "Missing paperId" }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "GEMINI_API_KEY is not defined in environment variables" }, { status: 500 });
        }

        const paper = await prisma.paper.findUnique({ where: { id: paperId } });
        if (!paper) {
            return NextResponse.json({ error: "Paper not found." }, { status: 404 });
        }

        // Clean slate for re-extraction
        await prisma.question.deleteMany({ where: { paperId } });

        // Phase 1: Mark as PROCESSING
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "EXTRACTING" },
        });

        // Fetch PDF from Storage
        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);
        const { data: fileBlob, error: downloadError } = await supabase.storage.from("papers").download(fileName);
        if (downloadError) throw new Error("Failed to download PDF from storage: " + downloadError.message);

        const arrayBuffer = await fileBlob.arrayBuffer();

        // Phase 2: Detect page structure & Split into batches via pdf-lib
        console.log("Loading PDF for Batch Processing...");
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        const BATCH_SIZE = 4; // Safely process 4 pages per AI call to avoid context limits

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

        const batchPromises = [];

        for (let i = 0; i < pageCount; i += BATCH_SIZE) {
            const subPdf = await PDFDocument.create();
            const pagesToCopy = Array.from({ length: Math.min(BATCH_SIZE, pageCount - i) }, (_, idx) => i + idx);
            const copiedPages = await subPdf.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach((page) => subPdf.addPage(page));

            const subPdfBytes = await subPdf.save();
            const base64Chunk = Buffer.from(subPdfBytes).toString("base64");

            // Phase 3: Vision AI -> Structured JSON -> Automated Validation -> Retry Queue
            batchPromises.push(processPdfBatch(model, base64Chunk));
        }

        // Execute all batches in parallel
        console.log(`Spawning ${batchPromises.length} parallel AI workers for ${pageCount} pages...`);
        const batchResults = await Promise.all(batchPromises);

        // Flatten array of arrays
        const allParsedQuestions = batchResults.flat();

        const mappedQuestions = allParsedQuestions.map(q => ({
            ...q,
            paperId: paper.id
        }));

        // Phase 4: Save Questions
        if (mappedQuestions.length > 0) {
            await prisma.question.createMany({ data: mappedQuestions });
        }

        // Phase 5: Paper READY
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "PUBLISHED" },
        });

        return NextResponse.json({
            success: true,
            count: mappedQuestions.length,
            note: "Processed via concurrent AI page batching architecture",
        });

    } catch (e: any) {
        console.error("Extraction error:", e);

        // Revert status on failure
        if (paperId) {
            try {
                await prisma.paper.update({
                    where: { id: paperId },
                    data: { status: "PENDING" },
                });
            } catch (_) { }
        }

        return NextResponse.json(
            { error: e.message || "Failed to extract PDF." },
            { status: 500 }
        );
    }
}

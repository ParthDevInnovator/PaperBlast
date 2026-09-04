import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pathToFileURL } from "url";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_TEXT_CHARS = 200;
const PAGES_PER_CHUNK = 4; // small chunks → fast Gemini response, no timeouts
const VALID_SUBJECTS = ["PHYSICS", "CHEMISTRY", "MATHEMATICS"] as const;
type ValidSubject = (typeof VALID_SUBJECTS)[number];

type RawQuestion = {
    questionNumber?: number;
    subject?: string;
    questionType?: string;
    questionText?: string;
    options?: Record<string, string> | null;
    correctAnswer?: string | number | null;
    solutionText?: string | null;
    hasVisual?: boolean;
    pageNumber?: number | null;
};

// ─── PDF.js helpers ───────────────────────────────────────────────────────────
const WORKER_SRC = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
).href;

async function getPdfjs() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return pdfjs;
}

async function extractPdfText(pdfBuffer: Buffer): Promise<{ total: number; text: string }> {
    const pdfjs = await getPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    const chunks: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const pageText = (content.items as any[]).map((i: any) => i.str ?? "").join(" ").trim();
        chunks.push(`--- Page ${p} ---\n${pageText}`);
    }
    return { total: doc.numPages, text: chunks.join("\n\n") };
}

// ─── Mistral OCR ──────────────────────────────────────────────────────────────
async function mistralDocumentOcr(mistralApiKey: string, pdfBuffer: Buffer): Promise<string> {
    const base64 = pdfBuffer.toString("base64");
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mistralApiKey}`,
        },
        body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: { type: "document_url", document_url: `data:application/pdf;base64,${base64}` },
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Mistral OCR ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as { pages: Array<{ index: number; markdown: string }> };
    if (!Array.isArray(data.pages) || data.pages.length === 0) throw new Error("Mistral OCR returned no pages");
    return data.pages.sort((a, b) => a.index - b.index).map(p => `--- Page ${p.index + 1} ---\n${p.markdown}`).join("\n\n");
}

// ─── Split text into page-based chunks ────────────────────────────────────────
function splitIntoPageChunks(pageAwareText: string, pagesPerChunk: number): string[] {
    const pages = pageAwareText.split(/^(?=--- Page \d+ ---)/m).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    for (let i = 0; i < pages.length; i += pagesPerChunk) {
        chunks.push(pages.slice(i, i + pagesPerChunk).join("\n\n"));
    }
    return chunks;
}

// ─── Gemini extraction for a single small chunk ───────────────────────────────
async function extractChunk(
    genAI: GoogleGenerativeAI,
    modelName: string,
    chunkText: string,
    chunkIndex: number,
    totalChunks: number
): Promise<RawQuestion[]> {
    if (!chunkText.trim()) return [];

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            responseMimeType: "application/json",
        },
    });

    const prompt = `You are a JEE exam extraction AI. Output ONLY a valid JSON array.
Extract EVERY question from this chunk of a JEE exam paper.
The text has page markers "--- Page N ---".

Rules:
• Infer subject from context (PHYSICS, CHEMISTRY, or MATHEMATICS).
• Extract only what is printed. Never solve or infer answers.
• Printed answer → extract; else null.
• MCQ options → {"A":"…","B":"…","C":"…","D":"…"}; INTEGER type → options: null.
• hasVisual: true if the question references a figure/diagram/graph/image.
• pageNumber: from the "--- Page N ---" marker.

JSON schema (return ONLY this array):
[{
  "questionNumber": 1,
  "subject": "PHYSICS"|"CHEMISTRY"|"MATHEMATICS",
  "questionType": "MCQ"|"INTEGER",
  "questionText": "…",
  "options": {"A":"..","B":"..","C":"..","D":".."} | null,
  "correctAnswer": "A"|"42"|null,
  "solutionText": "…"|null,
  "hasVisual": false,
  "pageNumber": 3
}]

If this chunk has no questions (e.g. it's just instructions/headers), return an empty array [].

--- CHUNK ${chunkIndex + 1}/${totalChunks} START ---
${chunkText}
--- CHUNK END ---`;

    // 2 attempts with generous timeout
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const TIMEOUT_MS = 90_000;
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
            );

            const completion = await Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
                timeoutPromise,
            ]);

            const raw = completion.response.text() || "";
            const cleaned = raw.replace(/```json/gi, "").replace(/```/gi, "").trim();
            if (!cleaned || cleaned === "[]") return [];

            const json = JSON.parse(cleaned);
            if (!Array.isArray(json)) return [];
            return json as RawQuestion[];
        } catch (err: any) {
            console.log(`  ⚠️ Chunk ${chunkIndex + 1} attempt ${attempt}/2: ${err.message}`);
            if (attempt === 2) return []; // give up on this chunk, don't kill the whole job
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    return [];
}

// ─── Map raw question to Prisma-ready data ────────────────────────────────────
function mapQuestion(item: RawQuestion, paperId: string) {
    const subject = VALID_SUBJECTS.includes(item.subject as ValidSubject)
        ? (item.subject as ValidSubject)
        : ("PHYSICS" as const);
    const questionType = item.questionType === "INTEGER" ? ("INTEGER" as const) : ("MCQ" as const);

    return {
        paperId,
        subject,
        questionText: (item.questionText || "").trim(),
        options: questionType === "MCQ" && item.options && typeof item.options === "object"
            ? item.options
            : Prisma.JsonNull,
        correctAnswer: item.correctAnswer != null ? String(item.correctAnswer).trim() : "",
        questionType,
        isVerified: !!(item.correctAnswer != null && String(item.correctAnswer).trim()),
        solutionText: item.solutionText?.trim() || null,
    };
}

// ─── MAIN BACKGROUND ORCHESTRATOR ─────────────────────────────────────────────
export async function runExtraction(paperId: string) {
    console.log(`\n🚀 BACKGROUND JOB: Starting extraction for paper ${paperId}`);
    try {
        const paper = await prisma.paper.findUnique({ where: { id: paperId } });
        if (!paper) throw new Error("Paper not found");

        await prisma.paper.update({ where: { id: paperId }, data: { status: "EXTRACTING" } });

        const mistralKey = process.env.MISTRAL_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;
        const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

        if (!mistralKey || !geminiKey) {
            throw new Error("Missing MISTRAL_API_KEY or GEMINI_API_KEY");
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const supabase = await createClient();

        // 1. Download
        const t1 = Date.now();
        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);
        const { data: fileBlob, error: dlErr } = await supabase.storage.from("papers").download(fileName);
        if (dlErr) throw new Error("PDF download failed: " + dlErr.message);
        const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
        console.log(`📥 Downloaded ~${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB in ${Date.now() - t1}ms`);

        // 2. Inspect — text-based or scanned?
        const { total: totalPages, text: rawText } = await extractPdfText(pdfBuffer);
        const isTextBased = rawText.replace(/--- Page \d+ ---/g, "").trim().length >= MIN_TEXT_CHARS;
        console.log(`🔍 Inspect: ${totalPages} pages → ${isTextBased ? "TEXT-BASED" : "SCANNED"}`);

        // 3. OCR if scanned
        const t2 = Date.now();
        const pageAwareText = isTextBased ? rawText : await mistralDocumentOcr(mistralKey, pdfBuffer);
        console.log(`✅ Text ready (${isTextBased ? 'pdfjs' : 'Mistral'}) in ${Date.now() - t2}ms`);

        if (pageAwareText.replace(/--- Page \d+ ---/g, "").trim().length < 50) {
            throw new Error("Could not extract readable text from this PDF.");
        }

        // 4. Split into small page-chunks
        const chunks = splitIntoPageChunks(pageAwareText, PAGES_PER_CHUNK);
        console.log(`✂️ Split into ${chunks.length} chunks of ~${PAGES_PER_CHUNK} pages each`);

        // 5. Delete existing questions for this paper (fresh start)
        await prisma.question.deleteMany({ where: { paperId: paper.id } });

        // 6. Process chunks SEQUENTIALLY — save after each one
        let totalExtracted = 0;
        let failedChunks = 0;
        const dt0 = Date.now();

        for (let i = 0; i < chunks.length; i++) {
            console.log(`\n📄 Processing chunk ${i + 1}/${chunks.length}...`);

            const rawQuestions = await extractChunk(genAI, modelName, chunks[i], i, chunks.length);

            if (rawQuestions.length === 0) {
                console.log(`  ⏭️ Chunk ${i + 1}: no questions found (header/instructions page?)`);
                if (chunks[i].length > 500) failedChunks++; // only count as failure if the chunk had real content
                continue;
            }

            // Map and filter valid questions
            const dbRows = rawQuestions
                .filter(q => q.questionText?.trim())
                .map(q => mapQuestion(q, paper.id));

            if (dbRows.length > 0) {
                await prisma.question.createMany({ data: dbRows });
                totalExtracted += dbRows.length;
                console.log(`  ✅ Chunk ${i + 1}: saved ${dbRows.length} questions (total: ${totalExtracted})`);

                // Publish immediately after first successful chunk → paper becomes available for mocks
                if (totalExtracted === dbRows.length) {
                    await prisma.paper.update({ where: { id: paper.id }, data: { status: "PUBLISHED" } });
                    console.log(`  🟢 Paper PUBLISHED with first ${totalExtracted} questions — remaining chunks continue in background`);
                }
            }

            // Brief pause between chunks to respect Gemini rate limits (15 RPM free tier)
            if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        const totalMs = Date.now() - dt0;
        console.log(`\n⏱️ Extraction loop done in ${totalMs}ms`);

        // 7. Final status update
        const finalStatus = totalExtracted === 0 ? "REVIEW" : (failedChunks > 0 ? "REVIEW" : "PUBLISHED");
        await prisma.paper.update({ where: { id: paper.id }, data: { status: finalStatus } });
        console.log(`🎉 Done! Status: ${finalStatus}, ${totalExtracted} questions, ${failedChunks} failed chunks.`);

    } catch (e: any) {
        console.error(`💥 Background job failed for ${paperId}:\n`, e);
        try {
            await prisma.paper.update({ where: { id: paperId }, data: { status: "REVIEW" } });
        } catch (_) { }
    }
}

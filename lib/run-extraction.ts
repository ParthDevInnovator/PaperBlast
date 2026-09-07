import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { Prisma, QuestionType } from "@prisma/client";
import { pathToFileURL } from "url";
import path from "path";
import {
    RawQuestion,
    segmentDocumentIntoChunks,
    ExtractionChunk,
} from "@/lib/jee-parser";
import { GeminiWorkerQueue, GeminiTask } from "@/lib/gemini-queue";

// ─── Config ───────────────────────────────────────────────────────────────────
const VISUAL_RENDER_SCALE = 2.0;
const VALID_SUBJECTS = ["PHYSICS", "CHEMISTRY", "MATHEMATICS"] as const;
type ValidSubject = (typeof VALID_SUBJECTS)[number];

// ─── pdfjs: load once with correct worker ─────────────────────────────────────
const WORKER_SRC = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
).href;

async function getPdfjs() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return pdfjs;
}

// ─── Render ONLY the specified PDF pages to base64 PNGs ───────────────────────
async function renderPdfPages(
    pdfBuffer: Buffer,
    pageNumbers: number[],
    scale: number
): Promise<Map<number, string>> {
    if (pageNumbers.length === 0) return new Map();

    const pdfjs = await getPdfjs();
    const { createCanvas } = await import("@napi-rs/canvas");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

    const validPages = pageNumbers.filter((p) => p >= 1 && p <= doc.numPages);
    const result = new Map<number, string>();

    for (const p of validPages) {
        try {
            const page = await doc.getPage(p);
            const vp = page.getViewport({ scale });
            const canvas = createCanvas(vp.width, vp.height);
            await page.render({ canvasContext: canvas.getContext("2d") as any, viewport: vp }).promise;
            result.set(p, (canvas as any).toBuffer("image/png").toString("base64"));
        } catch (e: any) {
            console.warn(`⚠️ Error rendering page ${p}: ${e.message}`);
        }
    }
    return result;
}

// ─── Upload page PNG to Supabase ──────────────────────────────────────────────
async function uploadVisualPage(base64: string, supabase: any): Promise<string | null> {
    try {
        const bytes = Buffer.from(base64, "base64");
        const name = `visuals/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const { error } = await supabase.storage
            .from("papers")
            .upload(name, bytes, { contentType: "image/png", upsert: true });
        if (error) return null;
        return supabase.storage.from("papers").getPublicUrl(name).data.publicUrl;
    } catch {
        return null;
    }
}

// ─── Mistral OCR: ONE call for the entire PDF (~5–8 sec) ──────────────────────
async function mistralDocumentOcr(
    mistralApiKey: string,
    pdfBuffer: Buffer,
    pdfUrl?: string
): Promise<{ text: string; totalPages: number }> {
    const maxAttempts = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Prefer public URL if available to avoid uploading large base64 payload over domestic socket
            const docUrl =
                pdfUrl && pdfUrl.startsWith("http")
                    ? pdfUrl
                    : `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;

            const res = await fetch("https://api.mistral.ai/v1/ocr", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${mistralApiKey}`,
                },
                body: JSON.stringify({
                    model: "mistral-ocr-latest",
                    document: {
                        type: "document_url",
                        document_url: docUrl,
                    },
                }),
            });

            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new Error(`Mistral OCR ${res.status}: ${body.slice(0, 200)}`);
            }

            const data = (await res.json()) as {
                pages: Array<{ index: number; markdown: string }>;
            };

            if (!Array.isArray(data.pages) || data.pages.length === 0) {
                throw new Error("Mistral OCR returned no pages");
            }

            const text = data.pages
                .sort((a, b) => a.index - b.index)
                .map((p) => `--- Page ${p.index + 1} ---\n${p.markdown}`)
                .join("\n\n");

            return { text, totalPages: data.pages.length };
        } catch (err: any) {
            lastError = err;
            console.warn(`⚠️ Mistral OCR attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1500 * attempt));
            }
        }
    }

    throw lastError || new Error("Mistral OCR failed after retries");
}

// ─── Map to Prisma database row ───────────────────────────────────────────────
function mapQuestionToDbRow(item: RawQuestion, paperId: string, imageUrl: string | null = null) {
    const subject = VALID_SUBJECTS.includes(item.subject as ValidSubject)
        ? (item.subject as ValidSubject)
        : "PHYSICS";
    const questionType = item.questionType === "INTEGER" ? QuestionType.INTEGER : QuestionType.MCQ;

    return {
        paperId,
        subject,
        questionText: (item.questionText || "").trim(),
        options:
            questionType === QuestionType.MCQ && item.options && typeof item.options === "object"
                ? item.options
                : Prisma.JsonNull,
        correctAnswer: item.correctAnswer != null ? String(item.correctAnswer).trim() : "",
        questionType,
        isVerified: !!(item.correctAnswer != null && String(item.correctAnswer).trim()),
        solutionText: item.solutionText?.trim() || null,
        imageUrl,
    };
}

// ─── MAIN PIPELINE: Parallel Rate-Limited Incremental Extraction ───────────────
export async function runExtraction(paperId: string) {
    const t0 = Date.now();
    console.log(`\n==================================================`);
    console.log(`🚀 JEE EXTRACTION PIPELINE START: Paper ${paperId}`);
    console.log(`==================================================`);

    const paper = await prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) throw new Error("Paper not found");

    const mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) {
        throw new Error("Missing MISTRAL_API_KEY in environment");
    }

    const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 1. Mark paper as EXTRACTING (Do NOT delete questions up-front)
    await prisma.paper.update({ where: { id: paperId }, data: { status: "EXTRACTING" } });

    // 2. Download PDF
    const tDl = Date.now();
    const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);
    const { data: fileBlob, error: dlErr } = await supabase.storage.from("papers").download(fileName);
    if (dlErr) throw new Error("PDF download failed: " + dlErr.message);
    const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
    console.log(`📥 Downloaded PDF: ${(pdfBuffer.length / 1024).toFixed(0)} KB in ${Date.now() - tDl} ms`);

    // 3. Mistral OCR — ONE CALL for the entire PDF
    const tOcr = Date.now();
    const { text: pageAwareText, totalPages } = await mistralDocumentOcr(
        mistralKey,
        pdfBuffer,
        paper.sourcePdfUrl
    );
    const mistralMs = Date.now() - tOcr;
    console.log(`📥 Mistral OCR: ${mistralMs} ms (${totalPages} pages)`);

    if (pageAwareText.length < 50) {
        throw new Error("Could not extract readable text from this PDF.");
    }

    // 4. Local Segmentation — Target 4 extraction chunks
    const tSeg = Date.now();
    const targetChunks = 4;
    const chunks: ExtractionChunk[] = segmentDocumentIntoChunks(pageAwareText, targetChunks);
    const segmentationMs = Date.now() - tSeg;
    console.log(`🔪 Segmentation: ${segmentationMs} ms (${chunks.length} chunks)`);
    chunks.forEach((c) => {
        console.log(`   - [${c.id}] ${c.name}: ${c.text.length} chars`);
    });

    // 5. Rate-Limit-Safe Global Worker Queue
    const queue = new GeminiWorkerQueue();
    const queueStatus = queue.getStatus();

    const tasks: GeminiTask[] = chunks.map((chunk) => ({
        id: chunk.id,
        chunkName: chunk.name,
        sectionText: chunk.text,
        targetSubject: chunk.subject,
    }));

    // Caching for rendered visual pages across all workers
    const renderedPagesMap = new Map<number, string>();
    const savedChunkIds = new Set<string>();
    let totalQuestionsSaved = 0;
    let totalVisualsAttached = 0;
    let totalDbMs = 0;
    let initialQuestionsAvailableMs: number | null = null;

    // Incremental Persistence Callback: Fires immediately when ANY worker finishes
    const handleChunkSuccess = async (questions: RawQuestion[], chunkName: string, durationMs: number) => {
        if (questions.length === 0) return;
        const tChunkSave = Date.now();

        // Check if any visual pages need rendering for this chunk
        const neededPagesForChunk: number[] = [];
        for (const q of questions) {
            if (q.hasVisual && q.pageNumber) {
                const p = Math.min(Math.max(q.pageNumber, 1), totalPages);
                if (!renderedPagesMap.has(p) && !neededPagesForChunk.includes(p)) {
                    neededPagesForChunk.push(p);
                }
            }
        }

        // Render & upload needed pages on-demand
        if (neededPagesForChunk.length > 0) {
            console.log(`🎨 Rendering ${neededPagesForChunk.length} visual page(s) [${neededPagesForChunk.join(", ")}] for ${chunkName}...`);
            const newlyRendered = await renderPdfPages(pdfBuffer, neededPagesForChunk, VISUAL_RENDER_SCALE);
            for (const [pageNum, base64] of newlyRendered.entries()) {
                const url = await uploadVisualPage(base64, supabase);
                if (url) {
                    renderedPagesMap.set(pageNum, url);
                }
            }
        }

        // Map questions to DB rows
        let chunkVisuals = 0;
        const dbRows = questions.map((q) => {
            let imageUrl: string | null = null;
            if (q.hasVisual && q.pageNumber && renderedPagesMap.has(q.pageNumber)) {
                imageUrl = renderedPagesMap.get(q.pageNumber)!;
                chunkVisuals++;
            }
            return mapQuestionToDbRow(q, paperId, imageUrl);
        });

        // Save immediately in DB
        await prisma.question.createMany({ data: dbRows });
        const saveMs = Date.now() - tChunkSave;
        totalDbMs += saveMs;
        totalQuestionsSaved += dbRows.length;
        totalVisualsAttached += chunkVisuals;

        console.log(`💾 Saved ${dbRows.length} questions from ${chunkName} to DB in ${saveMs} ms`);

        // Record & log initial questions availability once
        if (initialQuestionsAvailableMs === null) {
            initialQuestionsAvailableMs = Date.now() - t0;
            console.log(`\n⚡ Initial questions available: ${initialQuestionsAvailableMs} ms\n`);
        }
    };

    // Process all chunks through the rate-limited queue
    const { results, completedWorkers, failedWorkers, questionsExtracted } = await queue.processTasks(
        tasks,
        handleChunkSuccess
    );

    // 6. Final Status & Observability Reporting
    const tFinalDb = Date.now();
    const finalPaper = await prisma.paper.findUnique({
        where: { id: paperId },
        include: { _count: { select: { questions: true } } },
    });
    const finalQuestionCount = finalPaper?._count.questions || 0;

    if (finalQuestionCount > 0 && failedWorkers === 0) {
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "PUBLISHED" },
        });
    } else if (finalQuestionCount > 0 && failedWorkers > 0) {
        // Partial success: keep questions available for review, do not mark complete with zero questions
        await prisma.paper.update({
            where: { id: paperId },
            data: { status: "REVIEW" },
        });
    } else {
        throw new Error("Extraction produced 0 questions; paper remains in EXTRACTING/REVIEW status.");
    }
    totalDbMs += (Date.now() - tFinalDb);

    const totalMs = Date.now() - t0;

    console.log(`\n==================================================`);
    console.log(`🎉 EXTRACTION SUMMARY:`);
    console.log(`⚡ Initial questions available: ${initialQuestionsAvailableMs || totalMs} ms`);
    console.log(`📊 Workers completed: ${completedWorkers}/${tasks.length}`);
    if (failedWorkers > 0) {
        console.log(`⚠️ Workers failed: ${failedWorkers}/${tasks.length}`);
    }
    console.log(`📊 Questions extracted: ${finalQuestionCount}`);
    console.log(`🎨 Visuals: ${totalVisualsAttached}`);
    console.log(`💾 DB: ${totalDbMs} ms`);
    console.log(`⏱ TOTAL: ${totalMs} ms`);
    console.log(`==================================================\n`);

    return {
        success: true,
        count: finalQuestionCount,
        completedWorkers,
        failedWorkers,
        visualsExtracted: totalVisualsAttached,
        initialAvailableMs: initialQuestionsAvailableMs,
        timeMs: totalMs,
    };
}

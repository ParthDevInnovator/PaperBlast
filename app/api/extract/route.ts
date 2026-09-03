import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { pathToFileURL } from "url";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_TEXT_CHARS = 200;       // below this → treat as scanned PDF
const OCR_RENDER_SCALE = 1.5;     // scale for scanned OCR renders (balance quality/size)
const VISUAL_RENDER_SCALE = 2.0;  // scale when rendering for visual questions

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

// ─── pdfjs: load once with correct worker ─────────────────────────────────────
const WORKER_SRC = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
).href;

async function getPdfjs() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return pdfjs;
}

// ─── Text extraction (text-based PDFs) ───────────────────────────────────────
// Returns page-aware text ("--- Page N ---\n<content>") for every page.
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

// ─── Page rendering ───────────────────────────────────────────────────────────
// Renders the given 1-based page numbers (or ALL if null) to base64 PNGs.
async function renderPdfPages(
    pdfBuffer: Buffer,
    pageNumbers: number[] | null,
    scale: number
): Promise<Map<number, string>> {
    const pdfjs = await getPdfjs();
    const { createCanvas } = await import("@napi-rs/canvas");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

    const pages = pageNumbers
        ? pageNumbers.filter(p => p >= 1 && p <= doc.numPages)
        : Array.from({ length: doc.numPages }, (_, i) => i + 1);

    const result = new Map<number, string>();
    for (const p of pages) {
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale });
        const canvas = createCanvas(vp.width, vp.height);
        await page.render({ canvasContext: canvas.getContext("2d") as any, viewport: vp }).promise;
        result.set(p, (canvas as any).toBuffer("image/png").toString("base64"));
    }
    return result;
}

// ─── Mistral OCR: ONE call for the entire PDF ────────────────────────────────
//
// POST /v1/ocr with model=mistral-ocr-latest accepts the whole PDF as a
// base64 data-URI and returns page-indexed markdown with LaTeX preserved.
// No image rendering needed. 50 MB / 1 000 page limit — well within range.
//
async function mistralDocumentOcr(
    mistralApiKey: string,
    pdfBuffer: Buffer
): Promise<string> {
    const base64 = pdfBuffer.toString("base64");

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
                document_url: `data:application/pdf;base64,${base64}`,
            },
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Mistral OCR ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as {
        pages: Array<{ index: number; markdown: string }>;
    };

    if (!Array.isArray(data.pages) || data.pages.length === 0)
        throw new Error("Mistral OCR returned no pages");

    return data.pages
        .sort((a, b) => a.index - b.index)
        .map(p => `--- Page ${p.index + 1} ---\n${p.markdown}`)
        .join("\n\n");
}

// ─── DeepSeek V4 Pro — Parallel Chunked Extraction ──────────────────────────────
async function extractSubjectWithDeepSeek(
    client: OpenAI,
    model: string,
    subjectName: string,
    chunkText: string
): Promise<RawQuestion[]> {
    if (!chunkText.trim()) return [];

    const completion = await client.chat.completions.create({
        model,
        messages: [
            {
                role: "system",
                content: "You are a JEE exam extraction AI. Output ONLY a valid JSON array. No markdown, no explanation.",
            },
            {
                role: "user",
                content: `You are extracting the ${subjectName} section of a JEE exam. 
Extract EVERY question from this text chunk (it has page markers "--- Page N ---").

Rules:
• Subject MUST be "${subjectName}" for all returned questions.
• Extract only what is printed. Never solve or infer.
• Printed answer → extract; else null.
• Printed solution → extract; else null.
• MCQ options → {"A":"…","B":"…","C":"…","D":"…"}; INTEGER → options: null.
• hasVisual: true if the question references a figure/diagram/graph/image.
• pageNumber: use the "--- Page N ---" marker where the question appears.

JSON schema (return ONLY this array):
[{
  "questionNumber": 1,
  "subject": "${subjectName}",
  "questionType": "MCQ"|"INTEGER",
  "questionText": "…",
  "options": {"A":"..","B":"..","C":"..","D":".."} | null,
  "correctAnswer": "A"|"42"|null,
  "solutionText": "…"|null,
  "hasVisual": false,
  "pageNumber": 3
}]

--- ${subjectName} PAPER CHUNK START ---
${chunkText}
--- ${subjectName} PAPER CHUNK END ---`,
            },
        ],
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: 8192,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/gi, "").replace(/```/gi, "").trim();
    if (!cleaned) return [];

    try {
        const json = JSON.parse(cleaned);
        if (!Array.isArray(json)) return [];
        return json as RawQuestion[];
    } catch {
        return [];
    }
}

async function extractWithDeepSeekParallel(
    client: OpenAI,
    model: string,
    pageAwareText: string,
    totalPages: number
): Promise<RawQuestion[]> {
    // 1. Split text into pages
    // Regex splits before "--- Page N ---" while keeping the marker
    const pages = pageAwareText.split(/^(?=--- Page \d+ ---)/m).filter(s => s.trim().length > 0);

    // 2. Divide roughly into thirds (Physics, Chemistry, Maths typically appear in this order)
    const third = Math.ceil(pages.length / 3);
    const chunkPhysics = pages.slice(0, third).join("\n\n");
    const chunkChemistry = pages.slice(third, third * 2).join("\n\n");
    const chunkMaths = pages.slice(third * 2).join("\n\n");

    console.log(`🧠 Firing 3 parallel DeepSeek calls: [Physics: ${chunkPhysics.length}c], [Chemistry: ${chunkChemistry.length}c], [Maths: ${chunkMaths.length}c]`);

    // 3. Fire parallel API calls
    const [physicsQs, chemistryQs, mathQs] = await Promise.all([
        extractSubjectWithDeepSeek(client, model, "PHYSICS", chunkPhysics),
        extractSubjectWithDeepSeek(client, model, "CHEMISTRY", chunkChemistry),
        extractSubjectWithDeepSeek(client, model, "MATHEMATICS", chunkMaths)
    ]);

    // 4. Merge results and enforce subject fields
    physicsQs.forEach(q => (q.subject = "PHYSICS"));
    chemistryQs.forEach(q => (q.subject = "CHEMISTRY"));
    mathQs.forEach(q => (q.subject = "MATHEMATICS"));

    return [...physicsQs, ...chemistryQs, ...mathQs];
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

// ─── Main Route ───────────────────────────────────────────────────────────────
export async function POST(request: Request) {
    let paperId: string | null = null;
    const t0 = Date.now();

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        paperId = body.paperId as string | null;
        if (!paperId)
            return NextResponse.json({ success: false, error: "Missing paperId" }, { status: 400 });

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey)
            return NextResponse.json({ success: false, error: "NVIDIA_API_KEY missing" }, { status: 500 });

        const extractionModel = process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4-pro-0813";
        const visionModel = process.env.NVIDIA_VISION_MODEL || "meta/llama-3.2-11b-vision-instruct";

        const paper = await prisma.paper.findUnique({ where: { id: paperId } });
        if (!paper)
            return NextResponse.json({ success: false, error: "Paper not found." }, { status: 404 });

        await prisma.paper.update({ where: { id: paperId }, data: { status: "EXTRACTING" } });

        const client = new OpenAI({ apiKey, baseURL: "https://integrate.api.nvidia.com/v1" });

        // ── 1. Download PDF ───────────────────────────────────────────────────
        const t1 = Date.now();
        const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);
        const { data: fileBlob, error: dlErr } = await supabase.storage.from("papers").download(fileName);
        if (dlErr) throw new Error("PDF download failed: " + dlErr.message);
        const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
        const downloadMs = Date.now() - t1;
        console.log(`\n📥 PDF downloaded: ${(pdfBuffer.length / 1024).toFixed(0)}KB in ${downloadMs}ms`);

        // ── 2. Fast inspection: text-based or scanned? ────────────────────────
        const t2 = Date.now();
        let pageAwareText = "";
        let renderedPages: Map<number, string> = new Map();
        let totalPages = 0;
        let usedOcr = false;

        const { total, text: rawText } = await extractPdfText(pdfBuffer);
        totalPages = total;
        const embeddedTextLen = rawText.replace(/--- Page \d+ ---/g, "").trim().length;
        const isTextBased = embeddedTextLen >= MIN_TEXT_CHARS;

        console.log(`🔍 PDF inspection: ${totalPages} pages, ${embeddedTextLen} embedded chars → ${isTextBased ? "TEXT-BASED" : "SCANNED"}`);

        if (isTextBased) {
            // ── Text path: pdfjs extracted everything already ─────────────────
            pageAwareText = rawText;
            console.log(`📝 Text extracted: ${pageAwareText.length} chars`);
        } else {
            // ── Scanned path: ONE Mistral OCR call for the whole document ─────
            const mistralKey = process.env.MISTRAL_API_KEY;
            if (!mistralKey)
                throw new Error("MISTRAL_API_KEY missing — required for scanned PDF OCR");

            console.log(`🖼️  Scanned PDF → Mistral OCR (1 call, whole document)…`);
            pageAwareText = await mistralDocumentOcr(mistralKey, pdfBuffer);
            usedOcr = true;
            console.log(`✅ Mistral OCR complete: ${pageAwareText.length} chars`);
        }

        const textMs = Date.now() - t2;

        if (pageAwareText.replace(/--- Page \d+ ---/g, "").trim().length < 50)
            throw new Error("Could not extract readable text from this PDF.");

        // ── 3. DeepSeek V4 Pro — Extract questions (3 parallel chunks) ────────
        const t3 = Date.now();
        console.log(`\n🧠 DeepSeek (${extractionModel}): chunking ${pageAwareText.length} chars into 3 parallel subject tasks…`);
        const rawQuestions = await extractWithDeepSeekParallel(client, extractionModel, pageAwareText, totalPages);
        const deepseekMs = Date.now() - t3;
        console.log(`✅ DeepSeek done: ${rawQuestions.length} questions in ${deepseekMs}ms`);

        // ── 4. Map to DB rows ─────────────────────────────────────────────────
        const questions: any[] = [];
        const visualJobs: { idx: number; pageNumber: number | null }[] = [];

        for (const item of rawQuestions) {
            if (!item.questionText?.trim()) continue;
            const idx = questions.length;

            questions.push({
                paperId: paper.id,
                subject: VALID_SUBJECTS.includes(item.subject as ValidSubject) ? item.subject : "PHYSICS",
                questionText: item.questionText.trim(),
                options:
                    item.questionType === "MCQ" && item.options && typeof item.options === "object"
                        ? item.options : Prisma.JsonNull,
                correctAnswer: item.correctAnswer != null ? String(item.correctAnswer).trim() : "",
                questionType: item.questionType === "INTEGER" ? "INTEGER" : "MCQ",
                isVerified: !!(item.correctAnswer != null && String(item.correctAnswer).trim()),
                solutionText: item.solutionText?.trim() || null,
                hasVisual: !!item.hasVisual,
                imageUrl: null,
            });

            if (item.hasVisual) {
                visualJobs.push({ idx, pageNumber: item.pageNumber ?? null });
            }
        }

        if (questions.length === 0)
            throw new Error("Extraction produced 0 questions; refusing to publish.");

        console.log(`📊 ${questions.length} questions, ${visualJobs.length} with visuals`);

        // ── 5. Visuals: render ONLY the needed pages ──────────────────────────
        let visualMs = 0;
        let visualSuccess = 0;

        if (visualJobs.length > 0) {
            const t5 = Date.now();

            // Collect page numbers to render
            const neededPageNums = new Set<number>();
            for (const vj of visualJobs) {
                const p = vj.pageNumber ?? Math.max(1, Math.round((vj.idx / questions.length) * totalPages));
                neededPageNums.add(Math.min(Math.max(p, 1), totalPages));
            }

            // For text-based PDFs: render just the needed pages (not already rendered)
            // For scanned PDFs: renderedPages already has everything from OCR step
            const missingPages = [...neededPageNums].filter(p => !renderedPages.has(p));
            if (missingPages.length > 0) {
                console.log(`\n🖼️  Rendering ${missingPages.length} page(s) for visual questions…`);
                try {
                    const newPages = await renderPdfPages(pdfBuffer, missingPages, VISUAL_RENDER_SCALE);
                    newPages.forEach((v, k) => renderedPages.set(k, v));
                } catch (e: any) {
                    console.warn(`⚠️ Page rendering failed: ${e.message}`);
                }
            } else if (visualJobs.length > 0) {
                console.log(`♻️  Reusing ${neededPageNums.size} already-rendered page(s) for visuals`);
            }

            // Upload each visual question's page
            if (renderedPages.size > 0) {
                console.log(`🎨 Uploading ${visualJobs.length} visual page(s) to Supabase…`);
                for (const vj of visualJobs) {
                    const p = vj.pageNumber
                        ?? Math.max(1, Math.round((vj.idx / questions.length) * totalPages));
                    const pageKey = Math.min(Math.max(p, 1), totalPages);
                    const png = renderedPages.get(pageKey);

                    if (!png) {
                        console.log(`  ⚠️ Q${vj.idx + 1}: page ${pageKey} unavailable`);
                        continue;
                    }

                    const url = await uploadVisualPage(png, supabase);
                    if (url) {
                        questions[vj.idx].imageUrl = url;
                        visualSuccess++;
                        console.log(`  ✅ Q${vj.idx + 1} → page ${pageKey}`);
                    } else {
                        console.log(`  ⚠️ Q${vj.idx + 1} upload failed`);
                    }
                }
            }

            visualMs = Date.now() - t5;
        }

        // ── 6. Prisma — save & publish ────────────────────────────────────────
        const t6 = Date.now();
        await prisma.$transaction(async tx => {
            await tx.question.deleteMany({ where: { paperId: paper.id } });
            await tx.question.createMany({ data: questions });
            await tx.paper.update({ where: { id: paper.id }, data: { status: "PUBLISHED" } });
        });
        const dbMs = Date.now() - t6;

        const totalMs = Date.now() - t0;
        console.log(`\n⏱️  TIMINGS:`);
        console.log(`   Download:       ${downloadMs}ms`);
        if (usedOcr) {
            console.log(`   Render+OCR:     ${textMs}ms  (${totalPages} pages, all parallel)`);
        } else {
            console.log(`   Text extract:   ${textMs}ms  (pdfjs embedded text)`);
        }
        console.log(`   DeepSeek:       ${deepseekMs}ms`);
        if (visualMs > 0) console.log(`   Visuals:        ${visualMs}ms  (${visualSuccess}/${visualJobs.length})`);
        console.log(`   DB Save:        ${dbMs}ms`);
        console.log(`   TOTAL:          ${totalMs}ms`);
        console.log(`\n🎉 PUBLISHED: ${questions.length} questions\n`);

        return NextResponse.json({
            success: true,
            count: questions.length,
            visualsExtracted: visualSuccess,
            usedOcr,
            timeMs: totalMs,
        });

    } catch (e: any) {
        console.error(`❌ Extraction aborted: ${e.message ?? e}`);
        if (paperId) {
            try {
                await prisma.paper.update({ where: { id: paperId }, data: { status: "PENDING" } });
            } catch (_) { }
        }
        return NextResponse.json(
            { success: false, error: e.message || "Extraction failed." },
            { status: 500 }
        );
    }
}

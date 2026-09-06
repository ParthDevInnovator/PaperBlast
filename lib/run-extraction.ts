import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma, QuestionType } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pathToFileURL } from "url";
import path from "path";
import { preprocessMarkdown, splitBySubjectSections, RawQuestion, SubjectSection } from "@/lib/jee-parser";

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

    const validPages = pageNumbers.filter(p => p >= 1 && p <= doc.numPages);
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

// ─── Mistral OCR: ONE call for the entire PDF (~5 sec) ───────────────────────
async function mistralDocumentOcr(
    mistralApiKey: string,
    pdfBuffer: Buffer
): Promise<{ text: string; totalPages: number }> {
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

    if (!Array.isArray(data.pages) || data.pages.length === 0) {
        throw new Error("Mistral OCR returned no pages");
    }

    const text = data.pages
        .sort((a, b) => a.index - b.index)
        .map(p => `--- Page ${p.index + 1} ---\n${p.markdown}`)
        .join("\n\n");

    return { text, totalPages: data.pages.length };
}

// ─── Gemini Extraction for a single Subject Section ───────────────────────────
async function extractSubjectSectionWithGemini(
    genAI: GoogleGenerativeAI,
    modelName: string,
    subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS",
    sectionText: string
): Promise<RawQuestion[]> {
    if (!sectionText.trim()) return [];

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
        },
    });

    const prompt = `You are an expert JEE exam extraction AI specializing in ${subject}.
Extract EVERY question from this ${subject} section of a JEE exam paper.
The text contains page markers "--- Page N ---".

Rules:
• Every question in this section belongs to ${subject}. Set "subject": "${subject}".
• Extract only what is printed. Never solve or infer answers.
• Printed answer → extract; else null.
• Printed solution → extract; else null.
• MCQ options → {"A":"…","B":"…","C":"…","D":"…"}; INTEGER type → options: null.
• hasVisual: true if the question references a figure/diagram/graph/image or circuit.
• pageNumber: use the "--- Page N ---" marker where the question appears.

JSON schema (return ONLY an array of these objects):
[{
  "questionNumber": 1,
  "subject": "${subject}",
  "questionType": "MCQ"|"INTEGER",
  "questionText": "…",
  "options": {"A":"..","B":"..","C":"..","D":".."} | null,
  "correctAnswer": "A"|"42"|null,
  "solutionText": "…"|null,
  "hasVisual": false,
  "pageNumber": 3
}]

--- ${subject} SECTION START ---
${sectionText}
--- ${subject} SECTION END ---`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleaned = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
            if (!cleaned || cleaned === "[]") {
                console.warn(`⚠️ [${subject}] Gemini returned empty content on attempt ${attempt}`);
                return [];
            }

            const json = JSON.parse(cleaned);
            if (!Array.isArray(json)) {
                console.warn(`⚠️ [${subject}] Gemini returned non-array JSON on attempt ${attempt}`);
                return [];
            }
            console.log(`✅ [${subject}] Extracted ${json.length} questions from section (${sectionText.length} chars)`);
            return (json as RawQuestion[]).map(q => ({ ...q, subject }));
        } catch (err: any) {
            console.error(`❌ [${subject}] Gemini extraction attempt ${attempt}/2 failed: ${err.message}`);
            if (attempt === 2) return [];
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return [];
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

// ─── MAIN PIPELINE: Section-Split Parallel Extraction ─────────────────────────
export async function runExtraction(paperId: string) {
    const t0 = Date.now();
    console.log(`\n🚀 EXTRACTION PIPELINE: Starting extraction for paper ${paperId}`);

    const paper = await prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) throw new Error("Paper not found");

    const mistralKey = process.env.MISTRAL_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

    if (!mistralKey || !geminiKey) {
        throw new Error("Missing MISTRAL_API_KEY or GEMINI_API_KEY");
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const supabase = await createClient();

    // 1. Mark paper as EXTRACTING
    await prisma.paper.update({ where: { id: paperId }, data: { status: "EXTRACTING" } });

    // 2. Download PDF
    const t1 = Date.now();
    const fileName = paper.sourcePdfUrl.substring(paper.sourcePdfUrl.lastIndexOf("/") + 1);
    const { data: fileBlob, error: dlErr } = await supabase.storage.from("papers").download(fileName);
    if (dlErr) throw new Error("PDF download failed: " + dlErr.message);
    const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
    console.log(`📥 Downloaded PDF: ${(pdfBuffer.length / 1024).toFixed(0)}KB in ${Date.now() - t1}ms`);

    // 3. Mistral OCR (~5 sec whole document page-aware markdown)
    const t2 = Date.now();
    console.log(`🖼️  Running Mistral OCR for page-aware markdown…`);
    const { text: pageAwareText, totalPages } = await mistralDocumentOcr(mistralKey, pdfBuffer);
    console.log(`✅ Mistral OCR complete: ${totalPages} pages in ${Date.now() - t2}ms`);

    if (pageAwareText.length < 50) {
        throw new Error("Could not extract readable text from this PDF.");
    }

    // 4. LOCAL Section Splitter: Mathematics, Physics, Chemistry
    const { questionsText } = preprocessMarkdown(pageAwareText);
    const sections: SubjectSection[] = splitBySubjectSections(questionsText);
    console.log(`✂️  LOCAL section splitter created ${sections.length} subject sections:`);
    for (const sec of sections) {
        console.log(`   - ${sec.subject}: ${sec.text.length} chars`);
    }

    // 5. Parallel Gemini Calls for Mathematics, Physics, Chemistry
    const t3 = Date.now();
    console.log(`🧠 Firing ${sections.length} parallel Gemini calls using "${modelName}"…`);

    const sectionPromises = sections.map(sec =>
        extractSubjectSectionWithGemini(genAI, modelName, sec.subject, sec.text)
    );
    const sectionResults = await Promise.all(sectionPromises);
    console.log(`✅ Gemini parallel calls finished in ${Date.now() - t3}ms`);

    // 6. Merge JSON
    const mergedRawQuestions: RawQuestion[] = sectionResults.flat().filter(q => q.questionText?.trim());
    console.log(`📦 Merged JSON: ${mergedRawQuestions.length} total questions extracted.`);

    if (mergedRawQuestions.length === 0) {
        throw new Error("Extraction produced 0 questions; refusing to save.");
    }

    // 7. Render ONLY Visual Pages
    const t4 = Date.now();
    const visualPageSet = new Set<number>();
    for (const q of mergedRawQuestions) {
        if (q.hasVisual) {
            const p = q.pageNumber ? Math.min(Math.max(q.pageNumber, 1), totalPages) : null;
            if (p) visualPageSet.add(p);
        }
    }

    const neededPages = Array.from(visualPageSet);
    console.log(`🖼️  Rendering ${neededPages.length} visual page(s) out of ${totalPages} total pages…`);

    const pageUrlMap = new Map<number, string>();
    if (neededPages.length > 0) {
        const renderedPages = await renderPdfPages(pdfBuffer, neededPages, VISUAL_RENDER_SCALE);

        console.log(`🎨 Uploading ${renderedPages.size} visual page image(s) to Supabase Storage…`);
        for (const [pageNum, pngBase64] of renderedPages.entries()) {
            const url = await uploadVisualPage(pngBase64, supabase);
            if (url) {
                pageUrlMap.set(pageNum, url);
                console.log(`  ✅ Page ${pageNum} uploaded → ${url}`);
            }
        }
    }
    const visualMs = Date.now() - t4;

    // Attach imageUrl to questions with visuals
    let visualsAttached = 0;
    const dbQuestions = mergedRawQuestions.map(q => {
        let imageUrl: string | null = null;
        if (q.hasVisual && q.pageNumber && pageUrlMap.has(q.pageNumber)) {
            imageUrl = pageUrlMap.get(q.pageNumber)!;
            visualsAttached++;
        }
        return mapQuestionToDbRow(q, paperId, imageUrl);
    });

    // 8. DB: Save questions & publish paper
    const t5 = Date.now();
    await prisma.$transaction(async (tx) => {
        await tx.question.deleteMany({ where: { paperId } });
        await tx.question.createMany({ data: dbQuestions });
        await tx.paper.update({ where: { id: paperId }, data: { status: "PUBLISHED" } });
    });
    const dbMs = Date.now() - t5;

    const totalMs = Date.now() - t0;
    console.log(`\n🎉 EXTRACTION & PUBLISH COMPLETE:`);
    console.log(`   Total Questions:  ${dbQuestions.length}`);
    console.log(`   Visual Questions: ${visualsAttached}/${neededPages.length} pages`);
    console.log(`   DB Transaction:   ${dbMs}ms`);
    console.log(`   Total Time:       ${totalMs}ms`);
    console.log(`   NTA Mock Ready:   ✅ YES\n`);

    return {
        success: true,
        count: dbQuestions.length,
        visualsExtracted: visualsAttached,
        timeMs: totalMs,
    };
}

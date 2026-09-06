# PDF Extraction & Filtering Pipeline — Task Breakdown

This file tracks all work needed to make the ingestion pipeline production-ready:
upload → mistral OCR → local section splitter (Math, Physics, Chem) → 3 parallel Gemini calls → merge JSON → render visual pages → DB → NTA Mock.

---

## Architecture Implemented

```
PDF
 ↓
Mistral OCR
 ↓
page-aware Markdown
 ↓
LOCAL section splitter
 ↓
┌────────────┬────────────┬────────────┐
│ Mathematics│  Physics   │ Chemistry  │
└─────┬──────┴─────┬──────┴─────┬──────┘
      ↓            ↓            ↓
   Gemini       Gemini       Gemini
      └────────────┼────────────┘
                   ↓
              merge JSON
                   ↓
         render only visual pages
                   ↓
                  DB
                   ↓
                NTA Mock
```

1. **Mistral OCR** — Universally handles all PDFs (text and scanned) and converts them into Page-Aware Markdown (`--- Page N ---` markers + preserving LaTeX) in ~5 sec.
2. **Local Preprocessor & Section Splitter** — A TypeScript module (`lib/jee-parser.ts`) that isolates answer keys and splits the document into 3 core subject sections: **Mathematics**, **Physics**, and **Chemistry**.
3. **3 Parallel Gemini Workers** — Fires 3 concurrent `@google/generative-ai` calls (`gemini-1.5-pro` / `gemini-1.5-flash`), with each model instance specialized on its subject's section text.
4. **Merge JSON** — Flattens and unifies the extracted structured questions from all three subject sections.
5. **Render ONLY Visual Pages** — Queries the merged questions for `hasVisual: true`, collects the unique `pageNumber`s, renders ONLY those specific PDF pages using `pdfjs-dist` + `@napi-rs/canvas`, and uploads them to Supabase Storage.
6. **DB Transaction** — Saves the entire verified, visual-mapped question set in a single Prisma transaction and marks the paper `PUBLISHED`.
7. **NTA Mock** — Paper is immediately available for students with full subject grouping, math/chemistry formulas, and diagram visuals!

---

## Tasks Completed ✅

### Task E-1 — Universal Mistral OCR Integration ✅
- **Files:** `lib/run-extraction.ts`, `app/api/extract/route.ts`
- **Action:** Universal single-call OCR using `mistral-ocr-latest`.
- **Result:** Fast (~5 sec) guaranteed clean "Page-Aware Markdown" output with preserved LaTeX math.

### Task E-2 — LOCAL Section Splitter (Math, Physics, Chemistry) ✅
- **File:** `lib/jee-parser.ts`
- **Action:** Created `splitBySubjectSections` to identify Physics, Chemistry, and Mathematics section boundaries and carry forward `--- Page N ---` markers.
- **Result:** Separates the document into 3 clean, dedicated subject sections.

### Task E-3 — 3-Way Parallel Gemini Extraction ✅
- **Files:** `lib/run-extraction.ts`, `app/api/extract/route.ts`
- **Action:** Dispatches 3 parallel Gemini calls specialized for Mathematics, Physics, and Chemistry.
- **Result:** High-accuracy, concurrent structured extraction of MCQ and Integer type questions with guaranteed subject assignment.

### Task E-4 — Merge JSON & Render ONLY Visual Pages ✅
- **File:** `lib/run-extraction.ts`
- **Action:** Merges the 3 JSON results, isolates pages with visual diagrams, renders only those pages via `pdfjs-dist`, and uploads them to Supabase Storage.
- **Result:** Minimizes rendering and upload overhead by rendering only necessary pages.

### Task E-5 — Instant NTA Mock Availability ✅
- **Files:** `components/mock-exam-engine.tsx`, `app/dashboard/page.tsx`
- **Action:** Complete DB write and instant transition to `PUBLISHED`.
- **Result:** Clean, complete test engine ready for full JEE NTA mock simulations.

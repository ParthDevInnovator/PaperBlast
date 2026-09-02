# PDF Extraction & Filtering Pipeline — Task Breakdown

This file tracks all work needed to make the ingestion pipeline production-ready:
upload → raw extract → smart filter → structured question rows → review.

---

## The Problem
1. **`pdf is not a function`** — `require("pdf-parse")` inside a Next.js 16 Server Action
   returns the module object, not the callable function. Turbopack/ESM bundling breaks
   CommonJS default exports.
2. **Naive chunking** — The current regex `split(/Q\s*\d+/...)` just blindly splits on
   every number-looking token. JEE PDFs contain cover pages, instructions, tables, and
   answer keys that pollute the question bank with junk rows.
3. **No filtering** — All raw chunks go straight to the DB. Reviewers see garbage rows
   mixed with real questions.

---

## Task E-1 — Fix `pdf-parse` import (Bundler Compatibility) ✅ → DO FIRST

**File:** `app/api/extract/route.ts` (new API route, replaces server action for parsing)

**Root cause:** `require("pdf-parse")` inside App Router Server Actions gets bundled by
Turbopack under ESM rules. `pdf-parse` exposes its callable via `module.exports = fn`,
so `require()` returns the function directly in plain Node — but Turbopack wraps it as
`{ default: fn }`.

**Fix strategy:** Move PDF parsing out of the Server Action into a dedicated
**API Route** (`route.ts`). API Routes run in the Node.js runtime and handle CommonJS
interop correctly. The Server Action becomes a thin orchestrator that calls this API route.

**Steps:**
- [x] Create `app/api/extract/route.ts` — POST handler that:
  1. Receives `paperId` in the JSON body
  2. Downloads the PDF from Supabase Storage (server-side)
  3. Calls `pdf-parse` correctly with the CJS interop fix
  4. Returns raw extracted text + structured question array as JSON
- [x] Update `app/dashboard/actions.ts` → `extractPaperAction` to call
  `/api/extract` via `fetch()` instead of running `pdf-parse` inline
- [x] Remove `require("pdf-parse")` from the Server Action entirely

**CJS interop fix pattern:**
```ts
// In route.ts (Node.js runtime — safe)
import pdfParseMod from "pdf-parse"
const pdfParse = (typeof pdfParseMod === "function"
  ? pdfParseMod
  : (pdfParseMod as any).default) as typeof pdfParseMod
const data = await pdfParse(buffer)
```

---

## Task E-2 — Smart JEE-Aware Text Chunker ✅ → DO SECOND

**File:** `lib/jee-parser.ts` (new utility — pure function, easy to unit test)

**Goal:** Given the raw `string` from `pdf-parse`, return an array of structured
`RawQuestion` objects that are *highly likely* to be real questions and not junk.

### Step E-2a — Strip Irrelevant Sections
Detect and discard blocks that match known JEE paper non-question regions:

| Pattern | Action |
|---|---|
| Lines containing "INSTRUCTIONS", "GENERAL", "Important Instructions" | Drop entire block |
| "Answer Key" / "Solutions" tables | Drop (we want Q only, not pre-printed answers) |
| Cover page blocks (NTA logo text, exam code, date/time header) | Drop |
| Short lines < 20 chars (page numbers, whitespace) | Drop |
| Lines that are purely numeric or `.` separated (answer grids) | Drop |

### Step E-2b — Question Boundary Detection
JEE Main papers follow a consistent structure. Use **multi-signal detection** (not a
single regex) to find question starts:

**Primary signal** — Line matches any of:
```
Q.1   Q1.   Q. 1   1.   1)   (1)   Question 1
```
Followed by at least 30 chars of text on the same or next line.

**Secondary signal** — Presence of option markers shortly after:
```
(A)  (B)  (C)  (D)   or   A.  B.  C.  D.
```
A chunk that contains both a number-start AND A/B/C/D options is a very strong MCQ signal.

**Integer type signal** — Chunk has a number-start, no (A)/(B) options, but ends with
a numeric-style answer hint pattern (e.g. "answer is ___" or just no options visible).

### Step E-2c — Structured Output
Each detected block is parsed into a `RawQuestion` shape:

```ts
type RawQuestion = {
  rawIndex: number          // position in paper (1-based)
  questionText: string      // cleaned question body
  options: {                // null if INTEGER type detected
    A: string; B: string; C: string; D: string
  } | null
  detectedType: "MCQ" | "INTEGER" | "UNKNOWN"
  confidence: "HIGH" | "LOW" // HIGH if both number + options found
}
```

**Filtering rule:** Only insert rows into DB where `confidence !== "LOW"` OR
`detectedType !== "UNKNOWN"`. Low-confidence rows are still inserted but flagged with
a "needs review" marker (stored as `isVerified: false` and `questionText` prefixed with
`[LOW CONFIDENCE] `).

---

## Task E-3 — API Route Implementation ✅ → DO THIRD

**File:** `app/api/extract/route.ts`

Full implementation of the POST handler using E-1 fix + E-2 parser:

```
POST /api/extract
Body: { paperId: string }
Auth: Must have valid Supabase session cookie

Flow:
1. Validate auth (createClient → getUser)
2. Fetch Paper record from Prisma
3. Guard: status must be PENDING
4. Set status → EXTRACTING
5. Download PDF buffer from Supabase Storage
6. Run pdf-parse → raw text
7. Run jeeParser(rawText) → RawQuestion[]
8. Filter: separate HIGH vs LOW confidence
9. Prisma.question.createMany() with mapped data
10. Set status → REVIEW
11. Return { success, total, highConf, lowConf }
```

---

## Task E-4 — Update `extractPaperAction` to Call the API Route ✅ → DO FOURTH

**File:** `app/dashboard/actions.ts`

Replace the inline `pdf-parse` call with a `fetch()` to `/api/extract`:

```ts
// In extractPaperAction:
const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/extract`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader },
  body: JSON.stringify({ paperId }),
})
```

The server action now only:
1. Validates the user session
2. Makes the internal API call
3. Handles the response / error state
4. Returns result to the client button

---

## Task E-5 — Surface Confidence in the Review Table ✅ → DO FIFTH

**File:** `components/review-table.tsx`

Add a **Confidence** column to the TanStack table:
- `HIGH` → green badge ✓
- `LOW` → amber badge ⚠️ with tooltip "Low confidence — auto-extracted, please verify"

This way reviewers immediately see which rows need extra attention without reading raw
text to figure it out.

Also add a **filter toggle** in the toolbar:
- "Show all" / "Show LOW confidence only" / "Show unverified only"

---

## Task E-6 — Idempotency Guard ✅ → DO SIXTH

**Problem:** User clicks "Extract" twice → duplicate question rows in DB.

**Fix in `app/api/extract/route.ts`:**
```ts
// At start of handler:
const existingCount = await prisma.question.count({ where: { paperId } })
if (existingCount > 0) {
  return Response.json({ error: "Already extracted. Go to Review." }, { status: 409 })
}
```

Also add a check in the `ExtractPaperButton` component to disable itself once the paper
status is no longer `PENDING`.

---

## Task E-7 — Error Logging Cleanup ✅ → DO LAST

**Problem:** Current code writes errors to `extract_error.log` on the filesystem — this
won't work in production (Vercel is stateless) and is a bad pattern.

**Fix:**
- Remove the `require('fs').writeFileSync(...)` call from `actions.ts`
- Log to `console.error` only (captured by Vercel log drain)
- Return structured error objects to the client with an `errorCode` field for easy
  debugging without exposing stack traces

---

## Execution Order

```
E-1  (Fix import)
  ↓
E-2  (Write jee-parser.ts)  ← can be done in parallel with E-1
  ↓
E-3  (Write /api/extract route)
  ↓
E-4  (Update server action)
  ↓
E-5  (Review table confidence column)
  ↓
E-6  (Idempotency guard)
  ↓
E-7  (Cleanup)
```

---

## Definition of Done
- [x] Clicking "Extract" on a PENDING paper runs without error
- [x] Raw text is correctly extracted from a JEE PDF
- [x] Cover page / instructions / answer key sections are NOT inserted as questions
- [x] MCQ questions have A/B/C/D correctly parsed into the `options` JSON field
- [x] INTEGER questions have `questionType: INTEGER` and `options: null`
- [x] Low-confidence chunks are still inserted but visually flagged in the review table
- [x] Double-clicking "Extract" does not create duplicates
- [x] No filesystem writes (`fs.writeFileSync`) remain in the codebase

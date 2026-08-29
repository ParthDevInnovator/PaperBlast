# JEE Mock Test Platform - Task Breakdown

This document breaks down the PRD into actionable development tasks mapped to our implementation phases.

## Phase 1: Foundation & Project Setup
*   [ ] **Task 1.1: Next.js Initialization**
    *   Initialize Next.js 14 App Router project with TypeScript, ESLint, and Tailwind CSS.
    *   Set up `shadcn/ui` components library for rapid, clean component development.
*   [ ] **Task 1.2: Database schema & ORM**
    *   Install Prisma and configure connection to Supabase PostgreSQL.
    *   Implement the schema defined in the PRD (User, Paper, Question, Mock, MockQuestion, AttemptAnswer).
    *   Push initial migration to db.
*   [ ] **Task 1.3: Supabase Authentication**
    *   Set up Supabase Auth client-side and server-side logic (@supabase/ssr).
    *   Create login/signup pages.
    *   Implement Next.js Middleware to protect routes (`/admin/*` for ADMIN role, `/mock/*` and `/dashboard` for STUDENT).
*   [ ] **Task 1.4: Supabase Storage Configuration**
    *   Create a bucket in Supabase for `papers`.
    *   Add RLS (Row Level Security) policies (Admin upload, Student read-only for future PDF preview usage).

## Phase 2: Admin Ingestion Pipeline
*   [ ] **Task 2.1: Admin Papers Dashboard**
    *   Build `/admin/papers` view to list existing papers (PENDING, EXTRACTING, REVIEW, PUBLISHED).
    *   Create the PDF upload modal/form.
*   [ ] **Task 2.2: PDF Upload Logic**
    *   Create an API route/Server Action to handle PDF upload to Supabase Storage.
    *   Create the `Paper` database record (`status: PENDING`).
*   [ ] **Task 2.3: Node-based PDF Extractor**
    *   Install `pdf-parse`.
    *   Create `/api/extract` route to fetch PDF from Storage, parse raw text, and run initial regex heuristics to split the text into raw `Question` database rows.
    *   Update Paper status to `REVIEW`.
*   [ ] **Task 2.4: Admin Review Screen (The Core Tool)**
    *   Install React Table (`@tanstack/react-table`).
    *   Build `/admin/papers/[id]` with a data table capable of inline editing for: Subject, Question Text, Options, Correct Answer, Solution Text.
    *   Include an integrated PDF viewer (`react-pdf`) as a side-panel for the admin to reference while verifying.
*   [ ] **Task 2.5: Publish Logic**
    *   Implement row-level "Mark Verified" toggles.
    *   Implement "Publish" action asserting all questions are verified and cleanly formatted.

## Phase 3: Student Mock Engine
*   [ ] **Task 3.1: Student Dashboard**
    *   Build `/dashboard` showing standard list of `PUBLISHED` papers available to take.
    *   Display past mock attempts and scores.
*   [ ] **Task 3.2: Mock Generation Logic**
    *   Create API endpoint `/api/mocks/generate`.
    *   Implement shuffling logic: Group by Subject -> Shuffle -> Map to `MockQuestion` + pre-fill nullable `AttemptAnswer`.
    *   Handle Prisma transaction to create the `Mock` payload securely.
*   [ ] **Task 3.3: Mock Exam UI Layout**
    *   Build the main `/mock/[id]` page layout (fixed top bar with timer, main question window, right-hand side navigation grid).
    *   Implement visual question states (Unattempted, Attempted, Marked for Review).
*   [ ] **Task 3.4: Client-side Engine**
    *   Implement 3-hour local countdown timer.
    *   Handle client-side answer state (save directly to `localStorage` to survive accidental refreshes).
*   [ ] **Task 3.5: Progress Syncing**
    *   Build `/api/attempt` API for background syncing.
    *   Implement debounced API calls hitting the backend every 60s or on specific navigation events.

## Phase 4: Auto-Grading & Review
*   [ ] **Task 4.1: Mock Submission & Auto-grading API**
    *   Create `/api/mocks/submit` endpoint.
    *   Implement NTA Grading logic:
        *   Join user `AttemptAnswer` vs verified `Question.correctAnswer`.
        *   Apply `+4/-1` rule for MCQ.
        *   Apply `+4/0` rule for INTEGER.
    *   Calculate raw score and mark mock as `submittedAt: now()`.
*   [ ] **Task 4.2: Review Result View**
    *   Build `/review/[id]` screen to read completed mocks.
    *   Show Subject-wise analysis cards (Physics Score, Chem Score, Math Score).
*   [ ] **Task 4.3: Solution Reveal UI**
    *   Build an interface that shows User Answer side-by-side with Correct Answer.
    *   Un-hide and render `solutionText`.

# Product Requirements Document (PRD): JEE Mock Test Platform MVP

## 1. Project Overview & Objective
An open-mode practice platform for JEE Main candidates. The platform ingests official JEE previous-year papers (PDFs) and transforms them into a randomized, gradable question bank. This solves the core problem of standard PDFs having solutions embedded within them, allowing students to take true timed mocks without accidentally spoiling the answers.

## 2. Target Audience & Scope
*   **Target Audience:** JEE Main aspirants looking to practice past papers as timed, simulated mock tests.
*   **MVP Scope:** 
    *   Support for JEE Main format only (Single Option Correct MCQs and Integer Type questions). Multi-select is deferred to v2.
    *   Platform is multi-user from day one.
    *   PDF Extraction is handled within the main Node.js process using `pdf-parse`.
    *   No automatic image/diagram extraction for MVP; text-only questions initially (with schema support to add diagrams manually or in v2).

## 3. Technology Stack
*   **Frontend/Backend:** Next.js 14+ (App Router) — Vercel Deployment.
*   **Database:** PostgreSQL (via Supabase).
*   **ORM:** Prisma.
*   **Auth:** Supabase Auth (Email/Password, mapping to `public.User`).
*   **Storage:** Supabase Storage (for storing raw JEE PDF files).
*   **PDF Extraction:** `pdf-parse` running in a server action or API route.
*   **Styling Component Library:** Tailwind CSS + shadcn/ui.

## 4. User Roles & Core Workflows

### 4.1 Admin Workflows (The Ingestion Pipeline)
1.  **Upload:** Admin uploads an official JEE past paper PDF. It goes to Supabase Storage, and a `Paper` record is created (`status: PENDING`).
2.  **Extraction Trigger:** Admin triggers extraction. Node.js backend uses `pdf-parse` to extract raw text and splits it into potential questions using regex rules (`status: EXTRACTING`).
3.  **Review Screen (The Core Admin UX):** A spreadsheet-like view (TanStack Table) where the Admin cleans up the raw text extraction. 
    *   Assigns `Subject` (Physics, Chemistry, Math).
    *   Corrects `questionText`, `options`, `correctAnswer`, `solutionText`.
    *   Marks each question as `isVerified`.
4.  **Publish:** Once all questions are marked `isVerified`, the paper transitions to `status: PUBLISHED` and becomes available for mocks.

### 4.2 Student Workflows
1.  **Dashboard:** Shows published past papers available for attempt, alongside historical attempts and scores.
2.  **Mock Generation:** 
    *   When a student starts a mock, the system takes all verified questions for that paper.
    *   Questions are grouped by subject and shuffled randomly so the display order is unique for this attempt.
3.  **Timed Attempt UI:** 
    *   3-hour countdown timer (180 mins).
    *   Side navigation grid (e.g., 90 slots) to jump between questions.
    *   Solutions/correct answers are strictly hidden/omitted from API responses during the attempt.
    *   Answers auto-save to `localStorage` + periodic background DB syncing via API.
4.  **Submission & Review:** 
    *   Auto-grading runs upon timer expiry or manual submission.
    *   Student is redirected to a Review screen where they can see standard NTA scoring, subject-wise breakdown, and full solutions.

## 5. Scoring & Business Logic (NTA Scheme)
*   **MCQ (Single Correct Option):**
    *   Correct Answer: +4 marks
    *   Incorrect Answer: -1 mark
    *   Unattempted: 0 marks
*   **Integer Type (Numerical Value):**
    *   Correct Answer: +4 marks
    *   Incorrect Answer: 0 marks (No negative marking)
    *   Unattempted: 0 marks

## 6. Draft Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id // Maps directly to Supabase auth.users.id
  email     String   @unique
  name      String
  role      Role     @default(STUDENT)
  mocks     Mock[]
  createdAt DateTime @default(now())
}

enum Role { STUDENT ADMIN }

model Paper {
  id           String      @id @default(cuid())
  title        String
  year         Int
  sourcePdfUrl String
  status       PaperStatus @default(PENDING)
  questions    Question[]
  mocks        Mock[]
  createdAt    DateTime    @default(now())
}

enum PaperStatus { PENDING EXTRACTING REVIEW PUBLISHED }

model Question {
  id            String       @id @default(cuid())
  paperId       String
  paper         Paper        @relation(fields: [paperId], references: [id], onDelete: Cascade)
  subject       Subject
  questionText  String
  imageUrl      String?      // Nullable, for MVP text-only fallback
  options       Json?        // e.g. { "A": "...", "B": "..." }. Nullable for Integer type
  correctAnswer String       // Can hold option key ("A") or stringified integer ("42")
  questionType  QuestionType @default(MCQ)
  solutionText  String?
  isVerified    Boolean      @default(false)
  mockQuestions MockQuestion[]
}

enum Subject { PHYSICS CHEMISTRY MATHEMATICS }
enum QuestionType { MCQ INTEGER }

model Mock {
  id            String         @id @default(cuid())
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  paperId       String
  paper         Paper          @relation(fields: [paperId], references: [id], onDelete: Cascade)
  startedAt     DateTime       @default(now())
  submittedAt   DateTime?
  durationMins  Int            @default(180)
  score         Float?
  mockQuestions MockQuestion[]
}

model MockQuestion {
  id            String         @id @default(cuid())
  mockId        String
  mock          Mock           @relation(fields: [mockId], references: [id], onDelete: Cascade)
  questionId    String
  question      Question       @relation(fields: [questionId], references: [id], onDelete: Cascade)
  displayOrder  Int
  attemptAnswer AttemptAnswer?
}

model AttemptAnswer {
  id             String       @id @default(cuid())
  mockQuestionId String       @unique
  mockQuestion   MockQuestion @relation(fields: [mockQuestionId], references: [id], onDelete: Cascade)
  selectedAnswer String?      // Student's response
  isCorrect      Boolean?     // Populated strictly post-submission
}
```

## 7. Implementation Phases
*   **Phase 1: Project Scaffolding & DB Setup** (Next.js config, Prisma setup, Supabase connection)
*   **Phase 2: Admin Ingestion Pipeline** (Upload PDF, Node-based `pdf-parse`, basic chunking logic, TanStack Review UI)
*   **Phase 3: Student Mock Engine** (Dashboard, attempt generation logic with reshuffling, UI for hiding answers, local autosaving)
*   **Phase 4: Auto-Grading & Review View** (Calculating NTA scores, displaying detailed solutions, polishing UI)

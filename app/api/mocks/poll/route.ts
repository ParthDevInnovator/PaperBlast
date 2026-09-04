import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

// This endpoint lets the mock exam engine poll for newly extracted questions
// that weren't available when the mock was generated.
export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const mockId = req.nextUrl.searchParams.get("mockId")
    if (!mockId) return NextResponse.json({ error: "mockId required" }, { status: 400 })

    const mock = await prisma.mock.findUnique({
        where: { id: mockId },
        include: { mockQuestions: { select: { questionId: true } } },
    })

    if (!mock || mock.userId !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (mock.submittedAt) {
        return NextResponse.json({ newQuestions: [], done: true })
    }

    // Find paper questions that aren't yet in the mock
    const existingQIds = new Set(mock.mockQuestions.map(mq => mq.questionId))
    const currentMaxOrder = mock.mockQuestions.length

    const allPaperQuestions = await prisma.question.findMany({
        where: { paperId: mock.paperId },
        select: {
            id: true,
            subject: true,
            questionType: true,
            questionText: true,
            options: true,
            imageUrl: true,
        },
    })

    const newQuestions = allPaperQuestions.filter(q => !existingQIds.has(q.id))

    if (newQuestions.length === 0) {
        // Check if paper is done extracting
        const paper = await prisma.paper.findUnique({
            where: { id: mock.paperId },
            select: { status: true },
        })
        const done = paper?.status !== "EXTRACTING"
        return NextResponse.json({ newQuestions: [], done })
    }

    // Add new questions to the mock + create empty attempt answers
    const added = await prisma.$transaction(async (tx) => {
        // Group new questions by subject for proper ordering
        const ordered = [
            ...newQuestions.filter(q => q.subject === "PHYSICS"),
            ...newQuestions.filter(q => q.subject === "CHEMISTRY"),
            ...newQuestions.filter(q => q.subject === "MATHEMATICS"),
        ]

        const mockQuestionData = ordered.map((q, i) => ({
            mockId,
            questionId: q.id,
            displayOrder: currentMaxOrder + i + 1,
        }))

        await tx.mockQuestion.createMany({ data: mockQuestionData })

        // Fetch the created mock questions to get their IDs
        const createdMqs = await tx.mockQuestion.findMany({
            where: {
                mockId,
                questionId: { in: ordered.map(q => q.id) },
            },
            include: {
                question: {
                    select: {
                        id: true,
                        subject: true,
                        questionType: true,
                        questionText: true,
                        options: true,
                        imageUrl: true,
                    },
                },
            },
            orderBy: { displayOrder: "asc" },
        })

        // Create empty AttemptAnswer rows
        await tx.attemptAnswer.createMany({
            data: createdMqs.map(mq => ({
                mockQuestionId: mq.id,
                selectedAnswer: null,
                isCorrect: null,
            })),
        })

        return createdMqs.map(mq => ({
            mockQuestionId: mq.id,
            questionId: mq.question.id,
            displayOrder: mq.displayOrder,
            subject: mq.question.subject,
            questionType: mq.question.questionType,
            questionText: mq.question.questionText,
            options: mq.question.options,
            imageUrl: mq.question.imageUrl,
            savedAnswer: null,
        }))
    })

    const paper = await prisma.paper.findUnique({
        where: { id: mock.paperId },
        select: { status: true },
    })

    return NextResponse.json({
        newQuestions: added,
        done: paper?.status !== "EXTRACTING",
    })
}

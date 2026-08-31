import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { paperId } = body

    if (!paperId) {
        return NextResponse.json({ error: "paperId is required" }, { status: 400 })
    }

    // Validate paper is published
    const paper = await prisma.paper.findUnique({
        where: { id: paperId },
        include: {
            questions: {
                where: { isVerified: true },
            },
        },
    })

    if (!paper) {
        return NextResponse.json({ error: "Paper not found" }, { status: 404 })
    }

    if (paper.status !== "PUBLISHED") {
        return NextResponse.json({ error: "Paper is not published yet" }, { status: 400 })
    }

    if (paper.questions.length === 0) {
        return NextResponse.json({ error: "No verified questions available" }, { status: 400 })
    }

    // Group by subject, then interleave: Physics, Chemistry, Mathematics
    const grouped: Record<string, typeof paper.questions> = {
        PHYSICS: [],
        CHEMISTRY: [],
        MATHEMATICS: [],
    }

    for (const q of paper.questions) {
        grouped[q.subject].push(q)
    }

    // Shuffle each subject group
    const shuffled = (arr: typeof paper.questions) =>
        arr.sort(() => Math.random() - 0.5)

    const ordered = [
        ...shuffled(grouped.PHYSICS),
        ...shuffled(grouped.CHEMISTRY),
        ...shuffled(grouped.MATHEMATICS),
    ]

    // Create Mock + MockQuestion rows in one Prisma transaction
    const mock = await prisma.$transaction(async (tx) => {
        const newMock = await tx.mock.create({
            data: {
                userId: user.id,
                paperId,
                durationMins: 180,
            },
        })

        const mockQuestions = ordered.map((q, index) => ({
            mockId: newMock.id,
            questionId: q.id,
            displayOrder: index + 1,
        }))

        await tx.mockQuestion.createMany({ data: mockQuestions })

        // Pre-create empty AttemptAnswer rows so we can UPSERT later
        const createdMqs = await tx.mockQuestion.findMany({
            where: { mockId: newMock.id },
            select: { id: true },
        })

        await tx.attemptAnswer.createMany({
            data: createdMqs.map((mq) => ({
                mockQuestionId: mq.id,
                selectedAnswer: null,
                isCorrect: null,
            })),
        })

        return newMock
    })

    return NextResponse.json({ mockId: mock.id })
}

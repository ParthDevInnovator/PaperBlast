import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { mockId } = await req.json()
        if (!mockId) return NextResponse.json({ error: "Missing mockId" }, { status: 400 })

        const mock = await prisma.mock.findUnique({
            where: { id: mockId },
            include: {
                mockQuestions: {
                    include: {
                        question: true,
                        attemptAnswer: true,
                    },
                },
            },
        })

        if (!mock) return NextResponse.json({ error: "Mock not found" }, { status: 404 })
        if (mock.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        if (mock.submittedAt) return NextResponse.json({ error: "Already submitted" }, { status: 400 })

        let score = 0
        const updates: any[] = []

        for (const mq of mock.mockQuestions) {
            const correctAnswer = mq.question.correctAnswer
            const selectedAnswer = mq.attemptAnswer?.selectedAnswer

            let isCorrect: boolean | null = null
            if (selectedAnswer !== null && selectedAnswer !== undefined) {
                // Ensure strict string match for options / integer
                isCorrect = String(selectedAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()

                if (isCorrect) {
                    score += 4
                } else {
                    if (mq.question.questionType === "MCQ") {
                        score -= 1
                    }
                }

                if (mq.attemptAnswer) {
                    updates.push(
                        prisma.attemptAnswer.update({
                            where: { id: mq.attemptAnswer.id },
                            data: { isCorrect },
                        })
                    )
                }
            }
        }

        await prisma.$transaction([
            ...updates,
            prisma.mock.update({
                where: { id: mockId },
                data: {
                    score,
                    submittedAt: new Date()
                }
            })
        ])

        return NextResponse.json({ mockId })
    } catch (e: any) {
        console.error("Submit API error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

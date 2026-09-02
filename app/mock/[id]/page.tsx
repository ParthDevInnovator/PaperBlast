import { notFound, redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { MockExamEngine } from "@/components/mock-exam-engine"

export default async function MockPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect("/auth/login")

    const mock = await prisma.mock.findUnique({
        where: { id },
        include: {
            paper: { select: { title: true, year: true } },
            mockQuestions: {
                orderBy: { displayOrder: "asc" },
                include: {
                    question: {
                        select: {
                            id: true,
                            subject: true,
                            questionType: true,
                            questionText: true,
                            options: true,
                        },
                    },
                    attemptAnswer: { select: { selectedAnswer: true } },
                },
            },
        },
    })

    if (!mock) return notFound()
    if (mock.userId !== user.id) return notFound() // Security: users can only see their own mocks

    // If already submitted, redirect to results
    if (mock.submittedAt) {
        return redirect(`/results/${mock.id}`)
    }

    const questions = mock.mockQuestions.map((mq) => ({
        mockQuestionId: mq.id,
        questionId: mq.question.id,
        displayOrder: mq.displayOrder,
        subject: mq.question.subject as "PHYSICS" | "CHEMISTRY" | "MATHEMATICS",
        questionType: mq.question.questionType as "MCQ" | "INTEGER",
        questionText: mq.question.questionText,
        options: mq.question.options as Record<string, string> | null,
        savedAnswer: mq.attemptAnswer?.selectedAnswer ?? null,
    }))

    return (
        <MockExamEngine
            mockId={mock.id}
            questions={questions}
            durationMins={mock.durationMins}
            startedAt={mock.startedAt.toISOString()}
        />
    )
}

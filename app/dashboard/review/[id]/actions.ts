"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { Subject, QuestionType } from "@prisma/client"

export async function updateQuestionAction(
    questionId: string,
    data: {
        subject?: string
        questionText?: string
        correctAnswer?: string
        questionType?: string
        solutionText?: string
        options?: Record<string, string>
    }
) {
    await prisma.question.update({
        where: { id: questionId },
        data: {
            subject: data.subject as Subject | undefined,
            questionText: data.questionText,
            correctAnswer: data.correctAnswer,
            questionType: data.questionType as QuestionType | undefined,
            solutionText: data.solutionText,
            options: data.options,
        },
    })

    revalidatePath(`/dashboard/review`)
    return { success: true }
}

export async function toggleVerifiedAction(questionId: string, current: boolean) {
    await prisma.question.update({
        where: { id: questionId },
        data: { isVerified: !current },
    })
    revalidatePath(`/dashboard/review`)
    return { success: true }
}

export async function deleteQuestionAction(questionId: string) {
    await prisma.question.delete({ where: { id: questionId } })
    revalidatePath(`/dashboard/review`)
    return { success: true }
}

export async function publishPaperAction(paperId: string) {
    // Check all questions are verified
    const unverified = await prisma.question.count({
        where: { paperId, isVerified: false },
    })

    if (unverified > 0) {
        return { error: `${unverified} questions are still unverified. Verify all before publishing.` }
    }

    await prisma.paper.update({
        where: { id: paperId },
        data: { status: "PUBLISHED" },
    })

    revalidatePath("/dashboard")
    return { success: true }
}

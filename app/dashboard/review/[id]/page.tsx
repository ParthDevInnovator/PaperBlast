import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { ReviewTable } from "@/components/review-table"
import { publishPaperAction } from "./actions"

export default async function ReviewPage({
    params,
}: {
    params: { id: string }
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return redirect("/auth/login")

    const paper = await prisma.paper.findUnique({
        where: { id: params.id },
        include: {
            questions: {
                orderBy: { createdAt: "asc" },
            },
        },
    })

    if (!paper) return notFound()

    if (paper.status === "PENDING") {
        return redirect(`/dashboard`)
    }

    const questions = paper.questions.map((q) => ({
        id: q.id,
        subject: q.subject,
        questionType: q.questionType,
        questionText: q.questionText,
        correctAnswer: q.correctAnswer,
        solutionText: q.solutionText,
        isVerified: q.isVerified,
    }))

    const verifiedCount = questions.filter((q) => q.isVerified).length
    const allVerified = verifiedCount === questions.length && questions.length > 0

    return (
        <div className="flex bg-background min-h-screen flex-col dark">
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-border px-6 py-3 flex items-center justify-between bg-background/80 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                        ← Dashboard
                    </Link>
                    <div className="w-px h-4 bg-border" />
                    <div>
                        <h1 className="text-base font-semibold text-foreground leading-tight truncate max-w-md">
                            {paper.title}
                        </h1>
                        <p className="text-xs text-muted-foreground">{paper.year} · {questions.length} questions</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {paper.status === "PUBLISHED" ? (
                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-green-500/15 text-green-500">
                            ✓ Published
                        </span>
                    ) : (
                        <form
                            action={async () => {
                                "use server"
                                await publishPaperAction(paper.id)
                            }}
                        >
                            <button
                                type="submit"
                                disabled={!allVerified}
                                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {allVerified
                                    ? "🚀 Publish Paper"
                                    : `Verify all (${verifiedCount}/${questions.length}) to publish`}
                            </button>
                        </form>
                    )}
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
                {paper.status === "EXTRACTING" ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                        <div className="text-center">
                            <p className="text-2xl mb-2">⚡</p>
                            <p className="animate-pulse">Extraction in progress…</p>
                        </div>
                    </div>
                ) : questions.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                        <div className="text-center">
                            <p>No questions extracted yet.</p>
                            <Link href="/dashboard" className="text-primary hover:underline text-sm mt-2 block">
                                Go back and run extraction
                            </Link>
                        </div>
                    </div>
                ) : (
                    <ReviewTable questions={questions} paperId={paper.id} />
                )}
            </main>
        </div>
    )
}

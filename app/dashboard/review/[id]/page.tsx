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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect("/auth/login")

    const paper = await prisma.paper.findUnique({
        where: { id: params.id },
        include: { questions: { orderBy: { id: "asc" } } },
    })

    if (!paper) return notFound()
    if (paper.status === "PENDING") return redirect("/dashboard")

    type QuestionRow = { id: string; subject: string; questionType: string; questionText: string; correctAnswer: string; solutionText: string | null; isVerified: boolean }
    const questions: QuestionRow[] = paper.questions.map((q) => ({
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
        <div className="flex bg-[#09090b] min-h-screen flex-col dark relative">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="hero-grid absolute inset-0" />
                <div className="absolute w-[500px] h-[500px] bg-violet-600/8 rounded-full blur-[120px] top-0 right-0" />
            </div>

            {/* Sticky Header */}
            <header className="sticky top-0 z-20 border-b border-white/[0.06] backdrop-blur-xl bg-black/40 px-6 py-3">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Breadcrumb */}
                        <Link href="/" className="flex items-center gap-1.5 group flex-shrink-0">
                            <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                <span className="text-black font-black text-[10px]">P</span>
                            </div>
                        </Link>
                        <span className="text-white/20 flex-shrink-0">/</span>
                        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors flex-shrink-0">
                            Dashboard
                        </Link>
                        <span className="text-white/20 flex-shrink-0">/</span>
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold text-white truncate">{paper.title}</h1>
                            <p className="text-xs text-zinc-600">{paper.year} · {questions.length} questions</p>
                        </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Progress pill */}
                        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.07] rounded-full px-3 py-1.5">
                            <span className={`font-bold ${allVerified ? "text-emerald-400" : "text-amber-400"}`}>{verifiedCount}</span>
                            <span className="text-zinc-600">/</span>
                            <span>{questions.length}</span>
                            <span className="text-zinc-600">verified</span>
                            <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden ml-1">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${allVerified ? "bg-emerald-500" : "bg-amber-500"}`}
                                    style={{ width: `${questions.length > 0 ? (verifiedCount / questions.length) * 100 : 0}%` }}
                                />
                            </div>
                        </div>

                        {/* Publish button */}
                        {paper.status === "PUBLISHED" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-400/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Published
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
                                    className="px-5 py-2 text-sm font-bold rounded-xl transition-all
                    bg-white text-black hover:bg-zinc-100 active:scale-95
                    shadow-[0_0_20px_rgba(255,255,255,0.12)]
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                                    title={!allVerified ? `Verify all questions to publish` : "Publish paper"}
                                >
                                    {allVerified ? "🚀 Publish Paper" : "Verify all to publish"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="relative z-10 flex-1 p-6 max-w-[1600px] mx-auto w-full">
                {paper.status === "EXTRACTING" ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="text-5xl mb-4 animate-bounce">⚡</div>
                            <p className="text-zinc-400 animate-pulse font-medium">Extraction in progress…</p>
                            <p className="text-xs text-zinc-600 mt-1">Refresh in a few seconds</p>
                        </div>
                    </div>
                ) : questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                        <div className="text-5xl mb-4">🔍</div>
                        <p className="text-zinc-300 font-bold mb-1">No questions extracted yet</p>
                        <Link href="/dashboard" className="text-sm text-blue-400 hover:underline mt-2">
                            ← Go back and run extraction
                        </Link>
                    </div>
                ) : (
                    <ReviewTable questions={questions} paperId={paper.id} />
                )}
            </main>
        </div>
    )
}

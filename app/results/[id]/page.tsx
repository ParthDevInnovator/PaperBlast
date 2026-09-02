import { notFound, redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Fragment } from "react"

function StatCard({ label, value, subtext, colorClass }: { label: string, value: number, subtext: string, colorClass: string }) {
    return (
        <div className={`p-6 rounded-2xl border bg-white/[0.02] backdrop-blur-xl ${colorClass}`}>
            <h3 className="text-sm font-semibold opacity-70 mb-2">{label}</h3>
            <div className="text-4xl font-black mb-1">{value}</div>
            <div className="text-xs opacity-60">{subtext}</div>
        </div>
    )
}

export default async function ResultsPage({ params }: { params: { id: string } }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect("/auth/login")

    const mock = await prisma.mock.findUnique({
        where: { id: params.id },
        include: {
            paper: { select: { title: true, year: true } },
            mockQuestions: {
                orderBy: { displayOrder: "asc" },
                include: {
                    question: true,
                    attemptAnswer: true,
                },
            },
        },
    })

    if (!mock) return notFound()
    if (mock.userId !== user.id) return notFound() // Security
    if (!mock.submittedAt) return redirect(`/mock/${mock.id}`) // Not submitted yet

    // Calculate stats
    const stats = {
        total: { score: 0, attempted: 0, correct: 0, incorrect: 0, maxScore: mock.mockQuestions.length * 4 },
        PHYSICS: { score: 0, attempted: 0, correct: 0, incorrect: 0, maxScore: 0 },
        CHEMISTRY: { score: 0, attempted: 0, correct: 0, incorrect: 0, maxScore: 0 },
        MATHEMATICS: { score: 0, attempted: 0, correct: 0, incorrect: 0, maxScore: 0 },
    }

    mock.mockQuestions.forEach(mq => {
        const sub = mq.question.subject as "PHYSICS" | "CHEMISTRY" | "MATHEMATICS"
        stats[sub].maxScore += 4

        const ans = mq.attemptAnswer
        if (ans && ans.selectedAnswer !== null) {
            stats.total.attempted++
            stats[sub].attempted++

            if (ans.isCorrect) {
                stats.total.correct++
                stats[sub].correct++
                stats.total.score += 4
                stats[sub].score += 4
            } else {
                stats.total.incorrect++
                stats[sub].incorrect++
                if (mq.question.questionType === "MCQ") {
                    stats.total.score -= 1
                    stats[sub].score -= 1
                }
            }
        }
    })

    return (
        <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30">
            {/* Header */}
            <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        ←
                    </Link>
                    <div>
                        <h1 className="font-bold">Exam Results</h1>
                        <p className="text-xs text-zinc-500">{mock.paper.title} ({mock.paper.year})</p>
                    </div>
                </div>
                <div className="text-sm font-mono text-zinc-400">
                    {mock.submittedAt.toISOString().split("T")[0]}
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8 md:py-12">

                {/* Hero Stats */}
                <div className="mb-12">
                    <div className="text-center mb-10">
                        <h2 className="text-zinc-400 text-sm font-bold tracking-widest uppercase mb-4">Total Score</h2>
                        <div className="text-7xl md:text-9xl font-black bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent drop-shadow-xl inline-block">
                            {stats.total.score} <span className="text-2xl md:text-4xl text-zinc-600 font-bold">/ {stats.total.maxScore}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Attempted"
                            value={stats.total.attempted}
                            subtext={`Out of ${mock.mockQuestions.length} questions`}
                            colorClass="border-blue-500/20 text-blue-100 shadow-[0_0_30px_-15px_rgba(59,130,246,0.3)]"
                        />
                        <StatCard
                            label="Physics"
                            value={stats.PHYSICS.score}
                            subtext={`${stats.PHYSICS.correct}C / ${stats.PHYSICS.incorrect}W`}
                            colorClass="border-indigo-500/20 text-indigo-100 shadow-[0_0_30px_-15px_rgba(99,102,241,0.3)]"
                        />
                        <StatCard
                            label="Chemistry"
                            value={stats.CHEMISTRY.score}
                            subtext={`${stats.CHEMISTRY.correct}C / ${stats.CHEMISTRY.incorrect}W`}
                            colorClass="border-emerald-500/20 text-emerald-100 shadow-[0_0_30px_-15px_rgba(16,185,129,0.3)]"
                        />
                        <StatCard
                            label="Mathematics"
                            value={stats.MATHEMATICS.score}
                            subtext={`${stats.MATHEMATICS.correct}C / ${stats.MATHEMATICS.incorrect}W`}
                            colorClass="border-violet-500/20 text-violet-100 shadow-[0_0_30px_-15px_rgba(139,92,246,0.3)]"
                        />
                    </div>
                </div>

                {/* Question Review Section */}
                <h2 className="text-xl font-bold mb-6 border-b border-white/5 pb-4">Detailed Review</h2>
                <div className="space-y-8">
                    {mock.mockQuestions.map((mq, idx) => {
                        const isAttempted = mq.attemptAnswer?.selectedAnswer !== null && mq.attemptAnswer?.selectedAnswer !== undefined
                        const isCorrect = mq.attemptAnswer?.isCorrect

                        let headerBg = "bg-zinc-800/50"
                        let headerBorder = "border-white/5"
                        let headerText = "text-zinc-300"
                        let badgeText = "Unattempted"

                        if (isAttempted) {
                            if (isCorrect) {
                                headerBg = "bg-emerald-500/10"
                                headerBorder = "border-emerald-500/20"
                                headerText = "text-emerald-400"
                                badgeText = "Correct (+4)"
                            } else {
                                headerBg = "bg-red-500/10"
                                headerBorder = "border-red-500/20"
                                headerText = "text-red-400"
                                badgeText = mq.question.questionType === "MCQ" ? "Incorrect (-1)" : "Incorrect (0)"
                            }
                        }

                        const options = mq.question.options as Record<string, string> | null

                        return (
                            <div key={mq.id} className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                                <div className={`px-6 py-3 flex items-center justify-between border-b ${headerBg} ${headerBorder}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold">Q{mq.displayOrder}</span>
                                        <span className="text-xs uppercase tracking-wider opacity-60 font-semibold">{mq.question.subject}</span>
                                    </div>
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${headerBorder} ${headerText}`}>
                                        {badgeText}
                                    </span>
                                </div>

                                <div className="p-6 text-base leading-relaxed text-zinc-200">
                                    {mq.question.questionText}
                                </div>

                                {options && (
                                    <div className="px-6 pb-6 grid gap-2">
                                        {Object.entries(options).map(([key, value]) => {
                                            const isSelected = mq.attemptAnswer?.selectedAnswer === key
                                            const isActuallyCorrect = mq.question.correctAnswer === key

                                            let optBorder = "border-white/5"
                                            let optBg = "bg-white/[0.02]"
                                            let optText = "text-zinc-400"

                                            if (isActuallyCorrect) {
                                                optBorder = "border-emerald-500/50"
                                                optBg = "bg-emerald-500/10"
                                                optText = "text-emerald-200"
                                            } else if (isSelected && !isCorrect) {
                                                optBorder = "border-red-500/50"
                                                optBg = "bg-red-500/10"
                                                optText = "text-red-200"
                                            }

                                            return (
                                                <div key={key} className={`flex items-start gap-4 p-4 rounded-xl border ${optBorder} ${optBg} ${optText}`}>
                                                    <span className={`font-mono font-bold ${isActuallyCorrect ? 'text-emerald-400' : isSelected ? 'text-red-400' : 'text-zinc-500'}`}>
                                                        {key}
                                                    </span>
                                                    <span>{value}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {!options && (
                                    <div className="px-6 pb-6 flex items-center gap-6">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-zinc-500">Your Answer</span>
                                            <span className="font-mono text-lg font-bold text-zinc-300">
                                                {isAttempted ? mq.attemptAnswer?.selectedAnswer : "—"}
                                            </span>
                                        </div>
                                        <div className="w-px h-8 bg-white/10" />
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-emerald-500/70">Correct Answer</span>
                                            <span className="font-mono text-lg font-bold text-emerald-400">
                                                {mq.question.correctAnswer}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {mq.question.solutionText && (
                                    <div className="mx-6 mb-6 p-5 rounded-xl bg-blue-500/5 border border-blue-500/10 text-sm">
                                        <h4 className="text-blue-400 font-bold mb-2 uppercase tracking-wide text-xs">Solution / Explanation</h4>
                                        <div className="text-zinc-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                                            {mq.question.solutionText}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}

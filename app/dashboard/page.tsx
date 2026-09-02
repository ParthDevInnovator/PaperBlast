import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { UploadPaperButton } from "@/components/upload-paper-button"
import { ExtractPaperButton } from "@/components/extract-paper-button"
import { StartMockButton } from "@/components/start-mock-button"
import { DeletePaperButton } from "@/components/delete-paper-button"

const STATUS_CONFIG = {
    PENDING: { label: "Pending", color: "text-zinc-400", bg: "bg-zinc-400/10", dot: "bg-zinc-400" },
    EXTRACTING: { label: "Extracting", color: "text-blue-400", bg: "bg-blue-400/10", dot: "bg-blue-400 animate-pulse" },
    REVIEW: { label: "In Review", color: "text-amber-400", bg: "bg-amber-400/10", dot: "bg-amber-400" },
    PUBLISHED: { label: "Published", color: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return redirect("/auth/login")

    const papers = await prisma.paper.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true } } },
    })

    const stats = {
        total: papers.length,
        published: papers.filter(p => p.status === "PUBLISHED").length,
        review: papers.filter(p => p.status === "REVIEW").length,
        pending: papers.filter(p => p.status === "PENDING" || p.status === "EXTRACTING").length,
    }

    const pastMocks = await prisma.mock.findMany({
        where: { userId: user.id },
        orderBy: { startedAt: "desc" },
        include: { paper: { select: { title: true, year: true } } },
    })

    return (
        <div className="min-h-screen bg-[#09090b] dark relative">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="hero-grid absolute inset-0" />
                <div className="absolute w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -top-32 -left-20" />
                <div className="absolute w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-[100px] top-1/2 right-0" />
            </div>

            {/* Navbar */}
            <header className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-xl bg-black/30 px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)] group-hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] transition-shadow">
                                <span className="text-black font-black text-xs">P</span>
                            </div>
                            <span className="font-bold text-white text-sm">PaperBlast</span>
                        </Link>
                        <div className="hidden md:flex items-center gap-1">
                            <span className="text-white/20">/</span>
                            <span className="text-sm text-zinc-400 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07]">Dashboard</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="hidden md:block text-xs text-zinc-500 font-mono">{user.email}</span>
                        <form action="/auth/signout" method="post">
                            <button className="text-xs font-semibold text-zinc-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.07] hover:border-red-400/30 hover:bg-red-400/5">
                                Sign out
                            </button>
                        </form>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
                {/* Page header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-white mb-2">
                            Exam Papers
                        </h1>
                        <p className="text-zinc-500 text-sm">Upload and manage JEE PDFs · Extract questions · Review and publish</p>
                    </div>
                    <UploadPaperButton />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {[
                        { label: "Total Papers", value: stats.total, color: "text-white" },
                        { label: "Published", value: stats.published, color: "text-emerald-400" },
                        { label: "In Review", value: stats.review, color: "text-amber-400" },
                        { label: "Pending", value: stats.pending, color: "text-zinc-400" },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-sm">
                            <div className={`text-3xl font-black mb-1 ${color}`}>{value}</div>
                            <div className="text-xs text-zinc-600">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Papers list */}
                {papers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.01] text-center">
                        <div className="text-5xl mb-4">📄</div>
                        <h3 className="text-lg font-bold text-white mb-2">No papers yet</h3>
                        <p className="text-sm text-zinc-500 mb-6">Be the first to upload a past JEE paper to the community.</p>
                        <UploadPaperButton />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {papers.map((paper) => {
                            const cfg = STATUS_CONFIG[paper.status as keyof typeof STATUS_CONFIG]
                            return (
                                <div
                                    key={paper.id}
                                    className="feature-card group border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] backdrop-blur-md flex flex-col justify-between hover:border-white/[0.14]"
                                >
                                    <div>
                                        {/* Top row */}
                                        <div className="flex items-start justify-between mb-4">
                                            <span className="text-xs font-bold text-zinc-400 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">
                                                JEE {paper.year}
                                            </span>
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </span>
                                        </div>

                                        {/* Title */}
                                        <h3 className="font-bold text-base text-white leading-snug line-clamp-2 mb-3">
                                            {paper.title}
                                        </h3>

                                        {/* Meta */}
                                        <p className="text-xs text-zinc-600">
                                            {paper._count.questions} question{paper._count.questions !== 1 ? "s" : ""} extracted
                                        </p>
                                    </div>

                                    {/* Footer actions */}
                                    <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                                        <a
                                            href={paper.sourcePdfUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-zinc-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                                        >
                                            <span>↗</span> Original PDF
                                        </a>

                                        <div className="flex items-center gap-2">
                                            {paper.status === "PENDING" ? (
                                                <ExtractPaperButton paperId={paper.id} />
                                            ) : paper.status === "EXTRACTING" ? (
                                                <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 animate-pulse">
                                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
                                                    Extracting…
                                                </span>
                                            ) : paper.status === "PUBLISHED" ? (
                                                <div className="flex items-center gap-2">
                                                    <StartMockButton paperId={paper.id} />
                                                    <Link
                                                        href={`/dashboard/review/${paper.id}`}
                                                        className="text-xs font-bold text-zinc-500 hover:text-white transition-colors"
                                                    >
                                                        Manage
                                                    </Link>
                                                </div>
                                            ) : (
                                                <Link
                                                    href={`/dashboard/review/${paper.id}`}
                                                    className="text-xs font-bold text-white hover:text-zinc-300 transition-colors flex items-center gap-1"
                                                >
                                                    Manage <span>→</span>
                                                </Link>
                                            )}
                                            <DeletePaperButton paperId={paper.id} />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Past Mocks */}
                {pastMocks.length > 0 && (
                    <div className="mt-16 border-t border-white/10 pt-10">
                        <h2 className="text-2xl font-black text-white mb-6">Your Past Mocks</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {pastMocks.map(mock => (
                                <Link key={mock.id} href={mock.submittedAt ? `/results/${mock.id}` : `/mock/${mock.id}`} className="block">
                                    <div className="border border-white/[0.07] rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.04] transition-colors hover:border-white/[0.14]">
                                        <div className="flex items-start justify-between mb-4">
                                            <span className="text-xs font-bold text-zinc-400 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">
                                                JEE {mock.paper.year}
                                            </span>
                                            {mock.submittedAt ? (
                                                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">Score: {mock.score}</span>
                                            ) : (
                                                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">In Progress</span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-base text-white leading-snug line-clamp-2 mb-2">
                                            {mock.paper.title}
                                        </h3>
                                        <p className="text-xs text-zinc-500">Started: {mock.startedAt.toISOString().split("T")[0]}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

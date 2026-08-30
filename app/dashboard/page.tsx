import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { UploadPaperButton } from "@/components/upload-paper-button"
import { ExtractPaperButton } from "@/components/extract-paper-button"

export default async function DashboardPage() {
    const supabase = await createClient()

    // 1. Authenticate Request
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return redirect("/auth/login")
    }

    // 2. Fetch Papers Data from Prisma (Latest first)
    const papers = await prisma.paper.findMany({
        orderBy: { createdAt: 'desc' }
    })

    return (
        <div className="flex bg-background min-h-screen flex-col dark w-full">
            {/* Navbar segment */}
            <header className="border-b border-border px-6 py-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">PaperBlast Community Dashboard</h1>
                <div className="flex items-center space-x-4">
                    <p className="text-sm text-muted-foreground mr-4 hidden md:block">{user.email}</p>
                    <form action="/auth/signout" method="post">
                        <button className="text-sm font-medium text-foreground hover:text-red-500 transition-colors">
                            Sign out
                        </button>
                    </form>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-12 max-w-7xl mx-auto w-full">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">Exam Papers</h2>
                        <p className="text-muted-foreground mt-1">Upload, review, and extract questions from previous year papers.</p>
                    </div>
                    <UploadPaperButton />
                </div>

                {/* Papers Grid / List */}
                {papers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-card text-center text-muted-foreground shadow-sm">
                        <p>No papers have been uploaded yet.</p>
                        <p className="text-sm mt-1">Be the first to upload a past JEE paper to the community!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {papers.map((paper) => (
                            <div key={paper.id} className="group relative border border-border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                                            {paper.year}
                                        </span>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                      ${paper.status === 'PUBLISHED' ? 'bg-green-500/15 text-green-500' :
                                                paper.status === 'REVIEW' ? 'bg-amber-500/15 text-amber-500' :
                                                    paper.status === 'EXTRACTING' ? 'bg-blue-500/15 text-blue-500' :
                                                        'bg-zinc-500/15 text-zinc-400'}`}>
                                            {paper.status}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-lg leading-tight mb-3 line-clamp-2 text-foreground">{paper.title}</h3>
                                </div>

                                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                                    <a
                                        href={paper.sourcePdfUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm text-blue-500 hover:underline"
                                    >
                                        View Original PDF
                                    </a>
                                    {paper.status === 'PENDING' ? (
                                        <ExtractPaperButton paperId={paper.id} />
                                    ) : paper.status === 'EXTRACTING' ? (
                                        <span className="text-sm font-medium text-blue-500 animate-pulse">Extracting...</span>
                                    ) : (
                                        <a
                                            href={`/dashboard/review/${paper.id}`}
                                            className="text-sm font-medium text-primary hover:underline"
                                        >
                                            Manage &rarr;
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}

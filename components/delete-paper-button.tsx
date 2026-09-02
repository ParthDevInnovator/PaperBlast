"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { deletePaperAction } from "@/app/dashboard/actions"

export function DeletePaperButton({ paperId }: { paperId: string }) {
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    // Only render portal after client hydration
    useEffect(() => { setMounted(true) }, [])

    async function handleDelete() {
        setLoading(true)
        setError(null)
        try {
            const result = await deletePaperAction(paperId)
            if (result?.error) {
                setError(result.error)
                setLoading(false)
            } else {
                setOpen(false)
                router.refresh()
            }
        } catch (e: any) {
            setError(e.message || "Something went wrong")
            setLoading(false)
        }
    }

    return (
        <>
            {/* Trash icon — visible on card hover via parent `group` class */}
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpen(true)
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-zinc-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 cursor-pointer"
                title="Delete paper"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
            </button>

            {/* Confirm dialog — inline (not portal) to avoid SSR issues */}
            {mounted && open && (
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 9999 }}
                    className="flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={() => !loading && setOpen(false)}
                >
                    <div
                        style={{ position: "relative" }}
                        className="bg-[#111113] border border-white/[0.09] rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-2xl mb-3">🗑️</div>
                        <h3 className="text-base font-bold text-white mb-1">Delete this paper?</h3>
                        <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
                            This will permanently delete the paper and{" "}
                            <strong className="text-white">all extracted questions</strong>.
                            This cannot be undone.
                        </p>

                        {error && (
                            <p className="text-xs text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-zinc-400 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500/20 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                        Deleting…
                                    </>
                                ) : (
                                    "Yes, delete"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

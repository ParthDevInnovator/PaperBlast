"use client"

import { useState, useRef } from "react"
import { uploadPaperAction } from "@/app/dashboard/actions"

export function UploadPaperButton() {
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    async function handleSubmit(formData: FormData) {
        setError(null)
        setIsLoading(true)
        const result = await uploadPaperAction(formData)
        setIsLoading(false)
        if (result?.error) {
            setError(result.error)
        } else {
            setIsOpen(false)
            setFileName(null)
        }
    }

    return (
        <>
            <button
                id="upload-paper-btn"
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-white text-black text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-zinc-100 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
                <span className="text-base">+</span> Upload Paper
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => { setIsOpen(false); setFileName(null); setError(null) }}
                    />

                    {/* Modal */}
                    <div className="relative z-10 w-full max-w-md border border-white/[0.08] rounded-2xl bg-[#0d0d10] shadow-[0_0_80px_rgba(0,0,0,0.8)] p-7">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-black text-white">Upload Paper</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">Add a new JEE paper to the community</p>
                            </div>
                            <button
                                onClick={() => { setIsOpen(false); setFileName(null); setError(null) }}
                                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex items-center justify-center text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {error && (
                            <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <form action={handleSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Paper Title
                                </label>
                                <input
                                    name="title"
                                    type="text"
                                    placeholder="JEE Main 2023 Session 2 Paper 1"
                                    required
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Year
                                </label>
                                <input
                                    name="year"
                                    type="number"
                                    min={2006}
                                    max={2025}
                                    placeholder="2023"
                                    required
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    PDF File
                                </label>
                                <div
                                    onClick={() => fileRef.current?.click()}
                                    className="relative flex flex-col items-center justify-center h-28 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all cursor-pointer group"
                                >
                                    <input
                                        ref={fileRef}
                                        name="file"
                                        type="file"
                                        accept=".pdf"
                                        required
                                        className="hidden"
                                        onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
                                    />
                                    {fileName ? (
                                        <>
                                            <div className="text-2xl mb-1">✅</div>
                                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[80%]">{fileName}</span>
                                            <span className="text-xs text-zinc-600 mt-0.5">Click to change</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📄</div>
                                            <span className="text-sm text-zinc-400">Click to select PDF</span>
                                            <span className="text-xs text-zinc-600 mt-0.5">Max 50MB</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="mt-2 h-11 w-full rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                            >
                                {isLoading ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        Uploading…
                                    </>
                                ) : "Upload Paper →"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}

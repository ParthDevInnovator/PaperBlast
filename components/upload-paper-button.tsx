"use client"

import { useState, useRef, useTransition } from "react"
import { createClient } from "@/utils/supabase/client"
import { createPaperRecordAction } from "@/app/dashboard/actions"

export function UploadPaperButton() {
    const [isOpen, setIsOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const [progress, setProgress] = useState(0)
    const fileRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)

    const isBusy = isUploading || isPending

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setProgress(0)

        const form = e.currentTarget
        const titleInput = form.elements.namedItem("title") as HTMLInputElement
        const yearInput = form.elements.namedItem("year") as HTMLInputElement
        const fileInput = fileRef.current

        const file = fileInput?.files?.[0]
        if (!file) {
            setError("Please select a PDF file.")
            return
        }

        const MAX_SIZE_MB = 50
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            setError(`File too large — max ${MAX_SIZE_MB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`)
            return
        }

        // 1. Upload directly to Supabase Storage from the browser (no Next.js body limit!)
        setIsUploading(true)
        const supabase = createClient()
        const fileExt = file.name.split(".").pop()
        const storageName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

        setProgress(20)
        const { error: uploadError } = await supabase.storage
            .from("papers")
            .upload(storageName, file, { cacheControl: "3600", upsert: false })

        if (uploadError) {
            setIsUploading(false)
            setError(`Storage error: ${uploadError.message}`)
            return
        }
        setProgress(80)

        const { data: urlData } = supabase.storage.from("papers").getPublicUrl(storageName)
        const publicUrl = urlData.publicUrl

        setIsUploading(false)

        // 2. Save metadata to DB via a tiny Server Action (no file, just URL + title + year)
        const rawTitle = titleInput?.value?.trim()
        const rawYear = parseInt(yearInput?.value || "", 10)
        const resolvedTitle = rawTitle || file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ")
        const resolvedYear = rawYear || new Date().getFullYear()

        startTransition(async () => {
            setProgress(95)
            const result = await createPaperRecordAction({
                title: resolvedTitle,
                year: resolvedYear,
                publicUrl,
            })

            if (result?.error) {
                setError(result.error)
                setProgress(0)
            } else {
                setProgress(100)
                setTimeout(() => {
                    setIsOpen(false)
                    setFileName(null)
                    setProgress(0)
                    formRef.current?.reset()
                }, 400)
            }
        })
    }

    return (
        <>
            <button
                id="upload-paper-btn"
                onClick={() => { setIsOpen(true); setError(null) }}
                className="flex items-center gap-2 bg-white text-black text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-zinc-100 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
                <span className="text-base">+</span> Upload Paper
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => { if (!isBusy) { setIsOpen(false); setFileName(null); setError(null) } }}
                    />

                    {/* Modal */}
                    <div className="relative z-10 w-full max-w-md border border-white/[0.08] rounded-2xl bg-[#0d0d10] shadow-[0_0_80px_rgba(0,0,0,0.8)] p-7">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-black text-white">Upload Paper</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">Uploads directly to Supabase — no file size limit</p>
                            </div>
                            <button
                                onClick={() => { if (!isBusy) { setIsOpen(false); setFileName(null); setError(null) } }}
                                disabled={isBusy}
                                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex items-center justify-center text-sm disabled:opacity-30"
                            >
                                ✕
                            </button>
                        </div>

                        {error && (
                            <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Paper Title <span className="normal-case font-normal text-zinc-600">(optional)</span>
                                </label>
                                <input
                                    name="title"
                                    type="text"
                                    placeholder="JEE Main 2023 Session 2 Paper 1"
                                    disabled={isBusy}
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:opacity-50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Year <span className="normal-case font-normal text-zinc-600">(optional)</span>
                                </label>
                                <input
                                    name="year"
                                    type="number"
                                    min={2006}
                                    max={2030}
                                    placeholder={`${new Date().getFullYear()}`}
                                    disabled={isBusy}
                                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:opacity-50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    PDF File
                                </label>
                                <div
                                    onClick={() => !isBusy && fileRef.current?.click()}
                                    className={`relative flex flex-col items-center justify-center h-28 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all ${isBusy ? "cursor-not-allowed opacity-50" : "cursor-pointer"} group`}
                                >
                                    <input
                                        ref={fileRef}
                                        name="file"
                                        type="file"
                                        accept=".pdf"
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
                                            <span className="text-xs text-zinc-600 mt-0.5">Any size</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Progress bar */}
                            {isBusy && (
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white rounded-full transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isBusy}
                                className="mt-2 h-11 w-full rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                            >
                                {isUploading ? (
                                    <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Uploading to Storage…</>
                                ) : isPending ? (
                                    <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Saving…</>
                                ) : "Upload Paper →"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}

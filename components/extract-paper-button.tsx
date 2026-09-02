"use client"

import { useState } from "react"
import { extractPaperAction } from "@/app/dashboard/actions"

export function ExtractPaperButton({ paperId }: { paperId: string }) {
    const [isExtracting, setIsExtracting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleExtract() {
        setError(null)
        setIsExtracting(true)
        try {
            const result = await extractPaperAction(paperId)
            if (result?.error) setError(result.error)
        } catch (e: any) {
            setError(e.message || "An unexpected error occurred")
        } finally {
            setIsExtracting(false)
        }
    }

    if (error) {
        return (
            <span className="text-xs text-red-400 max-w-[120px] text-right leading-tight">{error}</span>
        )
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Button clicked!");
                handleExtract();
            }}
            disabled={isExtracting}
            className="relative z-50 select-none text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer p-2 -m-2"
        >
            {isExtracting ? (
                <>
                    <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                    Extracting…
                </>
            ) : (
                <>
                    <span>⚡</span> Extract
                </>
            )}
        </button>
    )
}

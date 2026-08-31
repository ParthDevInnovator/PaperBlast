"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function StartMockButton({ paperId }: { paperId: string }) {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    async function handleStart() {
        setIsLoading(true)
        const res = await fetch("/api/mocks/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paperId }),
        })
        const data = await res.json()
        if (data.mockId) {
            router.push(`/mock/${data.mockId}`)
        } else {
            alert(data.error || "Failed to start mock. Please try again.")
            setIsLoading(false)
        }
    }

    return (
        <button
            onClick={handleStart}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 hover:border-emerald-500/50 px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 active:scale-95"
        >
            {isLoading ? (
                <>
                    <span className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                    Starting…
                </>
            ) : (
                <>▶ Start Mock</>
            )}
        </button>
    )
}

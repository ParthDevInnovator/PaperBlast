"use client"

import { useState } from "react"
import { extractPaperAction } from "@/app/dashboard/actions"

export function ExtractPaperButton({ paperId }: { paperId: string }) {
    const [isExtracting, setIsExtracting] = useState(false)

    async function handleExtract() {
        setIsExtracting(true)
        const result = await extractPaperAction(paperId)
        setIsExtracting(false)
        if (result?.error) {
            alert("Error: " + result.error) // Basic error handling for now
        }
    }

    return (
        <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="text-sm font-medium text-amber-500 hover:underline disabled:opacity-50"
        >
            {isExtracting ? "Extracting..." : "Run Extraction ⚡"}
        </button>
    )
}

"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Auto-refreshes the dashboard page while any paper is extracting
export function DashboardAutoRefresh({ hasExtracting }: { hasExtracting: boolean }) {
    const router = useRouter()

    useEffect(() => {
        if (!hasExtracting) return
        const interval = setInterval(() => {
            router.refresh() // re-runs the server component, updates data
        }, 5000) // every 5 seconds
        return () => clearInterval(interval)
    }, [hasExtracting, router])

    return null // renders nothing, just triggers refresh
}

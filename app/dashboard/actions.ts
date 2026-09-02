"use server"

import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createPaperRecordAction(params: {
    title: string
    year: number
    publicUrl: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    try {
        await prisma.paper.create({
            data: {
                title: params.title,
                year: params.year,
                sourcePdfUrl: params.publicUrl,
                status: "PENDING",
            },
        })
    } catch (dbError: any) {
        return { error: `Database error: ${dbError.message}` }
    }

    revalidatePath("/dashboard")
    return { success: true }
}

export async function extractPaperAction(paperId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Unauthorized" }
    }

    try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

        // Use standard URL for fetch in development/production
        const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const res = await fetch(`${SITE_URL}/api/extract`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookieHeader
            },
            body: JSON.stringify({ paperId })
        });

        const data = await res.json();
        if (!res.ok) {
            return { error: data.error || "Failed to extract" };
        }

        revalidatePath("/dashboard")
        return { success: true, count: data.count, highConf: data.highConf, lowConf: data.lowConf };

    } catch (error: any) {
        console.error("Extraction action error:", error)
        return { error: error.message || "Failed to call extract API." }
    }
}

"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

export async function login(formData: FormData) {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        return redirect(`/auth/login?error=${encodeURIComponent("Auth Error: " + error.message)}`)
    }

    // No DB call needed on login — user record already exists from signup
    redirect("/dashboard")
}

export async function signup(formData: FormData) {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
        return redirect(`/auth/login?error=${encodeURIComponent("Auth Error: " + error.message)}`)
    }

    // Only on first signup — create the public User record
    if (data?.user) {
        try {
            await prisma.user.upsert({
                where: { id: data.user.id },
                update: {},
                create: {
                    id: data.user.id,
                    email: email,
                    name: email.split("@")[0],
                },
            })
        } catch (dbError: any) {
            console.error("Prisma Signup Error:", dbError)
            return redirect(`/auth/login?error=${encodeURIComponent("Database Error: " + (dbError.message || "Unknown"))}`)
        }
    }

    redirect("/dashboard")
}

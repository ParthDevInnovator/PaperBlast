import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"

export async function login(formData: FormData) {
    "use server"
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return redirect("/login?message=Could not authenticate user")
    }

    // Find user role in DB to redirect correctly
    redirect("/dashboard")
}

export async function signup(formData: FormData) {
    "use server"
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error) {
        return redirect("/login?message=Could not create user")
    }

    redirect("/dashboard")
}

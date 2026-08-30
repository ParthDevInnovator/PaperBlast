import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return redirect("/login")
    }

    return (
        <div className="flex bg-background min-h-screen flex-col p-8 dark">
            <h1 className="text-3xl font-bold mb-4">Student Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user.email}</p>

            <form action="/auth/signout" method="post" className="mt-8">
                <button className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md">
                    Sign out
                </button>
            </form>
        </div>
    )
}

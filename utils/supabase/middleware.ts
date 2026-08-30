import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // ROUTE PROTECTION LOGIC
    const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/login") || request.nextUrl.pathname === "/auth"
    const isAdminRoute = request.nextUrl.pathname.startsWith("/admin")
    const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/mock")

    if (!user && (isProtectedRoute || isAdminRoute)) {
        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone()
        url.pathname = "/auth/login"
        return NextResponse.redirect(url)
    }

    // NOTE: Checking Admin Role requires looking at the JWT app_metadata or hitting the db. 
    // For now, we will rely on UI protection and API protection, but can add checking here too if role is in user meta.

    if (user && isAuthRoute) {
        // If logged in and trying to access login, redirect to dashboard
        const url = request.nextUrl.clone()
        url.pathname = "/dashboard"
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

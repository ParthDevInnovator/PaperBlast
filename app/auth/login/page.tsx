"use client"

import { useState, Suspense } from "react"
import { login, signup } from "./actions"
import { useSearchParams } from "next/navigation"

function LoginForm() {
    const [isLogin, setIsLogin] = useState(true)
    const searchParams = useSearchParams()
    const error = searchParams.get("error")

    return (
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl text-card-foreground">
            <h2 className="text-2xl font-bold tracking-tight text-center mb-6">
                {isLogin ? "Welcome back" : "Create an account"}
            </h2>

            {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg text-center">
                    {error}
                </div>
            )}

            <form className="flex flex-col space-y-4">
                <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="email">
                        Email
                    </label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        id="email"
                        name="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                    />
                </div>
                <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="password">
                        Password
                    </label>
                    <input
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        id="password"
                        name="password"
                        type="password"
                        required
                    />
                </div>

                <button
                    formAction={isLogin ? login : signup}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 h-10 mt-2"
                >
                    {isLogin ? "Sign In" : "Sign Up"}
                </button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="font-semibold text-primary hover:underline cursor-pointer">
                    {isLogin ? "Sign up" : "Sign in"}
                </button>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <div className="flex bg-background min-h-screen flex-col items-center justify-center p-6 md:p-24 dark">
            <Suspense fallback={<div>Loading...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    )
}

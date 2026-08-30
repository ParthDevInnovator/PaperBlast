"use client"

import { useState, useTransition, Suspense } from "react"
import Link from "next/link"
import { login, signup } from "./actions"
import { useSearchParams } from "next/navigation"

function LoginForm() {
    const [isLogin, setIsLogin] = useState(true)
    const [isPending, startTransition] = useTransition()
    const searchParams = useSearchParams()
    const error = searchParams.get("error")

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
            if (isLogin) {
                await login(formData)
            } else {
                await signup(formData)
            }
        })
    }

    return (
        <div className="w-full max-w-sm">
            <div className="border border-white/[0.08] rounded-2xl bg-white/[0.03] backdrop-blur-xl p-8 shadow-[0_0_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        <span className="text-black font-black text-xs">P</span>
                    </div>
                    <span className="font-bold text-white text-sm tracking-tight">PaperBlast</span>
                </div>

                <h2 className="text-2xl font-black tracking-tight text-white mb-1">
                    {isLogin ? "Welcome back." : "Join the mission."}
                </h2>
                <p className="text-sm text-zinc-500 mb-7">
                    {isLogin
                        ? "Sign in to continue to your dashboard."
                        : "Create an account to start uploading and practicing."}
                </p>

                {error && (
                    <div className="mb-5 flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl">
                        <span className="mt-0.5">⚠</span>
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex bg-white/[0.05] rounded-xl p-1 mb-6 border border-white/[0.07]">
                    <button
                        type="button"
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${isLogin ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsLogin(false)}
                        className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${!isLogin ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider" htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            required
                            disabled={isPending}
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:opacity-50"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            disabled={isPending}
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:opacity-50"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="mt-2 h-11 w-full rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-100 active:scale-[0.98] transition-all disabled:opacity-70 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2"
                    >
                        {isPending ? (
                            <>
                                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                {isLogin ? "Signing in..." : "Creating account..."}
                            </>
                        ) : (
                            isLogin ? "Sign In →" : "Create Account →"
                        )}
                    </button>
                </form>
            </div>

            <p className="text-center text-xs text-zinc-600 mt-6">
                By continuing, you agree to our{" "}
                <span className="text-zinc-400 cursor-pointer hover:text-white transition-colors">Terms</span>
                {" "}and{" "}
                <span className="text-zinc-400 cursor-pointer hover:text-white transition-colors">Privacy Policy</span>.
            </p>

            <Link href="/" className="block text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-3">
                ← Back to home
            </Link>
        </div>
    )
}

export default function LoginPage() {
    return (
        <div className="flex bg-[#09090b] min-h-screen items-center justify-center p-6 relative overflow-hidden dark">
            <div className="absolute inset-0 pointer-events-none">
                <div className="hero-grid absolute inset-0" />
                <div className="absolute w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[100px] -top-40 -left-20" />
                <div className="absolute w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[100px] bottom-0 right-0" />
            </div>
            <div className="relative z-10 w-full flex justify-center">
                <Suspense fallback={<div className="text-zinc-500 text-sm">Loading...</div>}>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    )
}

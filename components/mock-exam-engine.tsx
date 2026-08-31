"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"

type Question = {
    mockQuestionId: string
    questionId: string
    displayOrder: number
    subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS"
    questionType: "MCQ" | "INTEGER"
    questionText: string
    options: Record<string, string> | null
    savedAnswer: string | null
}

type AnswerState = Record<string, string | null>  // mockQuestionId -> selectedAnswer
type FlagState = Record<string, boolean>           // mockQuestionId -> flagged

const SUBJECT_COLORS = {
    PHYSICS: { text: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30", dot: "bg-blue-400" },
    CHEMISTRY: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", dot: "bg-emerald-400" },
    MATHEMATICS: { text: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30", dot: "bg-violet-400" },
}

function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function MockExamEngine({
    mockId,
    questions,
    durationMins,
    startedAt,
}: {
    mockId: string
    questions: Question[]
    durationMins: number
    startedAt: string
}) {
    const router = useRouter()
    const storageKey = `mock-${mockId}`

    // ── State ──────────────────────────────────────────────────────────────────
    const [currentIdx, setCurrentIdx] = useState(0)
    const [answers, setAnswers] = useState<AnswerState>(() => {
        // Restore from localStorage
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(storageKey)
                if (saved) return JSON.parse(saved)
            } catch { }
        }
        // Init from server-prefetched saved answers
        const init: AnswerState = {}
        for (const q of questions) init[q.mockQuestionId] = q.savedAnswer
        return init
    })
    const [flags, setFlags] = useState<FlagState>({})
    const [integerInput, setIntegerInput] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const syncQueueRef = useRef<Set<string>>(new Set())
    const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Timer ──────────────────────────────────────────────────────────────────
    const getSecondsLeft = useCallback(() => {
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
        return Math.max(0, durationMins * 60 - elapsed)
    }, [startedAt, durationMins])

    const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft)

    useEffect(() => {
        const interval = setInterval(() => {
            const left = getSecondsLeft()
            setSecondsLeft(left)
            if (left <= 0) {
                clearInterval(interval)
                handleAutoSubmit()
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [getSecondsLeft])

    // ── localStorage persistence ───────────────────────────────────────────────
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(answers))
        } catch { }
    }, [answers, storageKey])

    // ── Debounced background sync ──────────────────────────────────────────────
    const syncToServer = useCallback(async (mqId: string, answer: string | null) => {
        try {
            await fetch("/api/attempt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mockQuestionId: mqId, selectedAnswer: answer }),
            })
        } catch (e) {
            console.error("Sync failed:", e)
        }
    }, [])

    const scheduleSyncAll = useCallback(() => {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
        syncTimerRef.current = setTimeout(async () => {
            const toSync = Array.from(syncQueueRef.current)
            syncQueueRef.current.clear()
            await Promise.all(toSync.map((mqId) => syncToServer(mqId, answers[mqId] ?? null)))
        }, 5000) // Debounce 5 seconds
    }, [answers, syncToServer])

    // ── Answer selection ───────────────────────────────────────────────────────
    const currentQ = questions[currentIdx]

    const selectMCQ = (optionKey: string) => {
        const mqId = currentQ.mockQuestionId
        const existing = answers[mqId]
        const newAnswer = existing === optionKey ? null : optionKey // toggle
        setAnswers((prev) => ({ ...prev, [mqId]: newAnswer }))
        syncQueueRef.current.add(mqId)
        scheduleSyncAll()
    }

    const submitInteger = () => {
        if (!integerInput.trim()) return
        const mqId = currentQ.mockQuestionId
        setAnswers((prev) => ({ ...prev, [mqId]: integerInput.trim() }))
        syncQueueRef.current.add(mqId)
        scheduleSyncAll()
    }

    const clearAnswer = () => {
        const mqId = currentQ.mockQuestionId
        setAnswers((prev) => ({ ...prev, [mqId]: null }))
        setIntegerInput("")
        syncQueueRef.current.add(mqId)
        scheduleSyncAll()
    }

    const toggleFlag = () => {
        const mqId = currentQ.mockQuestionId
        setFlags((prev) => ({ ...prev, [mqId]: !prev[mqId] }))
    }

    // Sync integer input state when navigating
    useEffect(() => {
        if (currentQ.questionType === "INTEGER") {
            setIntegerInput(answers[currentQ.mockQuestionId] ?? "")
        }
    }, [currentIdx, currentQ])

    // ── Submission ─────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        setIsSubmitting(true)
        // Flush all pending syncs
        const toSync = Object.entries(answers)
        await Promise.all(toSync.map(([mqId, ans]) => syncToServer(mqId, ans)))
        // Call submit endpoint
        const res = await fetch(`/api/mocks/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mockId }),
        })
        const data = await res.json()
        if (data.mockId) {
            localStorage.removeItem(storageKey)
            router.push(`/results/${data.mockId}`)
        } else {
            setIsSubmitting(false)
            alert("Submission failed. Please try again.")
        }
    }

    const handleAutoSubmit = () => {
        setShowSubmitModal(false)
        handleSubmit()
    }

    // ── Derived stats ──────────────────────────────────────────────────────────
    const attempted = questions.filter((q) => answers[q.mockQuestionId]).length
    const flagged = questions.filter((q) => flags[q.mockQuestionId]).length

    const getQuestionStatus = (q: Question) => {
        if (flags[q.mockQuestionId] && answers[q.mockQuestionId]) return "flagged-answered"
        if (flags[q.mockQuestionId]) return "flagged"
        if (answers[q.mockQuestionId]) return "answered"
        if (q.displayOrder <= currentIdx + 1) return "visited"
        return "unattempted"
    }

    const timerColor = secondsLeft < 600 ? "text-red-400" : secondsLeft < 1800 ? "text-amber-400" : "text-emerald-400"

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen bg-[#09090b] text-white dark overflow-hidden">

            {/* ── TOP BAR ── */}
            <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/[0.07] bg-black/40 backdrop-blur-xl z-20">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
                        <span className="text-black font-black text-[10px]">P</span>
                    </div>
                    <span className="text-sm font-bold hidden sm:block">PaperBlast</span>
                    <span className="text-white/20 hidden sm:block">/</span>
                    <span className="text-xs text-zinc-400 hidden sm:block truncate max-w-xs">Mock Exam</span>
                </div>

                <div className="flex items-center gap-4">
                    {/* Attempt stats */}
                    <div className="hidden md:flex items-center gap-4 text-xs text-zinc-400">
                        <span><span className="text-white font-bold">{attempted}</span>/{questions.length} answered</span>
                        {flagged > 0 && <span><span className="text-amber-400 font-bold">{flagged}</span> flagged</span>}
                    </div>

                    {/* Timer */}
                    <div className={`font-mono text-lg font-black tabular-nums px-4 py-1.5 rounded-xl border ${secondsLeft < 600
                            ? "border-red-500/30 bg-red-500/10 text-red-400"
                            : secondsLeft < 1800
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        }`}>
                        {formatTime(secondsLeft)}
                    </div>

                    <button
                        onClick={() => setShowSubmitModal(true)}
                        className="px-4 py-1.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-100 active:scale-95 transition-all"
                    >
                        Submit
                    </button>
                </div>
            </header>

            {/* ── BODY ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── QUESTION PANEL ── */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div className="max-w-3xl mx-auto">

                        {/* Subject badge + Q number */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SUBJECT_COLORS[currentQ.subject].text} ${SUBJECT_COLORS[currentQ.subject].bg} ${SUBJECT_COLORS[currentQ.subject].border}`}>
                                    {currentQ.subject}
                                </span>
                                <span className="text-xs text-zinc-500">
                                    Q{currentQ.displayOrder} of {questions.length}
                                </span>
                                <span className="text-xs text-zinc-600 border border-white/10 px-2 py-0.5 rounded">
                                    {currentQ.questionType}
                                </span>
                            </div>
                            <button
                                onClick={toggleFlag}
                                className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-colors ${flags[currentQ.mockQuestionId]
                                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                        : "bg-white/[0.04] border-white/10 text-zinc-500 hover:text-amber-400"
                                    }`}
                            >
                                {flags[currentQ.mockQuestionId] ? "🚩 Flagged" : "⚑ Flag"}
                            </button>
                        </div>

                        {/* Question text */}
                        <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-6 mb-6 leading-relaxed text-base text-zinc-100">
                            {currentQ.questionText || <span className="text-zinc-500 italic">[Question text not available]</span>}
                        </div>

                        {/* Options */}
                        {currentQ.questionType === "MCQ" && currentQ.options ? (
                            <div className="grid grid-cols-1 gap-3 mb-6">
                                {Object.entries(currentQ.options).map(([key, val]) => {
                                    const isSelected = answers[currentQ.mockQuestionId] === key
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => selectMCQ(key)}
                                            className={`flex items-start gap-4 px-5 py-4 rounded-xl border text-left transition-all active:scale-[0.99] ${isSelected
                                                    ? "bg-blue-500/15 border-blue-500/50 text-blue-100"
                                                    : "bg-white/[0.02] border-white/[0.07] text-zinc-300 hover:bg-white/[0.05] hover:border-white/20"
                                                }`}
                                        >
                                            <span className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-black mt-0.5 ${isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600 text-zinc-500"
                                                }`}>
                                                {key}
                                            </span>
                                            <span className="text-sm leading-relaxed">{val}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="mb-6">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
                                    Enter your integer answer:
                                </label>
                                <div className="flex gap-3">
                                    <input
                                        type="number"
                                        value={integerInput}
                                        onChange={(e) => setIntegerInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && submitInteger()}
                                        placeholder="e.g.  42"
                                        className="flex-1 h-12 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-white/20 placeholder:text-zinc-600"
                                    />
                                    <button
                                        onClick={submitInteger}
                                        className="px-5 h-12 bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-bold rounded-xl transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                                {answers[currentQ.mockQuestionId] && (
                                    <p className="text-xs text-emerald-400 mt-2">
                                        ✓ Saved: <span className="font-mono">{answers[currentQ.mockQuestionId]}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Navigation buttons */}
                        <div className="flex items-center justify-between">
                            <button
                                onClick={clearAnswer}
                                className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/5 border border-transparent hover:border-red-500/20"
                            >
                                Clear Response
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                                    disabled={currentIdx === 0}
                                    className="px-5 py-2 text-sm font-semibold rounded-xl border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30"
                                >
                                    ← Previous
                                </button>
                                <button
                                    onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                                    disabled={currentIdx === questions.length - 1}
                                    className="px-5 py-2 text-sm font-semibold rounded-xl bg-white text-black hover:bg-zinc-100 transition-colors disabled:opacity-30"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ── RIGHT PANEL: Question Grid ── */}
                <aside className="hidden lg:flex flex-col w-64 xl:w-72 flex-shrink-0 border-l border-white/[0.07] bg-black/20 overflow-y-auto">
                    <div className="p-4 border-b border-white/[0.07]">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Question Palette</h3>
                        {/* Legend */}
                        <div className="grid grid-cols-2 gap-1.5 text-xs text-zinc-500">
                            {[
                                { color: "bg-emerald-500", label: "Answered" },
                                { color: "bg-amber-500", label: "Flagged" },
                                { color: "bg-zinc-600", label: "Visited" },
                                { color: "bg-zinc-800", label: "Not visited" },
                            ].map(({ color, label }) => (
                                <div key={label} className="flex items-center gap-1.5">
                                    <span className={`w-3 h-3 rounded-sm ${color}`} />
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Subject sections */}
                    {(["PHYSICS", "CHEMISTRY", "MATHEMATICS"] as const).map((subject) => {
                        const subjectQs = questions.filter((q) => q.subject === subject)
                        if (subjectQs.length === 0) return null
                        const cfg = SUBJECT_COLORS[subject]
                        return (
                            <div key={subject} className="p-4 border-b border-white/[0.05]">
                                <p className={`text-xs font-bold mb-3 ${cfg.text}`}>{subject}</p>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {subjectQs.map((q) => {
                                        const status = getQuestionStatus(q)
                                        const isCurrent = q.mockQuestionId === currentQ.mockQuestionId
                                        const realIdx = questions.indexOf(q)
                                        return (
                                            <button
                                                key={q.mockQuestionId}
                                                onClick={() => setCurrentIdx(realIdx)}
                                                className={`w-full aspect-square text-xs font-bold rounded-lg transition-all ${isCurrent
                                                        ? "ring-2 ring-white scale-110 bg-white text-black"
                                                        : status === "answered"
                                                            ? "bg-emerald-500 text-white hover:bg-emerald-400"
                                                            : status === "flagged-answered"
                                                                ? "bg-amber-500 text-white hover:bg-amber-400"
                                                                : status === "flagged"
                                                                    ? "bg-amber-500/40 text-amber-300 border border-amber-500/50"
                                                                    : status === "visited"
                                                                        ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                                                        : "bg-zinc-800/80 text-zinc-500 hover:bg-zinc-700"
                                                    }`}
                                            >
                                                {q.displayOrder}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </aside>
            </div>

            {/* ── SUBMIT MODAL ── */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSubmitModal(false)} />
                    <div className="relative z-10 w-full max-w-md border border-white/[0.1] rounded-2xl bg-[#0d0d10] p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)]">
                        <h2 className="text-2xl font-black text-white mb-2">Submit Paper?</h2>
                        <p className="text-sm text-zinc-400 mb-6">Once submitted, you cannot change your answers.</p>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {[
                                { label: "Answered", value: attempted, color: "text-emerald-400" },
                                { label: "Unanswered", value: questions.length - attempted, color: "text-red-400" },
                                { label: "Flagged", value: flagged, color: "text-amber-400" },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="text-center bg-white/[0.03] border border-white/[0.07] rounded-xl py-3">
                                    <div className={`text-2xl font-black ${color}`}>{value}</div>
                                    <div className="text-xs text-zinc-600 mt-0.5">{label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSubmitModal(false)}
                                className="flex-1 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                            >
                                Continue Exam
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex-1 py-3 text-sm font-bold rounded-xl bg-white text-black hover:bg-zinc-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Submitting…</>
                                ) : "Submit Final Answers"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

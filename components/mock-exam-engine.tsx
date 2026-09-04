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

type AnswerState = Record<string, string | null>
type FlagState = Record<string, boolean>
type VisitedState = Record<string, boolean>

function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function MockExamEngine({
    mockId,
    questions: initialQuestions,
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

    // ── Live question list (grows as extraction progresses) ─────────────────
    const [questions, setQuestions] = useState<Question[]>(initialQuestions)
    const [extractionDone, setExtractionDone] = useState(false)
    const [newQsToast, setNewQsToast] = useState<string | null>(null)

    // Poll for newly extracted questions every 10s
    useEffect(() => {
        if (extractionDone) return
        const poll = async () => {
            try {
                const res = await fetch(`/api/mocks/poll?mockId=${mockId}`)
                if (!res.ok) return
                const data = await res.json()
                if (data.done) setExtractionDone(true)
                if (data.newQuestions && data.newQuestions.length > 0) {
                    setQuestions(prev => {
                        const existingIds = new Set(prev.map(q => q.mockQuestionId))
                        const fresh = data.newQuestions.filter(
                            (q: Question) => !existingIds.has(q.mockQuestionId)
                        )
                        if (fresh.length === 0) return prev
                        setNewQsToast(`${fresh.length} new questions loaded`)
                        setTimeout(() => setNewQsToast(null), 3000)
                        return [...prev, ...fresh]
                    })
                }
            } catch { }
        }
        const interval = setInterval(poll, 10000)
        return () => clearInterval(interval)
    }, [mockId, extractionDone])

    // ── State ──────────────────────────────────────────────────────────────────
    const [currentIdx, setCurrentIdx] = useState(0)
    const [answers, setAnswers] = useState<AnswerState>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(storageKey + "-ans")
                if (saved) return JSON.parse(saved)
            } catch { }
        }
        const init: AnswerState = {}
        for (const q of initialQuestions) init[q.mockQuestionId] = q.savedAnswer
        return init
    })
    const [flags, setFlags] = useState<FlagState>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(storageKey + "-flags")
                if (saved) return JSON.parse(saved)
            } catch { }
        }
        return {}
    })
    const [visited, setVisited] = useState<VisitedState>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(storageKey + "-visit")
                if (saved) return JSON.parse(saved)
            } catch { }
        }
        return { [initialQuestions[0]?.mockQuestionId]: true }
    })

    // Local state for what is currently selected ON THE SCREEN (but not yet saved)
    // NTA requires clicking "Save & Next" to persist an answer.
    const [localOption, setLocalOption] = useState<string | null>(null)
    const [localInteger, setLocalInteger] = useState<string>("")

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
            localStorage.setItem(storageKey + "-ans", JSON.stringify(answers))
            localStorage.setItem(storageKey + "-flags", JSON.stringify(flags))
            localStorage.setItem(storageKey + "-visit", JSON.stringify(visited))
        } catch { }
    }, [answers, flags, visited, storageKey])

    // ── Nav & Visit tracking ───────────────────────────────────────────────────
    const currentQ = questions[currentIdx]

    useEffect(() => {
        // When navigating to a new question, mark it as visited and load saved answers into local state
        setVisited(prev => ({ ...prev, [currentQ.mockQuestionId]: true }))
        if (currentQ.questionType === "MCQ") {
            setLocalOption(answers[currentQ.mockQuestionId] || null)
        } else {
            setLocalInteger(answers[currentQ.mockQuestionId] || "")
        }
    }, [currentIdx, currentQ.mockQuestionId, currentQ.questionType, answers])

    // ── Background Sync ────────────────────────────────────────────────────────
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

    const flushSyncQueue = async () => {
        const toSync = Array.from(syncQueueRef.current)
        syncQueueRef.current.clear()
        if (toSync.length > 0) {
            await Promise.all(toSync.map((mqId) => syncToServer(mqId, answers[mqId] ?? null)))
        }
    }

    const scheduleSyncAll = useCallback(() => {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
        syncTimerRef.current = setTimeout(flushSyncQueue, 3000)
    }, [answers, syncToServer])

    const persistAnswer = (mqId: string, ans: string | null, isFlagged: boolean) => {
        setAnswers(prev => ({ ...prev, [mqId]: ans }))
        setFlags(prev => ({ ...prev, [mqId]: isFlagged }))
        syncQueueRef.current.add(mqId)
        scheduleSyncAll()
    }

    // ── Action Buttons ─────────────────────────────────────────────────────────
    const getCurrentInput = () => currentQ.questionType === "MCQ" ? localOption : localInteger.trim() || null

    const goNext = () => {
        if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1)
    }

    const goBack = () => {
        if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
    }

    const handleSaveAndNext = () => {
        const val = getCurrentInput()
        persistAnswer(currentQ.mockQuestionId, val, false) // Saves answer, clears flag
        goNext()
    }

    const handleSaveAndMark = () => {
        const val = getCurrentInput()
        persistAnswer(currentQ.mockQuestionId, val, true) // Saves answer, sets flag
        goNext()
    }

    const handleMarkAndNext = () => {
        persistAnswer(currentQ.mockQuestionId, answers[currentQ.mockQuestionId] ?? null, true) // Sets flag, keeps previous saved answer (does not save new local changes)
        goNext()
    }

    const handleClear = () => {
        setLocalOption(null)
        setLocalInteger("")
        persistAnswer(currentQ.mockQuestionId, null, false)
    }

    // ── Submission ─────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        setIsSubmitting(true)
        await flushSyncQueue()
        // Call submit endpoint
        const res = await fetch(`/api/mocks/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mockId }),
        })
        const data = await res.json()
        if (data.mockId) {
            localStorage.removeItem(storageKey + "-ans")
            localStorage.removeItem(storageKey + "-flags")
            localStorage.removeItem(storageKey + "-visit")
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

    // ── Grid Legend System ─────────────────────────────────────────────────────
    const getStatus = (mqId: string) => {
        const ans = answers[mqId]
        const flg = flags[mqId]
        const vis = visited[mqId]
        if (!vis) return "not_visited"
        if (ans && flg) return "answered_marked"
        if (ans && !flg) return "answered"
        if (!ans && flg) return "marked"
        return "not_answered"
    }

    const stats = {
        not_visited: 0,
        not_answered: 0,
        answered: 0,
        marked: 0,
        answered_marked: 0,
    }
    questions.forEach(q => {
        stats[getStatus(q.mockQuestionId)]++
    })

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen bg-[#f4f4f4] text-black font-sans selection:bg-blue-200">
            {/* Toast for new questions */}
            {newQsToast && (
                <div className="fixed top-4 right-4 z-50 bg-[#1e448b] text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold animate-pulse">
                    ✨ {newQsToast}
                </div>
            )}
            {/* Extraction in-progress indicator */}
            {!extractionDone && (
                <div className="bg-amber-100 text-amber-800 text-xs text-center py-1 font-medium">
                    ⏳ More questions are being extracted in the background...
                </div>
            )}
            {/* Header */}
            <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-[#1e448b] text-white shadow-md z-20">
                <div className="text-xl font-bold tracking-wide">
                    JEE Main Mock Test
                </div>
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-2">
                        <span>Time Left:</span>
                        <span className="font-bold bg-white text-black px-2 py-1 rounded shadow-inner">
                            {formatTime(secondsLeft)}
                        </span>
                    </div>
                </div>
            </header>

            {/* Layout Wrapper */}
            <div className="flex flex-1 overflow-hidden">
                {/* ── LEFT PANEL: Question Area ── */}
                <main className="flex-1 flex flex-col min-w-0 bg-white">
                    {/* Subject Tabs */}
                    <div className="flex border-b-2 border-[#1e448b] bg-[#f0f4f9] px-2 pt-2">
                        {(["PHYSICS", "CHEMISTRY", "MATHEMATICS"] as const).map(subj => {
                            const isCurrentSubj = currentQ.subject === subj
                            const firstQ = questions.find(q => q.subject === subj)
                            const firstIdx = firstQ ? questions.indexOf(firstQ) : 0
                            return (
                                <button
                                    key={subj}
                                    onClick={() => setCurrentIdx(firstIdx)}
                                    className={`px-4 py-2 font-bold text-sm tracking-wide rounded-t-lg transition-colors ${isCurrentSubj
                                            ? "bg-[#1e448b] text-white"
                                            : "bg-[#e2eaf4] text-[#1e448b] hover:bg-[#d0dbe9]"
                                        } border border-b-0 border-[#a4bbd8] mr-1`}
                                >
                                    {subj}
                                </button>
                            )
                        })}
                    </div>

                    {/* Question Content */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white flex flex-col border-r border-[#d4d4d4]">
                        <div className="flex justify-between items-center border-b border-[#ddd] pb-2 mb-4">
                            <h2 className="text-lg font-bold text-gray-800">Question {currentQ.displayOrder}</h2>
                            <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded border border-gray-300">
                                {currentQ.questionType}
                            </span>
                        </div>

                        {/* Question Text */}
                        <div className="text-base text-gray-800 leading-relaxed overflow-x-auto min-h-[150px] whitespace-pre-wrap">
                            {currentQ.questionText || <span className="italic text-gray-500">Question text is missing.</span>}
                        </div>

                        {/* Options / Input */}
                        <div className="mt-8 select-none">
                            {currentQ.questionType === "MCQ" && currentQ.options ? (
                                <div className="space-y-3">
                                    {Object.entries(currentQ.options).map(([key, val]) => (
                                        <button
                                            key={key}
                                            onClick={() => setLocalOption(key)}
                                            className="flex items-start text-left w-full gap-3 p-3 group border border-transparent rounded hover:bg-sky-50"
                                        >
                                            <div className={`w-6 h-6 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${localOption === key
                                                    ? "border-blue-600 bg-blue-600"
                                                    : "border-gray-400 bg-white"
                                                }`}>
                                                {localOption === key && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="font-bold">({key})</span>
                                                <span className="text-gray-700">{val}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-yellow-50/50 border border-yellow-200 rounded-md">
                                    <label className="block font-semibold mb-2">Enter your answer:</label>
                                    <input
                                        type="number"
                                        value={localInteger}
                                        onChange={(e) => setLocalInteger(e.target.value)}
                                        className="border border-gray-400 outline-none p-2 rounded w-48 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-lg"
                                        placeholder="Type number..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="bg-[#f5f5f5] border-t border-[#d4d4d4] p-3 flex flex-wrap gap-2 items-center justify-between">
                        <div className="flex gap-2 items-center flex-wrap">
                            <button onClick={handleSaveAndNext} className="bg-[#5cb85c] hover:bg-[#4cae4c] text-white px-4 py-2 text-sm font-semibold border border-[#4cae4c] rounded shadow-sm">
                                Save & Next
                            </button>
                            <button onClick={handleClear} className="bg-white hover:bg-gray-100 text-black px-4 py-2 text-sm font-semibold border border-[#ccc] rounded shadow-sm">
                                Clear Response
                            </button>
                            <button onClick={handleSaveAndMark} className="bg-[#e8a317] hover:bg-[#d89307] text-white px-4 py-2 text-sm font-semibold border border-[#d89307] rounded shadow-sm">
                                Save & Mark for Review
                            </button>
                            <button onClick={handleMarkAndNext} className="bg-[#337ab7] hover:bg-[#286090] text-white px-4 py-2 text-sm font-semibold border border-[#286090] rounded shadow-sm">
                                Mark for Review & Next
                            </button>
                        </div>
                        <div className="flex gap-2">
                            {currentIdx > 0 && <button onClick={goBack} className="bg-white hover:bg-gray-100 text-black px-5 py-2 text-sm font-bold border border-[#ccc] rounded shadow-sm">{"<<"} Back</button>}
                            {currentIdx < questions.length - 1 && <button onClick={goNext} className="bg-white hover:bg-gray-100 text-black px-5 py-2 text-sm font-bold border border-[#ccc] rounded shadow-sm">Next {">>"}</button>}
                            {currentIdx === questions.length - 1 && <button onClick={() => setShowSubmitModal(true)} className="bg-[#5cb85c] hover:bg-[#4cae4c] text-white px-5 py-2 text-sm font-bold border border-[#4cae4c] rounded shadow-sm">Submit</button>}
                        </div>
                    </div>
                </main>

                {/* ── RIGHT PANEL: Palette ── */}
                <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 bg-[#e2f0fb]">
                    {/* User Profile */}
                    <div className="flex items-center gap-3 p-4 bg-white border-b border-[#cccccc]">
                        <div className="w-[80px] h-[90px] bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center flex-col shadow-sm">
                            <span className="text-3xl opacity-20">👤</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xl font-bold text-gray-800">John Doe</span>
                        </div>
                    </div>

                    {/* Stats / Legend */}
                    <div className="p-3 bg-white grid grid-cols-2 gap-y-2 gap-x-1 border-b border-[#cccccc] text-xs">
                        <div className="flex items-center gap-1.5"><NtaBadge type="not_visited" text={stats.not_visited} /> <span>Not Visited</span></div>
                        <div className="flex items-center gap-1.5"><NtaBadge type="not_answered" text={stats.not_answered} /> <span>Not Answered</span></div>
                        <div className="flex items-center gap-1.5"><NtaBadge type="answered" text={stats.answered} /> <span>Answered</span></div>
                        <div className="flex items-center gap-1.5"><NtaBadge type="marked" text={stats.marked} /> <span>Marked for Review</span></div>
                        <div className="flex items-center gap-1.5 col-span-2 mt-1"><NtaBadge type="answered_marked" text={stats.answered_marked} /> <span className="leading-tight">Answered & Marked for Review (will be considered for evaluation)</span></div>
                    </div>

                    {/* Palette Grid */}
                    <div className="flex-1 overflow-y-auto p-3 bg-[#e2f0fb]">
                        <h3 className="bg-[#4a85c5] text-white text-sm font-bold px-2 py-1 mb-2">Subject: {currentQ.subject}</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {questions.filter(q => q.subject === currentQ.subject).map(q => {
                                const status = getStatus(q.mockQuestionId)
                                const realIdx = questions.indexOf(q)
                                return (
                                    <button
                                        key={q.mockQuestionId}
                                        onClick={() => setCurrentIdx(realIdx)}
                                        className="transition-transform hover:scale-105"
                                    >
                                        <NtaBadge type={status} text={q.displayOrder} />
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Right Panel Submit Btn */}
                    <div className="bg-[#e2f0fb] p-3 text-center border-t border-sky-200">
                        <button onClick={() => setShowSubmitModal(true)} className="bg-[#5cb85c] hover:bg-[#4cae4c] text-white w-full py-2.5 text-sm font-bold rounded shadow-md border border-[#4cae4c]">
                            Submit Exam
                        </button>
                    </div>
                </aside>
            </div>

            {/* ── SUBMIT MODAL ── */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-gray-300">
                        <div className="bg-[#1e448b] text-white px-6 py-4 border-b border-gray-300">
                            <h2 className="text-xl font-bold">Exam Summary</h2>
                        </div>
                        <div className="p-6 text-gray-800">
                            <p className="mb-6 font-semibold">Are you sure you want to submit the exam? You will not be able to change your answers after submission.</p>

                            <table className="w-full text-left border-collapse border border-gray-300 mb-6 font-semibold">
                                <tbody>
                                    <tr className="bg-gray-50 border-b border-gray-300">
                                        <td className="p-2 border-r border-gray-300 text-gray-600">Total Questions</td>
                                        <td className="p-2 text-right">{questions.length}</td>
                                    </tr>
                                    <tr className="border-b border-gray-300">
                                        <td className="p-2 border-r border-gray-300 text-[#5cb85c]">Answered</td>
                                        <td className="p-2 text-right">{stats.answered + stats.answered_marked}</td>
                                    </tr>
                                    <tr className="bg-gray-50 border-b border-gray-300">
                                        <td className="p-2 border-r border-gray-300 text-[#d9534f]">Not Answered</td>
                                        <td className="p-2 text-right">{stats.not_answered}</td>
                                    </tr>
                                    <tr className="border-b border-gray-300">
                                        <td className="p-2 border-r border-gray-300 text-purple-700">Marked for Review</td>
                                        <td className="p-2 text-right">{stats.marked}</td>
                                    </tr>
                                    <tr className="bg-gray-50">
                                        <td className="p-2 border-r border-gray-300 text-gray-500">Not Visited</td>
                                        <td className="p-2 text-right">{stats.not_visited}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowSubmitModal(false)}
                                    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-black font-semibold rounded border border-gray-300"
                                >
                                    No, Return
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="px-6 py-2 bg-[#5cb85c] hover:bg-[#4cae4c] text-white font-semibold rounded border border-[#4cae4c] flex items-center gap-2"
                                >
                                    {isSubmitting ? "Submitting..." : "Yes, Submit"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function NtaBadge({ type, text }: { type: keyof ReturnType<typeof MockExamEngine>['props']['questions'] | string, text: string | number }) {
    // Shapes imitating NTA CBT UI
    if (type === "not_visited") return (
        <div className="w-[36px] h-[32px] bg-[#e6e6e6] border border-gray-300 text-black flex items-center justify-center font-bold font-mono text-sm leading-none pt-1" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}>{text}</div>
    )
    if (type === "not_answered") return (
        <div className="w-[36px] h-[32px] bg-[#df3a3a] text-white flex items-center justify-center font-bold font-mono text-sm leading-none pt-1" style={{ clipPath: "polygon(100% 0, 100% 50%, 50% 100%, 0 50%, 0 0)" }}>{text}</div>
    )
    if (type === "answered") return (
        <div className="w-[36px] h-[32px] bg-[#3a9e3a] text-white flex items-center justify-center font-bold font-mono text-sm leading-none pt-1" style={{ clipPath: "polygon(50% 0%, 100% 50%, 100% 100%, 0 100%, 0 50%)" }}>{text}</div>
    )
    if (type === "marked") return (
        <div className="w-[36px] h-[36px] bg-[#8923a8] text-white flex items-center justify-center font-bold font-mono text-sm leading-none pt-1 rounded-full">{text}</div>
    )
    if (type === "answered_marked") return (
        <div className="relative w-[36px] h-[36px] bg-[#8923a8] text-white flex items-center justify-center font-bold font-mono text-sm leading-none pt-1 rounded-full">
            {text}
            <div className="absolute bottom-[2px] right-[2px] w-2.5 h-2.5 bg-[#3a9e3a] border border-white rounded-full"></div>
        </div>
    )
    return null
}

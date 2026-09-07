import { GoogleGenerativeAI } from "@google/generative-ai";
import { RawQuestion } from "@/lib/jee-parser";

export type GeminiTask = {
    id: string; // e.g. "Chunk-A"
    chunkName: string;
    sectionText: string;
    targetSubject?: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
    onSuccess?: (questions: RawQuestion[], chunkId: string) => Promise<void>;
};

export type TaskResult = {
    taskId: string;
    chunkName: string;
    workerIndex: number;
    keyId: string;
    durationMs: number;
    questions: RawQuestion[];
    success: boolean;
    error?: string;
};

type KeyEntry = {
    id: string;
    key: string;
    inUse: boolean;
};

function isTransientError(err: any): boolean {
    const msg = String(err?.message || err || "");
    const status = err?.status || err?.statusCode;
    if (status === 429 || status === 500 || status === 503) return true;
    if (msg.includes("429") || msg.includes("Too Many Requests")) return true;
    if (msg.includes("503") || msg.includes("Service Unavailable")) return true;
    if (msg.includes("500") || msg.includes("Internal Server Error")) return true;
    if (msg.includes("high-demand") || msg.includes("resource exhausted") || msg.includes("quota")) return true;
    return false;
}

function isFatalError(err: any): boolean {
    const msg = String(err?.message || err || "");
    const status = err?.status || err?.statusCode;
    if (status === 400 || status === 401 || status === 403 || status === 404) return true;
    if (msg.includes("400") || msg.includes("401") || msg.includes("403") || msg.includes("404")) return true;
    if (msg.includes("API_KEY_INVALID") || msg.includes("not found")) return true;
    return false;
}

export class GeminiWorkerQueue {
    private keys: KeyEntry[] = [];
    private maxConcurrency: number;
    private effectiveConcurrency: number;
    private modelName: string;
    private activeWorkers = 0;

    constructor() {
        this.loadKeys();
        const configuredMax = parseInt(process.env.GEMINI_MAX_CONCURRENCY || "3", 10);
        this.maxConcurrency = isNaN(configuredMax) || configuredMax < 1 ? 3 : configuredMax;
        // Strict limit: If only 2 keys exist, max workers = 2.
        // If 4 keys exist and max concurrency = 3, max workers = 3.
        this.effectiveConcurrency = Math.min(this.keys.length, this.maxConcurrency);
        this.modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    }

    private loadKeys() {
        const loaded: KeyEntry[] = [];
        for (let i = 1; i <= 5; i++) {
            const val = process.env[`GEMINI_API_KEY_${i}`];
            if (val && val.trim()) {
                loaded.push({ id: `key-${i}`, key: val.trim(), inUse: false });
            }
        }
        if (loaded.length === 0 && process.env.GEMINI_API_KEY?.trim()) {
            loaded.push({ id: "key-1", key: process.env.GEMINI_API_KEY.trim(), inUse: false });
        }
        if (loaded.length === 0) {
            throw new Error("No GEMINI_API_KEY or GEMINI_API_KEY_1..5 configured.");
        }
        this.keys = loaded;
    }

    public getStatus() {
        return {
            configuredKeys: this.keys.length,
            maxConcurrency: this.maxConcurrency,
            effectiveConcurrency: this.effectiveConcurrency,
            modelName: this.modelName,
        };
    }

    private acquireKey(): KeyEntry | null {
        const key = this.keys.find(k => !k.inUse);
        if (key) {
            key.inUse = true;
            return key;
        }
        return null;
    }

    private releaseKey(key: KeyEntry) {
        key.inUse = false;
    }

    /**
     * Executes all tasks through the rate-limited queue.
     * Guarantees:
     * - Active requests NEVER exceed effectiveConcurrency.
     * - Retries return through the controlled queue.
     * - Calls onChunkSuccess as each chunk finishes to enable incremental availability.
     */
    public async processTasks(
        tasks: GeminiTask[],
        onChunkSuccess?: (questions: RawQuestion[], chunkName: string, durationMs: number) => Promise<void>
    ): Promise<{
        results: TaskResult[];
        completedWorkers: number;
        failedWorkers: number;
        questionsExtracted: number;
    }> {
        const totalChunks = tasks.length;
        console.log(`\n🚦 Gemini queue:`);
        console.log(`  total chunks: ${totalChunks}`);
        console.log(`  max concurrency: ${this.effectiveConcurrency}`);
        console.log(`  configured keys: ${this.keys.length}`);

        const results: TaskResult[] = [];
        const queue: { task: GeminiTask; attempt: number; workerIndex: number }[] = tasks.map((task, i) => ({
            task,
            attempt: 1,
            workerIndex: i + 1,
        }));

        let workerIndexCounter = tasks.length;
        let completedWorkers = 0;
        let failedWorkers = 0;
        let totalQuestions = 0;

        return new Promise((resolve) => {
            const checkDone = () => {
                if (this.activeWorkers === 0 && queue.length === 0) {
                    resolve({
                        results,
                        completedWorkers,
                        failedWorkers,
                        questionsExtracted: totalQuestions,
                    });
                }
            };

            const runNext = async () => {
                if (queue.length === 0 || this.activeWorkers >= this.effectiveConcurrency) {
                    checkDone();
                    return;
                }

                const keyEntry = this.acquireKey();
                if (!keyEntry) {
                    // No key currently idle; wait for active worker to release
                    checkDone();
                    return;
                }

                const item = queue.shift()!;
                this.activeWorkers++;
                const { task, attempt, workerIndex } = item;

                const startTime = Date.now();
                console.log(`\nWorker ${workerIndex}:`);
                console.log(`  chunk: ${task.chunkName}`);
                console.log(`  key: ${keyEntry.id}`);
                console.log(`  start: ${new Date(startTime).toISOString()}`);

                try {
                    const questions = await this.extractWithGemini(
                        keyEntry.key,
                        this.modelName,
                        task.sectionText,
                        task.targetSubject
                    );

                    const durationMs = Date.now() - startTime;
                    console.log(`  duration: ${durationMs}ms`);
                    console.log(`  questions: ${questions.length}`);

                    // Trigger incremental persistence immediately before marking worker complete
                    if (onChunkSuccess && questions.length > 0) {
                        try {
                            await onChunkSuccess(questions, task.chunkName, durationMs);
                        } catch (err: any) {
                            console.error(`⚠️ Error during incremental save for ${task.chunkName}:`, err.message);
                        }
                    }

                    this.releaseKey(keyEntry);
                    this.activeWorkers--;

                    completedWorkers++;
                    totalQuestions += questions.length;

                    results.push({
                        taskId: task.id,
                        chunkName: task.chunkName,
                        workerIndex,
                        keyId: keyEntry.id,
                        durationMs,
                        questions,
                        success: true,
                    });

                    // Schedule next tasks
                    runNext();
                    runNext();
                } catch (err: any) {
                    const durationMs = Date.now() - startTime;
                    this.releaseKey(keyEntry);
                    this.activeWorkers--;

                    console.error(`❌ Worker ${workerIndex} [${task.chunkName}] failed: ${err.message}`);

                    if (isFatalError(err) || attempt >= 3) {
                        // Non-retryable or max retries reached
                        console.error(`🛑 Worker ${workerIndex} [${task.chunkName}] permanently failed after attempt ${attempt}`);
                        failedWorkers++;
                        results.push({
                            taskId: task.id,
                            chunkName: task.chunkName,
                            workerIndex,
                            keyId: keyEntry.id,
                            durationMs,
                            questions: [],
                            success: false,
                            error: err.message,
                        });
                        runNext();
                    } else {
                        // Transient 429/500/503: short backoff with random jitter (~1-2s + jitter)
                        const baseDelay = 1000 * Math.pow(1.5, attempt - 1);
                        const jitter = Math.floor(Math.random() * 500);
                        const retryDelay = Math.min(baseDelay + jitter, 3500);
                        console.log(`🔄 Worker ${workerIndex} [${task.chunkName}] retrying in ${retryDelay}ms (attempt ${attempt + 1}/3)...`);

                        setTimeout(() => {
                            workerIndexCounter++;
                            queue.push({
                                task,
                                attempt: attempt + 1,
                                workerIndex: workerIndexCounter,
                            });
                            runNext();
                        }, retryDelay);

                        // Don't stall queue for other items
                        runNext();
                    }
                }
            };

            // Prime initial workers up to effective concurrency
            for (let i = 0; i < this.effectiveConcurrency; i++) {
                runNext();
            }
        });
    }

    private async extractWithGemini(
        apiKey: string,
        modelName: string,
        sectionText: string,
        fallbackSubject?: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS"
    ): Promise<RawQuestion[]> {
        if (!sectionText.trim()) return [];

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
            },
        });

        const prompt = `You are a high-speed, precision JEE question extraction engine.
Convert the following OCR section from a JEE exam paper into a structured JSON array of questions.

--- OCR SECTION START ---
${sectionText}
--- OCR SECTION END ---

RULES:
1. Extract EVERY question present in this section.
2. Subject must be one of: "PHYSICS", "CHEMISTRY", "MATHEMATICS". If not explicit in the question header, detect from the nearest preceding section heading or default to "${fallbackSubject || "PHYSICS"}".
3. questionType: "MCQ" or "INTEGER".
4. options: For MCQ, extract as {"A": "...", "B": "...", "C": "...", "D": "..."}. For INTEGER, options MUST be null.
5. correctAnswer: Extract ONLY if an answer is explicitly printed in the text (e.g. "(B)", "Ans: B", "Ans: 42"). NEVER solve, NEVER infer. If absent, correctAnswer MUST be null.
6. solutionText: Extract ONLY if an explanation or solution is explicitly printed (e.g. "Sol.", "Solution:"). NEVER invent or generate solutions. If absent, solutionText MUST be null.
7. hasVisual: true if the question requires or references a diagram, figure, circuit, ray diagram, graph, table, or chemical structure image. Otherwise false.
8. pageNumber: Extract the exact integer from the nearest preceding "--- Page N ---" marker. If absent, null. NEVER estimate or guess page numbers.

Return ONLY a JSON array matching this exact schema:
[
  {
    "questionNumber": 1,
    "subject": "MATHEMATICS",
    "questionType": "MCQ",
    "questionText": "...",
    "options": {
      "A": "...",
      "B": "...",
      "C": "...",
      "D": "..."
    },
    "correctAnswer": "B",
    "solutionText": "...",
    "hasVisual": false,
    "pageNumber": 2
  }
]`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();

        if (!cleaned || cleaned === "[]") {
            return [];
        }

        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return (parsed as RawQuestion[]).map((q) => {
            let subj = q.subject?.toUpperCase();
            if (!subj || !["PHYSICS", "CHEMISTRY", "MATHEMATICS"].includes(subj)) {
                subj = fallbackSubject || "PHYSICS";
            }
            return {
                ...q,
                subject: subj,
                correctAnswer: q.correctAnswer != null && String(q.correctAnswer).trim() !== "" ? String(q.correctAnswer).trim() : null,
                solutionText: q.solutionText?.trim() || null,
                hasVisual: Boolean(q.hasVisual),
                pageNumber: typeof q.pageNumber === "number" && q.pageNumber >= 1 ? q.pageNumber : null,
            };
        });
    }
}

export type RawQuestion = {
    questionText: string;
    options: { A: string; B: string; C: string; D: string } | null;
    detectedType: "MCQ" | "INTEGER" | "UNKNOWN";
    confidence: "HIGH" | "LOW";
    correctAnswer?: string;
    solutionText?: string | null;
};

export function parseJeePaper(rawText: string): RawQuestion[] {
    const results: RawQuestion[] = [];

    // Clean up typical PDF pagination junk and headers
    let cleanText = rawText
        .replace(/page \d+ of \d+/gi, '')
        .replace(/-- \d+ of \d+ --/gi, '')
        .replace(/TEST PAPER WITH SOLUTION/gi, '')
        .replace(/IMPORTANT INSTRUCTIONS:.*/gi, '')
        .replace(/\n\s*M\.M:\s*\d+/gi, '')
        .replace(/\n\s*Time:\s*\d+\s*hrs.*/gi, '');

    // Split text by lines starting with a number and a dot (e.g., "1. Let a...")
    const chunks = cleanText.split(/(?:^|\n)(?=\s*\d+\.\s)/);

    for (const chunk of chunks) {
        if (!/^\s*\d+\.\s/.test(chunk)) continue; // Chunk must start with a question number

        let questionText = chunk.trim();

        let detectedType: "MCQ" | "INTEGER" | "UNKNOWN" = "UNKNOWN";
        let options: { A: string; B: string; C: string; D: string } | null = null;
        let correctAnswer = "A"; // Safe default
        let solutionText = "";
        let confidence: "HIGH" | "LOW" = "HIGH";

        // 1. Extract Solution
        const solMatch = questionText.match(/(?:^|\n|\s)(?:Sol\.|sol\.|Solution[:.])/);
        if (solMatch && solMatch.index !== undefined) {
            solutionText = questionText.substring(solMatch.index + solMatch[0].length).trim();
            questionText = questionText.substring(0, solMatch.index).trim();
        }

        // 2. Extract Answer
        const ansMatch = questionText.match(/(?:^|\n|\s)Ans\.\s*(?:\()?(A|B|C|D|1|2|3|4|-?\d+(?:\.\d+)?)(?:\))?/i);
        if (ansMatch) {
            let mappedAns = ansMatch[1].toUpperCase();
            // Map 1/2/3/4 to A/B/C/D if it's an MCQ
            if (mappedAns === "1") mappedAns = "A";
            else if (mappedAns === "2") mappedAns = "B";
            else if (mappedAns === "3") mappedAns = "C";
            else if (mappedAns === "4") mappedAns = "D";

            correctAnswer = mappedAns;
            if (ansMatch.index !== undefined) {
                questionText = questionText.substring(0, ansMatch.index).trim();
            }
        }

        // 3. Extract Options
        // Looking for standard Option patterns: (1) ... (2) ... (3) ... (4) ... OR (A) ...
        const optNumPattern = /(?:\(1\)|1\))((?:(?!\(2\)|2\))[\s\S])*?)(?:\(2\)|2\))((?:(?!\(3\)|3\))[\s\S])*?)(?:\(3\)|3\))((?:(?!\(4\)|4\))[\s\S])*?)(?:\(4\)|4\))([\s\S]*)$/;
        const optAlphaPattern = /(?:\(A\)|A\))((?:(?!\(B\)|B\))[\s\S])*?)(?:\(B\)|B\))((?:(?!\(C\)|C\))[\s\S])*?)(?:\(C\)|C\))((?:(?!\(D\)|D\))[\s\S])*?)(?:\(D\)|D\))([\s\S]*)$/i;

        const numMatch = questionText.match(optNumPattern);
        const alphaMatch = questionText.match(optAlphaPattern);

        if (numMatch) {
            options = {
                A: numMatch[1].trim(),
                B: numMatch[2].trim(),
                C: numMatch[3].trim(),
                D: numMatch[4].trim(),
            };
            detectedType = "MCQ";
            if (numMatch.index !== undefined) questionText = questionText.substring(0, numMatch.index).trim();
        } else if (alphaMatch) {
            options = {
                A: alphaMatch[1].trim(),
                B: alphaMatch[2].trim(),
                C: alphaMatch[3].trim(),
                D: alphaMatch[4].trim(),
            };
            detectedType = "MCQ";
            if (alphaMatch.index !== undefined) questionText = questionText.substring(0, alphaMatch.index).trim();
        } else {
            detectedType = "INTEGER";
        }

        // Strip the leading "X. " 
        questionText = questionText.replace(/^\d+\.\s*/, '').trim();

        if (questionText.length < 5) continue;

        results.push({
            questionText,
            options,
            correctAnswer,
            solutionText: solutionText || null,
            detectedType,
            confidence
        });
    }

    // FALLBACK: If strict parsing completely failed (0 questions extracted), 
    // the PDF likely uses `1)` or doesn't have clean newlines. Try relaxed naive splitting.
    if (results.length === 0) {
        const relaxedChunks = rawText.split(/(?:^|\n)(?=Q?\s*\d+[\.\)])/gi);
        for (const chunk of relaxedChunks) {
            if (chunk.trim().length < 15) continue;
            if (chunk.toLowerCase().includes("answer key") || chunk.toLowerCase().includes("solutions")) continue;

            results.push({
                questionText: "[FALLBACK] " + chunk.trim().substring(0, 1500),
                options: null,
                correctAnswer: "A",
                solutionText: null,
                detectedType: "UNKNOWN",
                confidence: "LOW" // Flag as requiring review since formatting was broken
            });
        }
    }

    return results;
}

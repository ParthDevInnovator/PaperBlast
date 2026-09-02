export type RawQuestion = {
    questionText: string;
    options: { A: string; B: string; C: string; D: string } | null;
    detectedType: "MCQ" | "INTEGER" | "UNKNOWN";
    confidence: "HIGH" | "LOW";
};

export function parseJeePaper(rawText: string): RawQuestion[] {
    const results: RawQuestion[] = [];

    // Split by question markers: Q1, Q. 1, 1., 1) etc. preceded by newline
    const chunks = rawText.split(/(?:^|\n)(?:Q|Question)?\s*\.?\s*\d+[\.\:\)]/gi).filter(Boolean);

    for (const chunk of chunks) {
        // Discard very short chunks (page headers, whitespace)
        if (chunk.trim().length < 20) continue;

        // Discard obvious non-question sections
        const lowerChunk = chunk.toLowerCase();
        if (
            lowerChunk.includes("answer key") ||
            lowerChunk.includes("solutions") ||
            lowerChunk.includes("general instructions") ||
            lowerChunk.includes("important instructions")
        ) {
            continue;
        }

        // Try extracting A/B/C/D or 1/2/3/4 options 
        let options: { A: string; B: string; C: string; D: string } | null = null;
        let detectedType: "MCQ" | "INTEGER" | "UNKNOWN" = "UNKNOWN";
        let confidence: "HIGH" | "LOW" = "LOW";

        // Simple regex to see if options exist
        const hasAlphaOptions = /(\(a\)|a\))/i.test(chunk) && /(\(b\)|b\))/i.test(chunk) && /(\(c\)|c\))/i.test(chunk) && /(\(d\)|d\))/i.test(chunk);
        const hasNumOptions = /(\(1\)|1\))/.test(chunk) && /(\(2\)|2\))/.test(chunk) && /(\(3\)|3\))/.test(chunk) && /(\(4\)|4\))/.test(chunk);

        if (hasAlphaOptions || hasNumOptions) {
            options = { A: "Option 1 (To be extracted)", B: "Option 2", C: "Option 3", D: "Option 4" }; // We can improve parsing later
            detectedType = "MCQ";
            confidence = "HIGH";
        } else {
            // Probably Integer or junk
            // Check if it ends with typical integer signals
            if (chunk.match(/answer is \w/i) || chunk.match(/value is/i) || chunk.trim().match(/\d+$/)) {
                detectedType = "INTEGER";
                // Let's keep it LOW mapping to integer for now
                confidence = "LOW";
            }
        }

        results.push({
            questionText: (confidence === "LOW" ? "[LOW CONFIDENCE] " : "") + chunk.trim().substring(0, 1500),
            options,
            detectedType,
            confidence
        });
    }

    return results;
}

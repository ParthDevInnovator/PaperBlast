export type RawQuestion = {
    questionNumber?: number;
    subject?: string;
    questionText: string;
    options: Record<string, string> | null;
    questionType: "MCQ" | "INTEGER";
    correctAnswer?: string | number | null;
    solutionText?: string | null;
    hasVisual?: boolean;
    pageNumber?: number | null;
    imageUrl?: string | null;
};

export type PreprocessedDocument = {
    questionsText: string;
    answerKeyText: string;
    imageBlocks: any[];
};

export type SubjectSection = {
    subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
    text: string;
};

/**
 * Local Preprocessor:
 * Isolates and strips true answer key tables from the end of the document.
 * Protects against falsely matching "Solutions" or "Answers" in paper titles/instructions on Page 1.
 */
export function preprocessMarkdown(markdown: string): PreprocessedDocument {
    const answerKeyRegex = /(?:^|\n)#+\s*(?:Answer Key|Final Answers?|Official Answer Key)[\s\S]*/i;
    const match = markdown.match(answerKeyRegex);

    let questionsText = markdown;
    let answerKeyText = "";

    // Only strip if found in the second half of the document (> 50% through)
    if (match && match.index && match.index > markdown.length * 0.5) {
        answerKeyText = match[0].trim();
        questionsText = markdown.substring(0, match.index).trim();
    }

    return {
        questionsText,
        answerKeyText,
        imageBlocks: [],
    };
}

/**
 * Local Section Splitter:
 * Splits the page-aware Markdown into the 3 core JEE subjects:
 * Mathematics, Physics, and Chemistry.
 */
export function splitBySubjectSections(questionsText: string): SubjectSection[] {
    // Matches subject headings even if formatted in tables or markdown:
    // e.g. "| MATHEMATICS |", "# **PHYSICS** |", "## CHEMISTRY", "PART I: PHYSICS", "**MATHEMATICS**"
    const sectionPattern = /(?:^|\n|\|)\s*(?:#+\s*)?(?:\*{1,3}\s*)?(?:\[\s*)?(?:(?:SECTION|PART)\s*[-:]?\s*(?:[1-3]|[A-C]|I{1,3})\s*[-:—]?\s*)?(PHYSICS|CHEMISTRY|MATHEMATICS)(?:\s*[-:—]\s*(?:SECTION|PART)\s*[A-C1-3])?(?:\*{1,3})?(?:\s*\])?\s*(?:\||\n|$)/gi;

    type Match = {
        subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
        index: number;
        length: number;
    };

    const matches: Match[] = [];
    let m: RegExpExecArray | null;
    while ((m = sectionPattern.exec(questionsText)) !== null) {
        const rawSub = m[1].toUpperCase();
        let subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS" = "PHYSICS";
        if (rawSub.includes("CHEM")) subject = "CHEMISTRY";
        else if (rawSub.includes("MATH")) subject = "MATHEMATICS";
        else subject = "PHYSICS";

        matches.push({
            subject,
            index: m.index,
            length: m[0].length,
        });
    }

    // Filter to distinct subjects by first appearance, ignoring occurrences in the first 500 chars (title/header)
    const seen = new Set<string>();
    const distinctMatches = matches
        .filter(matchItem => {
            // Ignore if in the very first 300 characters (paper cover/header)
            if (matchItem.index < 300) return false;
            if (seen.has(matchItem.subject)) return false;
            seen.add(matchItem.subject);
            return true;
        })
        .sort((a, b) => a.index - b.index);

    // If at least 2 subject headers were detected
    if (distinctMatches.length >= 2) {
        const sections: SubjectSection[] = [];
        for (let i = 0; i < distinctMatches.length; i++) {
            const current = distinctMatches[i];
            const start = current.index;
            const end = i < distinctMatches.length - 1 ? distinctMatches[i + 1].index : questionsText.length;
            let text = questionsText.substring(start, end).trim();

            // Carry forward the preceding page marker if text doesn't start with one
            if (!text.startsWith("--- Page")) {
                const textBefore = questionsText.substring(0, start);
                const pageMatches = [...textBefore.matchAll(/--- Page (\d+) ---/g)];
                if (pageMatches.length > 0) {
                    text = `${pageMatches[pageMatches.length - 1][0]}\n${text}`;
                }
            }

            sections.push({
                subject: current.subject,
                text,
            });
        }
        return sections;
    }

    // Fallback: Split page-aware text into 3 balanced parts
    const pages = questionsText.split(/^(?=--- Page \d+ ---)/m).filter(s => s.trim().length > 0);
    if (pages.length >= 3) {
        const third = Math.ceil(pages.length / 3);
        return [
            { subject: "PHYSICS", text: pages.slice(0, third).join("\n\n") },
            { subject: "CHEMISTRY", text: pages.slice(third, third * 2).join("\n\n") },
            { subject: "MATHEMATICS", text: pages.slice(third * 2).join("\n\n") },
        ];
    }

    // Ultimate fallback: 3 equal character segments
    const thirdLen = Math.floor(questionsText.length / 3);
    return [
        { subject: "PHYSICS", text: questionsText.substring(0, thirdLen).trim() },
        { subject: "CHEMISTRY", text: questionsText.substring(thirdLen, thirdLen * 2).trim() },
        { subject: "MATHEMATICS", text: questionsText.substring(thirdLen * 2).trim() },
    ];
}

/**
 * Question Segmenter (Kept for chunk-based utility)
 */
export function segmentQuestions(questionsText: string, chunkSize: number = 15): string[] {
    const qSplitRegex = /(?:^|\n)(?=(?:#+\s*)?(?:Q(?:uestion)?\.?\s*\d+[\.\:\)]|\(?\d+\)[\.\s]|\d+\.\s))/i;
    const rawChunks = questionsText.split(qSplitRegex).filter(c => c.trim().length > 0);

    if (rawChunks.length <= 1) {
        const pages = questionsText.split(/^(?=--- Page \d+ ---)/m).filter(s => s.trim().length > 0);
        const pageChunks: string[] = [];
        const pagesPerChunk = 4;
        for (let i = 0; i < pages.length; i += pagesPerChunk) {
            pageChunks.push(pages.slice(i, i + pagesPerChunk).join("\n\n"));
        }
        return pageChunks.length > 0 ? pageChunks : [questionsText];
    }

    const segments: string[] = [];
    let currentSegment: string[] = [];
    let questionCount = 0;
    let currentPage = 1;

    for (const chunk of rawChunks) {
        const pageMatches = [...chunk.matchAll(/--- Page (\d+) ---/g)];
        if (pageMatches.length > 0) {
            currentPage = parseInt(pageMatches[pageMatches.length - 1][1], 10);
        }

        if (currentSegment.length === 0 && !chunk.trim().startsWith("--- Page")) {
            currentSegment.push(`--- Page ${currentPage} ---`);
        }

        currentSegment.push(chunk);

        if (qSplitRegex.test("\n" + chunk)) {
            questionCount++;
        }

        if (questionCount >= chunkSize) {
            segments.push(currentSegment.join("\n\n"));
            currentSegment = [];
            questionCount = 0;
        }
    }

    if (currentSegment.length > 0) {
        segments.push(currentSegment.join("\n\n"));
    }

    return segments;
}

export type ExtractionChunk = {
    id: string;
    name: string;
    text: string;
    subject?: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
};

/**
 * Splits a section text into 2 sub-chunks along a page marker or question boundary.
 */
function splitSectionInHalf(section: SubjectSection): ExtractionChunk[] {
    const pages = section.text.split(/(?=--- Page \d+ ---)/g).filter(p => p.trim().length > 0);
    if (pages.length >= 2) {
        const mid = Math.ceil(pages.length / 2);
        const p1 = pages.slice(0, mid).join("\n\n").trim();
        let p2 = pages.slice(mid).join("\n\n").trim();
        // Ensure p2 has preceding page marker
        if (!p2.startsWith("--- Page")) {
            const lastPageMatch = [...p1.matchAll(/--- Page (\d+) ---/g)].pop();
            if (lastPageMatch) {
                p2 = `${lastPageMatch[0]}\n${p2}`;
            }
        }
        return [
            {
                id: `${section.subject}-Part1`,
                name: `${section.subject} (Part 1)`,
                text: p1,
                subject: section.subject,
            },
            {
                id: `${section.subject}-Part2`,
                name: `${section.subject} (Part 2)`,
                text: p2,
                subject: section.subject,
            },
        ];
    }

    // Fallback: split by question markers
    const qSplitRegex = /(?:^|\n)(?=(?:#+\s*)?(?:Q(?:uestion)?\.?\s*\d+[\.\:\)]|\(?\d+\)[\.\s]|\b\d{1,2}\.\s))/i;
    const parts = section.text.split(qSplitRegex).filter(p => p.trim().length > 0);
    if (parts.length >= 2) {
        const mid = Math.ceil(parts.length / 2);
        return [
            {
                id: `${section.subject}-Part1`,
                name: `${section.subject} (Part 1)`,
                text: parts.slice(0, mid).join("\n\n").trim(),
                subject: section.subject,
            },
            {
                id: `${section.subject}-Part2`,
                name: `${section.subject} (Part 2)`,
                text: parts.slice(mid).join("\n\n").trim(),
                subject: section.subject,
            },
        ];
    }

    return [
        {
            id: section.subject,
            name: section.subject,
            text: section.text,
            subject: section.subject,
        },
    ];
}

/**
 * Segments page-aware OCR text into approximately 3-5 balanced chunks (default: 4).
 * Always preserves page boundaries and subject context.
 */
export function segmentDocumentIntoChunks(
    pageAwareText: string,
    targetChunks: number = 4
): ExtractionChunk[] {
    const { questionsText } = preprocessMarkdown(pageAwareText);
    const sections = splitBySubjectSections(questionsText);

    if (sections.length >= 2) {
        // If we have distinct subject sections
        if (targetChunks <= 3 || sections.length >= targetChunks) {
            return sections.map(s => ({
                id: s.subject,
                name: s.subject,
                text: s.text,
                subject: s.subject,
            }));
        }

        // targetChunks == 4: split the largest section into 2 parts
        // targetChunks == 5: split the 2 largest sections into 2 parts
        const sortedByLen = [...sections].sort((a, b) => b.text.length - a.text.length);
        const toSplitCount = targetChunks - sections.length;
        const sectionsToSplit = new Set(sortedByLen.slice(0, toSplitCount).map(s => s.subject));

        const finalChunks: ExtractionChunk[] = [];
        for (const s of sections) {
            if (sectionsToSplit.has(s.subject)) {
                finalChunks.push(...splitSectionInHalf(s));
            } else {
                finalChunks.push({
                    id: s.subject,
                    name: s.subject,
                    text: s.text,
                    subject: s.subject,
                });
            }
        }
        return finalChunks;
    }

    // Fallback: Segment by pages into targetChunks
    const pages = questionsText.split(/(?=--- Page \d+ ---)/g).filter(p => p.trim().length > 0);
    if (pages.length >= targetChunks) {
        const perChunk = Math.ceil(pages.length / targetChunks);
        const chunks: ExtractionChunk[] = [];
        for (let i = 0; i < targetChunks; i++) {
            const slice = pages.slice(i * perChunk, (i + 1) * perChunk);
            if (slice.length > 0) {
                const label = String.fromCharCode(65 + i); // A, B, C, D...
                chunks.push({
                    id: `Chunk-${label}`,
                    name: `Chunk ${label}`,
                    text: slice.join("\n\n").trim(),
                });
            }
        }
        return chunks;
    }

    return [
        {
            id: "Chunk-A",
            name: "Chunk A",
            text: questionsText,
        },
    ];
}


import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runExtraction } from "../lib/run-extraction";

async function main() {
    console.log("==================================================");
    console.log("🧪 RUNNING FULL PIPELINE VERIFICATION TEST");
    console.log("==================================================");

    const paperId = "cmtpt3o620000cwvedfd77a74";
    const paper = await prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) {
        console.error("❌ Paper not found:", paperId);
        process.exit(1);
    }

    console.log(`📄 Paper: "${paper.title}" (${paper.id})`);
    console.log(`🔗 PDF URL: ${paper.sourcePdfUrl}`);

    // Clean any prior questions from earlier failed attempts for clean baseline
    await prisma.question.deleteMany({ where: { paperId } });
    console.log("🧹 Cleaned prior questions for paper");

    const tStart = Date.now();
    const result = await runExtraction(paperId);
    const totalWallMs = Date.now() - tStart;

    console.log("\n==================================================");
    console.log("📊 POST-EXTRACTION DATABASE VERIFICATION");
    console.log("==================================================");

    const savedQuestions = await prisma.question.findMany({
        where: { paperId },
        orderBy: { id: "asc" },
    });

    const finalPaper = await prisma.paper.findUnique({ where: { id: paperId } });

    console.log(`✅ Total Questions Saved in DB: ${savedQuestions.length}`);
    console.log(`✅ Paper Status: ${finalPaper?.status}`);

    // Group by subject
    const bySubject = savedQuestions.reduce((acc, q) => {
        acc[q.subject] = (acc[q.subject] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    console.log("📚 Questions by Subject:", bySubject);

    // Visual questions
    const withVisuals = savedQuestions.filter((q) => q.imageUrl);
    console.log(`🎨 Questions with Visual Image: ${withVisuals.length}`);
    if (withVisuals.length > 0) {
        console.log(`   Example image URL: ${withVisuals[0].imageUrl}`);
    }

    // Check rules: never solve, never infer
    const withAnswers = savedQuestions.filter((q) => q.correctAnswer && q.correctAnswer.trim() !== "");
    const withoutAnswers = savedQuestions.filter((q) => !q.correctAnswer || q.correctAnswer.trim() === "");
    console.log(`📝 Questions with Printed Answers: ${withAnswers.length}`);
    console.log(`📝 Questions without Printed Answers (null/empty): ${withoutAnswers.length}`);

    const withSolutions = savedQuestions.filter((q) => q.solutionText);
    console.log(`💡 Questions with Printed Solutions: ${withSolutions.length}`);

    // Verify initial time
    console.log(`⚡ Initial Questions Available: ${result.initialAvailableMs} ms`);
    console.log(`⏱ Total Wall Time: ${totalWallMs} ms`);

    console.log("\n==================================================");
    console.log("🏁 VERIFICATION RESULT: " + (savedQuestions.length >= 60 ? "SUCCESS ✅" : "WARNING ⚠️"));
    console.log("==================================================\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Pipeline test failed:", err);
    process.exit(1);
});

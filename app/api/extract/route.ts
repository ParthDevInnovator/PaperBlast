import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { runExtraction } from "@/lib/run-extraction";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const paperId = body.paperId as string | null;
        if (!paperId) {
            return NextResponse.json({ success: false, error: "Missing paperId" }, { status: 400 });
        }

        const result = await runExtraction(paperId);
        return NextResponse.json(result);

    } catch (e: any) {
        console.error(`❌ API Extract error: ${e.message ?? e}`);
        return NextResponse.json(
            { success: false, error: e.message || "Extraction failed." },
            { status: 500 }
        );
    }
}

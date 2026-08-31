import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { mockQuestionId, selectedAnswer } = body

    if (!mockQuestionId) {
        return NextResponse.json({ error: "mockQuestionId required" }, { status: 400 })
    }

    // Verify this mockQuestion belongs to the calling user
    const mq = await prisma.mockQuestion.findUnique({
        where: { id: mockQuestionId },
        include: { mock: { select: { userId: true, submittedAt: true } } },
    })

    if (!mq) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (mq.mock.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (mq.mock.submittedAt) return NextResponse.json({ error: "Mock already submitted" }, { status: 400 })

    await prisma.attemptAnswer.upsert({
        where: { mockQuestionId },
        update: { selectedAnswer },
        create: { mockQuestionId, selectedAnswer },
    })

    return NextResponse.json({ ok: true })
}

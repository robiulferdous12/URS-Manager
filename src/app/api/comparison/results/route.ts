import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/comparison/results?projectId=xxx
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        const results = await prisma.comparisonResult.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(results);
    } catch (error) {
        console.error("Fetch comparison results error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

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

// PUT /api/comparison/results
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();

        // Handle batch updates
        if (Array.isArray(body)) {
            const updates = body.map((item) => 
                prisma.comparisonResult.update({
                    where: { id: item.id },
                    data: {
                        vendorProposedSpec: item.vendorProposedSpec,
                        status: item.status,
                        remarks: item.remarks,
                    }
                })
            );
            
            const updatedResults = await prisma.$transaction(updates);
            return NextResponse.json(updatedResults);
        }

        // Handle single update
        const { id, vendorProposedSpec, status, remarks } = body;

        if (!id) {
            return NextResponse.json({ error: "Result ID is required" }, { status: 400 });
        }

        const updated = await prisma.comparisonResult.update({
            where: { id },
            data: {
                vendorProposedSpec,
                status,
                remarks
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Update comparison result error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}


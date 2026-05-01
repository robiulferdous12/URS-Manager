import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { items } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "Valid items array is required" },
                { status: 400 }
            );
        }

        // Batch create using a transaction for reliability
        const created = await prisma.$transaction(
            items.map((item: any) =>
                prisma.ursItem.create({
                    data: {
                        projectId: item.projectId,
                        section: item.section || "General",
                        slNo: item.slNo,
                        description: item.description,
                        specifications: item.specifications || null,
                        unit: item.unit || null,
                        quantity: item.quantity || 0,
                        remarks: item.remarks || null,
                    },
                })
            )
        );

        return NextResponse.json(
            { count: created.length, success: true },
            { status: 201 }
        );
    } catch (error) {
        console.error("URS bulk upload error:", error);
        return NextResponse.json({ error: "Failed to save items to the database" }, { status: 500 });
    }
}

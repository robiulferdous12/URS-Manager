import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        const items = await prisma.ursItem.findMany({
            where: { projectId },
            orderBy: { slNo: "asc" },
        });
        return NextResponse.json(items);
    } catch (error) {
        console.error("Fetch URS items error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Support bulk create
        if (Array.isArray(body.items)) {
            const items = await prisma.$transaction(
                body.items.map((item: any) =>
                    prisma.ursItem.create({
                        data: {
                            projectId: body.projectId,
                            section: item.section || null,
                            slNo: item.slNo || 0,
                            description: item.description || "",
                            specifications: item.specifications || null,
                            unit: item.unit || null,
                            quantity: item.quantity ? parseFloat(item.quantity) : 0,
                            remarks: item.remarks || null,
                        },
                    })
                )
            );
            return NextResponse.json(items, { status: 201 });
        }

        // Single create
        const item = await prisma.ursItem.create({
            data: {
                projectId: body.projectId,
                section: body.section || null,
                slNo: body.slNo || 0,
                description: body.description || "",
                specifications: body.specifications || null,
                unit: body.unit || null,
                quantity: body.quantity ? parseFloat(body.quantity) : 0,
                remarks: body.remarks || null,
            },
        });
        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        console.error("Create URS item error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");
        const section = searchParams.get("section");

        if (!projectId || !section) {
            return NextResponse.json({ error: "projectId and section are required" }, { status: 400 });
        }

        const deleteResult = await prisma.ursItem.deleteMany({
            where: {
                projectId,
                // Handle "General" section gracefully
                section: section === "General" ? null : section
            }
        });

        // Also try to delete where section is explicitly "General" just in case it was stored as string "General"
        if (section === "General") {
            const extraResult = await prisma.ursItem.deleteMany({
                where: {
                    projectId,
                    section: "General"
                }
            });
            return NextResponse.json({ count: deleteResult.count + extraResult.count });
        }

        return NextResponse.json({ count: deleteResult.count });
    } catch (error) {
        console.error("Delete URS section error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

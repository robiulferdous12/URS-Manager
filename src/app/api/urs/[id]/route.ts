import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();

        const item = await prisma.ursItem.update({
            where: { id },
            data: {
                section: body.section ?? undefined,
                slNo: body.slNo ?? undefined,
                description: body.description ?? undefined,
                specifications: body.specifications ?? undefined,
                unit: body.unit ?? undefined,
                quantity: body.quantity !== undefined ? parseFloat(body.quantity) : undefined,
                remarks: body.remarks ?? undefined,
            },
        });
        return NextResponse.json(item);
    } catch (error) {
        console.error("Update URS item error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.ursItem.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete URS item error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const quotation = await prisma.quotation.findUnique({
            where: { id },
            include: { items: true },
        });

        if (!quotation) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json(quotation);
    } catch (error) {
        console.error("Fetch quotation error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.quotation.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete quotation error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

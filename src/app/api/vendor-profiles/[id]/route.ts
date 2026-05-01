import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/vendor-profiles/[id]
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        await prisma.vendorProfile.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete vendor profile error:", error);
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Vendor profile not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PUT /api/vendor-profiles/[id]
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { vendorName } = body;

        if (!vendorName || !vendorName.trim()) {
            return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
        }

        const updated = await prisma.vendorProfile.update({
            where: { id },
            data: { vendorName: vendorName.trim() },
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Update vendor profile error:", error);
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Vendor profile not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

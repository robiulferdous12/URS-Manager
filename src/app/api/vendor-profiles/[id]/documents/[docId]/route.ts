import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/vendor-profiles/[id]/documents/[docId]
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    try {
        const { id: vendorProfileId, docId } = await params;

        await prisma.vendorDocument.delete({
            where: { id: docId },
        });

        // Re-aggregate combined text
        const allDocs = await prisma.vendorDocument.findMany({
            where: { vendorProfileId },
            select: { extractedText: true, fileName: true },
        });

        const combinedText = allDocs
            .filter((d) => d.extractedText && !d.extractedText.startsWith("[EXTRACTION FAILED"))
            .map((d) => `=== Document: ${d.fileName} ===\n${d.extractedText}`)
            .join("\n\n");

        await prisma.vendorProfile.update({
            where: { id: vendorProfileId },
            data: { combinedText: combinedText || null },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete document error:", error);
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PUT /api/vendor-profiles/[id]/documents/[docId]
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    try {
        const { id: vendorProfileId, docId } = await params;
        const body = await req.json();
        const { fileName } = body;

        if (!fileName || !fileName.trim()) {
            return NextResponse.json({ error: "File name is required" }, { status: 400 });
        }

        const updated = await prisma.vendorDocument.update({
            where: { id: docId },
            data: { fileName: fileName.trim() },
        });

        // Re-aggregate combined text since the file name is included in the combined text header
        const allDocs = await prisma.vendorDocument.findMany({
            where: { vendorProfileId },
            select: { extractedText: true, fileName: true },
        });

        const combinedText = allDocs
            .filter((d) => d.extractedText && !d.extractedText.startsWith("[EXTRACTION FAILED"))
            .map((d) => `=== Document: ${d.fileName} ===\n${d.extractedText}`)
            .join("\n\n");

        await prisma.vendorProfile.update({
            where: { id: vendorProfileId },
            data: { combinedText: combinedText || null },
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Update document error:", error);
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

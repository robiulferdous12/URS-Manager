import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile, detectFileType } from "@/lib/fileParser";

// GET /api/vendor-profiles/[id]/documents — List documents for a vendor profile
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const documents = await prisma.vendorDocument.findMany({
            where: { vendorProfileId: id },
            orderBy: { createdAt: "desc" },
        });

        // Return docs with text length instead of full extracted text
        const docs = documents.map((d) => {
            const isFailed = d.extractedText?.startsWith("[EXTRACTION FAILED");
            return {
                ...d,
                extractedTextLength: isFailed ? 0 : (d.extractedText?.length || 0),
                extractedText: d.extractedText?.substring(0, 200) || null, // Preview only
            };
        });

        return NextResponse.json(docs);
    } catch (error) {
        console.error("Fetch documents error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/vendor-profiles/[id]/documents — Upload and process a document
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vendorProfileId } = await params;

        // Verify vendor profile exists
        const profile = await prisma.vendorProfile.findUnique({
            where: { id: vendorProfileId },
        });

        if (!profile) {
            return NextResponse.json({ error: "Vendor profile not found" }, { status: 404 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const fileName = file.name;
        const fileType = detectFileType(fileName);

        if (fileType === "unknown") {
            return NextResponse.json(
                { error: `Unsupported file type. Supported: Excel, PDF, Word, Images` },
                { status: 400 }
            );
        }

        // Read file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract text from file
        let extractedText = "";
        try {
            const result = await extractTextFromFile(buffer, fileName, file.type || "");
            extractedText = result.text;
        } catch (parseError: any) {
            console.error(`File parsing error for ${fileName}:`, parseError.message);
            // Still save the document record but with an error note
            extractedText = `[EXTRACTION FAILED: ${parseError.message}]`;
        }

        // Save document record
        const document = await prisma.vendorDocument.create({
            data: {
                vendorProfileId,
                fileName,
                fileType,
                extractedText,
            },
        });

        // Re-aggregate combined text for the vendor profile
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
            data: { combinedText },
        });

        return NextResponse.json(
            {
                id: document.id,
                fileName: document.fileName,
                fileType: document.fileType,
                extractedTextLength: extractedText.length,
                extractedTextPreview: extractedText.substring(0, 300),
                success: !extractedText.startsWith("[EXTRACTION FAILED"),
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Upload document error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}

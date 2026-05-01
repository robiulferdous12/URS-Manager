import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/vendor-profiles?projectId=xxx
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        const profiles = await prisma.vendorProfile.findMany({
            where: { projectId },
            include: {
                documents: {
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        fileName: true,
                        fileType: true,
                        fileUrl: true,
                        extractedText: true, // Need to fetch to calculate length, will remove later
                        createdAt: true,
                        vendorProfileId: true,
                    },
                },
                _count: {
                    select: {
                        documents: true,
                        results: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" },
        });

        // Add document text length info without sending the full text
        const enriched = profiles.map((p) => ({
            ...p,
            combinedTextLength: p.combinedText?.length || 0,
            combinedText: null, // Don't send full text to client list view
            documents: p.documents.map(d => {
                const isFailed = d.extractedText?.startsWith("[EXTRACTION FAILED");
                return {
                    ...d,
                    extractedTextLength: isFailed ? 0 : (d.extractedText?.length || 0),
                    extractedText: undefined, // Remove full text
                };
            })
        }));

        return NextResponse.json(enriched);
    } catch (error) {
        console.error("Fetch vendor profiles error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/vendor-profiles — Create a new vendor profile
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, vendorName } = body;

        if (!projectId || !vendorName?.trim()) {
            return NextResponse.json(
                { error: "projectId and vendorName are required" },
                { status: 400 }
            );
        }

        // Check for duplicate vendor name in same project
        const existing = await prisma.vendorProfile.findFirst({
            where: { projectId, vendorName: vendorName.trim() },
        });

        if (existing) {
            return NextResponse.json(
                { error: `Vendor "${vendorName.trim()}" already exists in this project` },
                { status: 409 }
            );
        }

        const profile = await prisma.vendorProfile.create({
            data: {
                projectId,
                vendorName: vendorName.trim(),
            },
            include: {
                documents: true,
                _count: { select: { documents: true, results: true } },
            },
        });

        return NextResponse.json(profile, { status: 201 });
    } catch (error) {
        console.error("Create vendor profile error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

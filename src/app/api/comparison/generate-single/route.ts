import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { evaluateSpecification } from "@/lib/gemini";

// POST /api/comparison/generate-single — Run AI comparison for a single URS item and vendor
// Body: { projectId, vendorId, ursItemId }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, vendorId, ursItemId, model } = body;

        if (!projectId || !vendorId || !ursItemId) {
            return NextResponse.json({ error: "projectId, vendorId, and ursItemId are required" }, { status: 400 });
        }

        // Fetch the specific URS item
        let ursItem;
        if (ursItemId === "PRICE_DATA") {
            ursItem = {
                id: "PRICE_DATA",
                projectId: projectId,
                description: "Price Data",
                specifications: "Extract ONLY the overall pricing details: Total Price, currency, VAT/Tax, Duty, Freight Charge, and any specific cost breakdown. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            };
        } else if (ursItemId === "WARRANTY") {
            ursItem = {
                id: "WARRANTY",
                projectId: projectId,
                description: "Warranty",
                specifications: "Extract ONLY the warranty terms: Duration, conditions, and coverage. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            };
        } else if (ursItemId === "COMMERCIAL_TERMS") {
            ursItem = {
                id: "COMMERCIAL_TERMS",
                projectId: projectId,
                description: "Commercial Terms",
                specifications: "Extract ONLY the commercial terms: Delivery Time, Payment Terms, and validity. DO NOT provide pricing, taxes, freight, or warranty. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            };
        } else {
            ursItem = await prisma.ursItem.findUnique({
                where: { id: ursItemId },
            });
        }

        if (!ursItem || ursItem.projectId !== projectId) {
            return NextResponse.json({ error: "URS item not found." }, { status: 404 });
        }

        // Fetch the specific vendor profile
        const vendorProfile = await prisma.vendorProfile.findUnique({
            where: { id: vendorId },
        });

        if (!vendorProfile || vendorProfile.projectId !== projectId || !vendorProfile.combinedText) {
            return NextResponse.json({ error: "Vendor profile not found or has no documents." }, { status: 404 });
        }

        // Run evaluation
        const result = await evaluateSpecification({
            ursDescription: ursItem.description,
            ursSpecification: ursItem.specifications || "",
            ursRemarks: ursItem.remarks || undefined,
            vendorName: vendorProfile.vendorName,
            vendorText: vendorProfile.combinedText,
        }, model !== "auto" ? model : undefined);

        // Upsert result to database
        const savedResult = await prisma.comparisonResult.upsert({
            where: {
                vendorProfileId_ursItemId: {
                    vendorProfileId: vendorProfile.id,
                    ursItemId: ursItem.id,
                },
            },
            create: {
                projectId,
                vendorProfileId: vendorProfile.id,
                ursItemId: ursItem.id,
                vendorProposedSpec: result.vendor_proposed_spec,
                status: result.status,
                remarks: result.remarks,
            },
            update: {
                vendorProposedSpec: result.vendor_proposed_spec,
                status: result.status,
                remarks: result.remarks,
            },
        });

        return NextResponse.json({
            success: true,
            result: savedResult,
        });
    } catch (error: any) {
        console.error("Generate single comparison error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate comparison" },
            { status: 500 }
        );
    }
}

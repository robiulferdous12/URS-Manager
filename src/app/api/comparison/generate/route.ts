import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { evaluateVendorAgainstURS } from "@/lib/gemini";

// POST /api/comparison/generate — Run AI comparison for a project
// Body: { projectId, vendorId? }
// - If vendorId is provided: re-analyze ONLY that vendor (even if already analyzed)
// - If vendorId is omitted: analyze only vendors that have NO existing results (skip already analyzed)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, vendorId, model } = body;

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        // 1. Fetch all URS items
        const ursItems = await prisma.ursItem.findMany({
            where: { projectId },
            orderBy: { slNo: "asc" },
        });

        if (ursItems.length === 0) {
            return NextResponse.json(
                { error: "No URS items found. Add items in the URS Builder first." },
                { status: 400 }
            );
        }

        // 2. Fetch vendor profiles
        const vendorProfiles = await prisma.vendorProfile.findMany({
            where: {
                projectId,
                ...(vendorId ? { id: vendorId } : {}),
            },
            select: {
                id: true,
                vendorName: true,
                combinedText: true,
            },
        });

        if (vendorProfiles.length === 0) {
            return NextResponse.json(
                { error: vendorId ? "Vendor not found." : "No vendor profiles found. Create vendors and upload documents first." },
                { status: 400 }
            );
        }

        // Filter vendors with no text
        const vendorsWithText = vendorProfiles.filter(
            (v) => v.combinedText && v.combinedText.length > 0
        );

        if (vendorsWithText.length === 0) {
            return NextResponse.json(
                { error: "No vendor documents have been processed yet. Upload documents for at least one vendor." },
                { status: 400 }
            );
        }

        // 3. Determine which vendors to actually analyze
        let vendorsToAnalyze = vendorsWithText;
        let skippedVendors: string[] = [];

        if (!vendorId) {
            // Bulk mode: skip vendors that already have results
            const existingResults = await prisma.comparisonResult.groupBy({
                by: ["vendorProfileId"],
                where: { projectId },
            });
            const analyzedVendorIds = new Set(existingResults.map((r) => r.vendorProfileId));

            vendorsToAnalyze = vendorsWithText.filter((v) => !analyzedVendorIds.has(v.id));
            skippedVendors = vendorsWithText
                .filter((v) => analyzedVendorIds.has(v.id))
                .map((v) => v.vendorName);

            if (vendorsToAnalyze.length === 0) {
                return NextResponse.json({
                    success: true,
                    totalEvaluations: 0,
                    ursItemsCount: ursItems.length,
                    vendorsCount: 0,
                    skippedVendors,
                    statusCounts: { meets: 0, doesNotMeet: 0, notMentioned: 0, partial: 0 },
                    message: "All vendors have already been analyzed. Use the individual re-analyze button to re-evaluate a specific vendor.",
                });
            }
        }

        // 4. Run evaluations per vendor
        const results: {
            ursItemId: string;
            vendorProfileId: string;
            vendorProposedSpec: string;
            status: string;
            remarks: string;
        }[] = [];

        for (const vendor of vendorsToAnalyze) {
            const evalItems = ursItems.map(item => ({
                id: item.id,
                description: item.description,
                specifications: item.specifications || "",
                remarks: item.remarks || undefined
            }));

            evalItems.push({
                id: "PRICE_DATA",
                description: "Price Data",
                specifications: "Extract ONLY the overall pricing details: Total Price, currency, VAT/Tax, Duty, Freight Charge, and any specific cost breakdown. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            });
            evalItems.push({
                id: "WARRANTY",
                description: "Warranty",
                specifications: "Extract ONLY the warranty terms: Duration, conditions, and coverage. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            });
            evalItems.push({
                id: "COMMERCIAL_TERMS",
                description: "Commercial Terms",
                specifications: "Extract ONLY the commercial terms: Delivery Time, Payment Terms, and validity. DO NOT provide pricing, taxes, freight, or warranty. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation."
            });

            try {
                const batchResults = await evaluateVendorAgainstURS(
                    vendor.vendorName,
                    vendor.combinedText!,
                    evalItems,
                    model !== "auto" ? model : undefined
                );
                
                for (const ursItemId of Object.keys(batchResults)) {
                    const evaluation = batchResults[ursItemId];
                    results.push({
                        ursItemId,
                        vendorProfileId: vendor.id,
                        vendorProposedSpec: evaluation.vendor_proposed_spec,
                        status: evaluation.status,
                        remarks: evaluation.remarks,
                    });
                }
            } catch (error: any) {
                console.error(`Batch evaluation failed for vendor ${vendor.vendorName}:`, error.message);
                // Fallback: mark all items as failed for this vendor
                for (const item of evalItems) {
                    results.push({
                        ursItemId: item.id,
                        vendorProfileId: vendor.id,
                        vendorProposedSpec: "Bulk analysis failed",
                        status: "Not Mentioned",
                        remarks: `AI evaluation failed: ${error.message}`,
                    });
                }
            }

            // Small delay between vendors if there are multiple
            if (vendorsToAnalyze.indexOf(vendor) < vendorsToAnalyze.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        // 5. Upsert results to database in small batches to avoid
        //    exhausting the connection pool (P2024 timeout fix).
        if (results.length > 0) {
            const BATCH_SIZE = 10;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const chunk = results.slice(i, i + BATCH_SIZE);
                await prisma.$transaction(
                    chunk.map((r) =>
                        prisma.comparisonResult.upsert({
                            where: {
                                vendorProfileId_ursItemId: {
                                    vendorProfileId: r.vendorProfileId,
                                    ursItemId: r.ursItemId,
                                },
                            },
                            create: {
                                projectId,
                                vendorProfileId: r.vendorProfileId,
                                ursItemId: r.ursItemId,
                                vendorProposedSpec: r.vendorProposedSpec,
                                status: r.status,
                                remarks: r.remarks,
                            },
                            update: {
                                vendorProposedSpec: r.vendorProposedSpec,
                                status: r.status,
                                remarks: r.remarks,
                            },
                        })
                    )
                );
            }
            console.log(`✓ Saved ${results.length} results in ${Math.ceil(results.length / BATCH_SIZE)} batches`);
        }

        // 6. Return summary
        const statusCounts = {
            meets: results.filter((r) => r.status === "Meets").length,
            doesNotMeet: results.filter((r) => r.status === "Does Not Meet").length,
            notMentioned: results.filter((r) => r.status === "Not Mentioned").length,
            partial: results.filter((r) => r.status === "Partial").length,
        };

        return NextResponse.json({
            success: true,
            totalEvaluations: results.length,
            ursItemsCount: ursItems.length,
            vendorsCount: vendorsToAnalyze.length,
            skippedVendors,
            statusCounts,
        });
    } catch (error: any) {
        console.error("Generate comparison error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate comparison" },
            { status: 500 }
        );
    }
}

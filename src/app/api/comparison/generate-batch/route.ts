import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { evaluateBatchItems, evaluatePass2Item, getBatchConfig } from "@/lib/gemini";

/**
 * POST /api/comparison/generate-batch
 * Evaluates a single batch of URS items against one vendor.
 * Designed for client-side orchestration to avoid Vercel timeout.
 *
 * Body: { projectId, vendorId, items: [{id, description, specifications, remarks?}], model? }
 *   OR  { projectId, vendorId, pass2Item: {id, description, specifications, remarks?}, previousStatus, previousRemarks, model? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, vendorId, items, model, pass2Item, previousStatus, previousRemarks } = body;

        if (!projectId || !vendorId) {
            return NextResponse.json({ error: "projectId and vendorId are required" }, { status: 400 });
        }

        // Fetch vendor text
        const vendor = await prisma.vendorProfile.findUnique({
            where: { id: vendorId },
            select: { vendorName: true, combinedText: true },
        });

        if (!vendor?.combinedText) {
            return NextResponse.json({ error: "Vendor not found or has no documents" }, { status: 400 });
        }

        const resolvedModel = model !== "auto" ? model : undefined;

        // ── Pass 2: Single item re-evaluation ──
        if (pass2Item) {
            try {
                const result = await evaluatePass2Item(
                    vendor.vendorName,
                    vendor.combinedText,
                    pass2Item,
                    previousStatus || "Not Mentioned",
                    previousRemarks || "",
                    resolvedModel
                );

                // Upsert to DB
                await prisma.comparisonResult.upsert({
                    where: {
                        vendorProfileId_ursItemId: {
                            vendorProfileId: vendorId,
                            ursItemId: pass2Item.id,
                        },
                    },
                    create: {
                        projectId,
                        vendorProfileId: vendorId,
                        ursItemId: pass2Item.id,
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
                    results: { [pass2Item.id]: result },
                    count: 1,
                    pass2: true,
                });
            } catch (error: any) {
                console.warn(`Pass 2 failed for "${pass2Item.description?.substring(0, 40)}": ${error.message}`);
                return NextResponse.json({
                    results: {},
                    count: 0,
                    pass2: true,
                    warning: error.message,
                });
            }
        }

        // ── Pass 1: Batch evaluation ──
        if (!items || items.length === 0) {
            return NextResponse.json({ error: "items array is required for batch evaluation" }, { status: 400 });
        }

        const batchResults = await evaluateBatchItems(
            vendor.vendorName,
            vendor.combinedText,
            items,
            resolvedModel
        );

        // Upsert results to DB (individual upserts — batch is small, no transaction needed)
        for (const [ursItemId, evaluation] of Object.entries(batchResults)) {
            await prisma.comparisonResult.upsert({
                where: {
                    vendorProfileId_ursItemId: {
                        vendorProfileId: vendorId,
                        ursItemId,
                    },
                },
                create: {
                    projectId,
                    vendorProfileId: vendorId,
                    ursItemId,
                    vendorProposedSpec: evaluation.vendor_proposed_spec,
                    status: evaluation.status,
                    remarks: evaluation.remarks,
                },
                update: {
                    vendorProposedSpec: evaluation.vendor_proposed_spec,
                    status: evaluation.status,
                    remarks: evaluation.remarks,
                },
            });
        }

        // Log progress
        for (const [id, r] of Object.entries(batchResults)) {
            const item = items.find((i: any) => i.id === id);
            console.log(`  [batch] ${r.status} | ${item?.description?.substring(0, 60) || id}`);
        }

        return NextResponse.json({
            results: batchResults,
            count: Object.keys(batchResults).length,
        });
    } catch (error: any) {
        console.error("Batch evaluation error:", error.message);
        return NextResponse.json({ error: error.message || "Batch evaluation failed" }, { status: 500 });
    }
}

/**
 * GET /api/comparison/generate-batch?projectId=...&vendorId=...&model=...
 * Returns the evaluation plan: vendors, items, batch config.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const projectId = url.searchParams.get("projectId");
        const vendorId = url.searchParams.get("vendorId");
        const model = url.searchParams.get("model") || "auto";

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        // Fetch URS items
        const ursItems = await prisma.ursItem.findMany({
            where: { projectId },
            orderBy: { slNo: "asc" },
            select: { id: true, description: true, specifications: true, remarks: true, section: true },
        });

        if (ursItems.length === 0) {
            return NextResponse.json({ error: "No URS items found." }, { status: 400 });
        }

        // Fetch vendors
        const vendorProfiles = await prisma.vendorProfile.findMany({
            where: { projectId, ...(vendorId ? { id: vendorId } : {}) },
            select: { id: true, vendorName: true, combinedText: true },
        });

        let vendorsToAnalyze = vendorProfiles.filter(v => v.combinedText && v.combinedText.length > 0);
        let skippedVendors: string[] = [];

        // In bulk mode, skip already-analyzed vendors
        if (!vendorId) {
            const existing = await prisma.comparisonResult.groupBy({
                by: ["vendorProfileId"],
                where: { projectId },
            });
            const analyzedIds = new Set(existing.map(r => r.vendorProfileId));
            skippedVendors = vendorsToAnalyze.filter(v => analyzedIds.has(v.id)).map(v => v.vendorName);
            vendorsToAnalyze = vendorsToAnalyze.filter(v => !analyzedIds.has(v.id));
        }

        // Build items list (URS + commercial)
        const allItems = [
            ...ursItems.map(i => ({
                id: i.id,
                description: i.description,
                specifications: i.specifications || "",
                remarks: i.remarks || undefined,
            })),
            {
                id: "PRICE_DATA",
                description: "Price Data",
                specifications: "Extract ONLY the overall pricing details: Total Price, currency, VAT/Tax, Duty, Freight Charge, and any specific cost breakdown. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation.",
            },
            {
                id: "WARRANTY",
                description: "Warranty",
                specifications: "Extract ONLY the warranty terms: Duration, conditions, and coverage. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation.",
            },
            {
                id: "COMMERCIAL_TERMS",
                description: "Commercial Terms",
                specifications: "Extract ONLY the commercial terms: Delivery Time, Payment Terms, and validity. DO NOT provide pricing, taxes, freight, or warranty. Format the output using line breaks (\\n) clearly.",
                remarks: "This is a commercial evaluation.",
            },
        ];

        const config = getBatchConfig(model !== "auto" ? model : undefined);
        const totalBatches = Math.ceil(allItems.length / config.batchSize);

        return NextResponse.json({
            vendors: vendorsToAnalyze.map(v => ({ id: v.id, name: v.vendorName })),
            skippedVendors,
            items: allItems,
            batchSize: config.batchSize,
            totalBatches,
            delayMs: config.delayMs,
            isGroq: config.isGroq,
            modelId: config.modelId,
        });
    } catch (error: any) {
        console.error("Generate plan error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

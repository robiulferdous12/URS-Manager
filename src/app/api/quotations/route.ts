import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("projectId");

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        const quotations = await prisma.quotation.findMany({
            where: { projectId },
            orderBy: { uploadedAt: "desc" },
            include: {
                items: true,
            },
        });
        return NextResponse.json(quotations);
    } catch (error) {
        console.error("Fetch quotations error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const projectId = formData.get("projectId") as string | null;
        const vendorName = formData.get("vendorName") as string | null;

        if (!file || !projectId || !vendorName) {
            return NextResponse.json(
                { error: "file, projectId, and vendorName are required" },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (rows.length === 0) {
            return NextResponse.json(
                { error: "Excel file is empty" },
                { status: 400 }
            );
        }

        // Get URS items for this project to attempt auto-matching
        const ursItems = await prisma.ursItem.findMany({
            where: { projectId },
            orderBy: { slNo: "asc" },
        });

        // Map rows to quotation items
        const items = rows.map((row, index) => {
            const description =
                row["Description"] || row["description"] || row["Item"] || row["item"] || row["DESCRIPTION"] || "";
            const unit =
                row["Unit"] || row["unit"] || row["UNIT"] || row["UOM"] || null;
            const quantity =
                parseFloat(row["Quantity"] || row["quantity"] || row["Qty"] || row["qty"] || row["QUANTITY"] || "0") || 0;
            const unitRate =
                parseFloat(row["Unit Rate"] || row["unit rate"] || row["Rate"] || row["rate"] || row["Unit Price"] || row["RATE"] || "0") || 0;
            const totalPrice =
                parseFloat(row["Total"] || row["total"] || row["Total Price"] || row["Amount"] || row["amount"] || row["TOTAL"] || "0") || (quantity * unitRate);
            const remarks =
                row["Remarks"] || row["remarks"] || row["REMARKS"] || row["Note"] || null;

            // Try to match with URS item by index (positional matching)
            const ursItemId = index < ursItems.length ? ursItems[index].id : null;

            return {
                description: String(description),
                unit: unit ? String(unit) : null,
                quantity,
                unitRate,
                totalPrice,
                remarks: remarks ? String(remarks) : null,
                ursItemId,
            };
        }).filter((item) => item.description.trim() !== "");

        if (items.length === 0) {
            return NextResponse.json(
                { error: "No valid items found in the Excel file." },
                { status: 400 }
            );
        }

        // Create quotation with items in a transaction
        const quotation = await prisma.quotation.create({
            data: {
                projectId,
                vendorName,
                items: {
                    create: items,
                },
            },
            include: {
                items: true,
            },
        });

        return NextResponse.json(quotation, { status: 201 });
    } catch (error) {
        console.error("Quotation upload error:", error);
        return NextResponse.json({ error: "Failed to parse quotation file" }, { status: 500 });
    }
}

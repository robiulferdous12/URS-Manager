import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// ──────────────────────────────────────────────
// Intelligent Column Mapping
// ──────────────────────────────────────────────

/**
 * Map of canonical field names to all possible column header variations.
 * Covers common naming conventions in engineering URS documents.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
    section: [
        "section", "category", "group", "module", "area", "system",
        "sub-system", "subsystem", "discipline", "department", "division",
        "heading", "type", "classification", "class", "part",
    ],
    description: [
        "description", "item", "requirement", "detail", "details",
        "item description", "requirement description", "scope", "feature",
        "component", "element", "parameter", "subject", "title", "name",
        "line item", "line_item", "lineitem", "work item", "deliverable",
    ],
    specifications: [
        "specification", "specifications", "spec", "specs", "required spec",
        "required specification", "technical specification", "technical spec",
        "standard", "criteria", "acceptance criteria", "value", "required value",
        "target", "expected", "expected value", "design criteria", "design spec",
        "performance", "performance criteria", "rating", "capacity",
    ],
    unit: [
        "unit", "uom", "unit of measure", "unit of measurement", "units",
        "measure", "measurement", "u/m",
    ],
    quantity: [
        "quantity", "qty", "qty.", "amount", "count", "no.", "nos", "number",
        "numbers", "pcs", "pieces", "sets", "lot", "ea", "each",
    ],
    remarks: [
        "remarks", "remark", "note", "notes", "comment", "comments",
        "observation", "observations", "additional info", "additional information",
        "reference", "ref", "status", "priority",
    ],
    slNo: [
        "sl no", "sl.no", "sl.no.", "sl no.", "s.no", "s.no.", "s no",
        "serial", "serial no", "serial no.", "sr.no", "sr no", "sr.no.",
        "no", "no.", "#", "sn", "index", "item no", "item no.", "item number",
        "line", "line no", "line no.",
    ],
};

/**
 * Intelligently maps actual Excel column headers to canonical field names.
 * Uses fuzzy matching with normalized comparisons.
 */
function mapColumns(actualHeaders: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    const normalizedHeaders = actualHeaders.map(h => h.toLowerCase().trim().replace(/[_\-\.]+/g, " ").replace(/\s+/g, " "));

    for (const [canonicalName, aliases] of Object.entries(COLUMN_ALIASES)) {
        for (const alias of aliases) {
            const normalizedAlias = alias.toLowerCase().trim();
            const matchIndex = normalizedHeaders.findIndex(h => h === normalizedAlias);
            if (matchIndex !== -1 && !Object.values(mapping).includes(actualHeaders[matchIndex])) {
                mapping[canonicalName] = actualHeaders[matchIndex];
                break;
            }
        }
        // If no exact match found, try partial/contains match
        if (!mapping[canonicalName]) {
            for (const alias of aliases) {
                const normalizedAlias = alias.toLowerCase().trim();
                const matchIndex = normalizedHeaders.findIndex(h =>
                    h.includes(normalizedAlias) || normalizedAlias.includes(h)
                );
                if (matchIndex !== -1 && !Object.values(mapping).includes(actualHeaders[matchIndex])) {
                    mapping[canonicalName] = actualHeaders[matchIndex];
                    break;
                }
            }
        }
    }

    return mapping;
}

/**
 * Safely extract a value from a row using the column mapping.
 */
function getField(row: any, mapping: Record<string, string>, field: string, fallback: string = ""): string {
    const colName = mapping[field];
    if (!colName) return fallback;
    const value = row[colName];
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
}

// ──────────────────────────────────────────────
// Data Validation & Cleaning
// ──────────────────────────────────────────────

/**
 * Validates and cleans a row of data, filtering out junk rows.
 */
function isValidRow(row: any, mapping: Record<string, string>): boolean {
    const description = getField(row, mapping, "description");
    if (!description) return false;

    // Filter out header-repeat rows (common in multi-page Excel exports)
    const lowerDesc = description.toLowerCase();
    const headerWords = ["description", "specification", "sl no", "serial", "item", "remarks", "section"];
    if (headerWords.includes(lowerDesc)) return false;

    // Filter out summary/total rows
    if (/^(total|sub-?total|grand total|sum|average|count)/i.test(description)) return false;

    // Filter out rows that are just numbers or very short non-descriptive text
    if (/^\d+\.?\d*$/.test(description)) return false;
    if (description.length < 3) return false;

    return true;
}

/**
 * Auto-detect section from description patterns when no section column exists.
 * Looks for heading-like rows: all caps, numbered headings, bold markers, etc.
 */
function detectSectionFromData(rows: any[], mapping: Record<string, string>): Map<number, string> {
    const sectionMap = new Map<number, string>();
    let currentSection = "General";

    // If we have a section column, don't auto-detect
    if (mapping["section"]) return sectionMap;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const desc = getField(row, mapping, "description");
        if (!desc) continue;

        // Detect section headers:
        // 1. ALL CAPS text with no specs (likely a section header)
        const specs = getField(row, mapping, "specifications");
        const isAllCaps = desc === desc.toUpperCase() && /[A-Z]{3,}/.test(desc) && !specs;

        // 2. Numbered heading pattern: "1.", "1.0", "A.", "I."
        const isNumberedHeading = /^(\d+\.|\d+\.\d+\s|[A-Z]\.\s|[IVX]+\.\s)/.test(desc) && !specs;

        // 3. Short text with no specs (likely a category name)
        const isShortHeading = desc.length < 40 && !specs && desc.split(" ").length <= 5;

        if (isAllCaps || (isNumberedHeading && isShortHeading)) {
            currentSection = desc.replace(/^\d+\.?\d*\s*/, "").replace(/^[A-Z]\.\s*/, "").trim() || desc;
            // Clean up: title case
            currentSection = currentSection.split(" ")
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");
        }

        sectionMap.set(i, currentSection);
    }

    return sectionMap;
}

// ──────────────────────────────────────────────
// Multi-Sheet Processing
// ──────────────────────────────────────────────

interface ParsedSheet {
    sheetName: string;
    headers: string[];
    mapping: Record<string, string>;
    rows: any[];
    hasDescription: boolean;
}

function parseAllSheets(workbook: XLSX.WorkBook): ParsedSheet[] {
    const sheets: ParsedSheet[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) continue;

        // Get actual column headers
        const headers = Object.keys(rows[0]);
        const mapping = mapColumns(headers);

        sheets.push({
            sheetName,
            headers,
            mapping,
            rows,
            hasDescription: !!mapping["description"],
        });
    }

    return sheets;
}

// ──────────────────────────────────────────────
// Main Upload Handler
// ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const projectId = formData.get("projectId") as string | null;

        if (!file || !projectId) {
            return NextResponse.json(
                { error: "File and projectId are required" },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: "buffer" });

        // Parse all sheets and find the best one
        const parsedSheets = parseAllSheets(workbook);

        if (parsedSheets.length === 0) {
            return NextResponse.json(
                { error: "Excel file contains no data" },
                { status: 400 }
            );
        }

        // Prefer sheets with a description column; fall back to first sheet
        const bestSheet = parsedSheets.find(s => s.hasDescription) || parsedSheets[0];

        if (!bestSheet.hasDescription) {
            // Try to use the first text-heavy column as description
            const firstTextCol = bestSheet.headers.find(h => {
                const values = bestSheet.rows.slice(0, 5).map(r => String(r[h] || ""));
                const avgLen = values.reduce((sum, v) => sum + v.length, 0) / values.length;
                return avgLen > 10; // Likely a description column
            });

            if (firstTextCol) {
                bestSheet.mapping["description"] = firstTextCol;
                bestSheet.hasDescription = true;
            }
        }

        if (!bestSheet.hasDescription) {
            return NextResponse.json(
                {
                    error: "Could not find a description column. Expected columns like: Description, Item, Requirement, Component, Parameter, Feature, or similar.",
                    detectedColumns: bestSheet.headers,
                },
                { status: 400 }
            );
        }

        const { rows, mapping } = bestSheet;

        // Auto-detect sections if no section column
        const autoSections = detectSectionFromData(rows, mapping);

        // Get existing max slNo for this project
        const lastItem = await prisma.ursItem.findFirst({
            where: { projectId },
            orderBy: { slNo: "desc" },
            select: { slNo: true },
        });
        let nextSlNo = (lastItem?.slNo ?? 0) + 1;

        // Extract all valid items with section tracking
        const sectionOrder: string[] = [];
        const rawItems = rows.map((row, index) => {
            const description = getField(row, mapping, "description");
            if (!description) return null;

            // Determine section
            let section = getField(row, mapping, "section") || autoSections.get(index) || "General";

            // Skip rows that are actually section headers (detected above)
            if (autoSections.size > 0 && !mapping["section"]) {
                const desc = description;
                const specs = getField(row, mapping, "specifications");
                const isHeader = (desc === desc.toUpperCase() && /[A-Z]{3,}/.test(desc) && !specs);
                if (isHeader) return null;
            }

            if (!sectionOrder.includes(section)) {
                sectionOrder.push(section);
            }

            return {
                row,
                index,
                description,
                section,
            };
        }).filter(Boolean) as { row: any; index: number; description: string; section: string }[];

        // Sort by section order, then by original row order
        const items = rawItems
            .filter(item => isValidRow(item.row, mapping))
            .sort((a, b) => {
                const sA = sectionOrder.indexOf(a.section);
                const sB = sectionOrder.indexOf(b.section);
                if (sA !== sB) return sA - sB;
                return a.index - b.index;
            })
            .map(item => {
                const unit = getField(item.row, mapping, "unit") || null;
                const qtyStr = getField(item.row, mapping, "quantity", "0");
                const quantity = parseFloat(qtyStr) || 0;
                const remarks = getField(item.row, mapping, "remarks") || null;
                const specifications = getField(item.row, mapping, "specifications") || null;

                const slNo = nextSlNo++;

                return {
                    projectId,
                    slNo,
                    section: item.section,
                    description: item.description,
                    specifications,
                    unit,
                    quantity,
                    remarks,
                };
            });

        if (items.length === 0) {
            return NextResponse.json(
                {
                    error: "No valid URS items found. The file may contain only headers or summary rows.",
                    detectedColumns: bestSheet.headers,
                    columnMapping: mapping,
                },
                { status: 400 }
            );
        }

        // Build upload summary with detected mappings
        const summary = {
            sheet: bestSheet.sheetName,
            totalRows: rows.length,
            validItems: items.length,
            skippedRows: rows.length - items.length,
            columnMapping: mapping,
            detectedColumns: bestSheet.headers,
            sections: [...new Set(items.map(i => i.section))],
            sheetsScanned: parsedSheets.length,
        };

        return NextResponse.json(
            { count: items.length, items, summary },
            { status: 200 }
        );
    } catch (error: any) {
        console.error("URS upload error:", error);
        return NextResponse.json(
            { error: `Failed to parse file: ${error.message}` },
            { status: 500 }
        );
    }
}

/**
 * fileParser.ts — Unified file-to-text extraction
 * Supports: Excel (.xlsx/.xls/.csv), PDF, Word (.docx), Images (.jpg/.png/.webp)
 */

import * as XLSX from "xlsx";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ParseResult {
    text: string;
    fileType: "excel" | "pdf" | "word" | "image";
    pageCount?: number;
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

export async function extractTextFromFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string
): Promise<ParseResult> {
    const ext = fileName.toLowerCase().split(".").pop() || "";

    // Excel
    if (["xlsx", "xls", "csv"].includes(ext) || mimeType.includes("spreadsheet") || mimeType.includes("csv")) {
        return extractFromExcel(buffer);
    }

    // PDF
    if (ext === "pdf" || mimeType === "application/pdf") {
        return extractFromPDF(buffer);
    }

    // Word
    if (ext === "docx" || mimeType.includes("wordprocessingml")) {
        return extractFromWord(buffer);
    }

    // Images
    if (["jpg", "jpeg", "png", "webp", "bmp", "tiff"].includes(ext) || mimeType.startsWith("image/")) {
        return extractFromImage(buffer, mimeType);
    }

    throw new Error(`Unsupported file type: ${ext} (${mimeType})`);
}

// ──────────────────────────────────────────────
// Excel Extraction
// ──────────────────────────────────────────────

function extractFromExcel(buffer: Buffer): ParseResult {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        textParts.push(`--- Sheet: ${sheetName} ---`);

        // Convert to array of arrays for full text extraction
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        for (const row of rows) {
            const rowText = row
                .map((cell: any) => (cell !== null && cell !== undefined ? String(cell).trim() : ""))
                .filter((c: string) => c.length > 0)
                .join(" | ");
            if (rowText.length > 0) {
                textParts.push(rowText);
            }
        }
    }

    return {
        text: textParts.join("\n"),
        fileType: "excel",
    };
}

// ──────────────────────────────────────────────
// PDF Extraction
// ──────────────────────────────────────────────

async function extractFromPDF(buffer: Buffer): Promise<ParseResult> {
    try {
        // Dynamic import handles CommonJS interop gracefully in Next.js
        // Import lib/pdf-parse.js directly to bypass the isDebugMode bug in index.js
        // @ts-ignore
        const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
        const pdfParse = pdfParseModule.default || pdfParseModule;
        
        const data = await (pdfParse as any)(buffer);
        const text = data.text?.trim() || "";

        // If very little text extracted, it's likely a scanned PDF
        if (text.length < 50) {
            // Fall back to Vision LLM
            const visionResult = await extractFromImage(buffer, "application/pdf");
            return { ...visionResult, fileType: "pdf" };
        }

        return {
            text,
            fileType: "pdf",
            pageCount: data.numpages,
        };
    } catch (error: any) {
        // If pdf-parse fails, log it and try Vision LLM
        console.error("pdf-parse failed:", error);
        const visionResult = await extractFromImage(buffer, "application/pdf");
        return { ...visionResult, fileType: "pdf" };
    }
}

// ──────────────────────────────────────────────
// Word Extraction
// ──────────────────────────────────────────────

async function extractFromWord(buffer: Buffer): Promise<ParseResult> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });

    return {
        text: result.value?.trim() || "",
        fileType: "word",
    };
}

// ──────────────────────────────────────────────
// Image / Vision LLM Extraction
// ──────────────────────────────────────────────

async function extractFromImage(buffer: Buffer, mimeType: string): Promise<ParseResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured. Cannot process images or scanned documents.");
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const base64Data = buffer.toString("base64");

    // Map common mime types
    let inlineMime = mimeType;
    if (mimeType === "application/pdf") {
        inlineMime = "application/pdf";
    } else if (!mimeType.startsWith("image/")) {
        inlineMime = "image/png";
    }

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: inlineMime,
                data: base64Data,
            },
        },
        {
            text: `Extract ALL text, data, specifications, measurements, and technical information from this document or image. 
Include:
- All tables and their data (preserve row/column structure as text)
- All technical specifications, part numbers, model numbers
- All measurements, dimensions, capacities, ratings
- All labels, headings, descriptions
- Any drawing annotations or notes

Format the output as clean, readable text. Preserve the logical structure of the information.
If this is an engineering drawing, describe all visible specifications and annotations.`,
        },
    ]);

    const response = result.response;
    const text = response.text()?.trim() || "";

    return {
        text,
        fileType: "image",
    };
}

// ──────────────────────────────────────────────
// Helper: Detect file type from extension
// ──────────────────────────────────────────────

export function detectFileType(fileName: string): "excel" | "pdf" | "word" | "image" | "unknown" {
    const ext = fileName.toLowerCase().split(".").pop() || "";

    if (["xlsx", "xls", "csv"].includes(ext)) return "excel";
    if (ext === "pdf") return "pdf";
    if (ext === "docx" || ext === "doc") return "word";
    if (["jpg", "jpeg", "png", "webp", "bmp", "tiff"].includes(ext)) return "image";

    return "unknown";
}

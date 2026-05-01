/**
 * gemini.ts — AI evaluation engine for URS specification comparison
 * Uses Google Gemini 2.0 Flash (stable). 1,500 RPD free tier.
 */

// ── Types ──

export interface EvaluationInput {
    ursDescription: string;
    ursSpecification: string;
    ursRemarks?: string;
    vendorName: string;
    vendorText: string;
}

export interface EvaluationResult {
    vendor_proposed_spec: string;
    status: "Meets" | "Does Not Meet" | "Not Mentioned" | "Partial";
    remarks: string;
}

export interface BulkEvaluationResult {
    [ursItemId: string]: EvaluationResult;
}

// ── Config ──

const MODEL_GEMINI_31_FLASH = "gemini-3-flash-preview";
const MODEL_GEMINI_31_FLASH_LITE = "gemini-3.1-flash-lite-preview";
const MODEL_LLAMA_3_3 = "llama-3.3-70b-versatile"; // 128k context logic
const MODEL_LLAMA_SCOUT = "meta-llama/llama-4-scout-17b-16e-instruct";       // 10M context massive extraction

// Priority Chain: Gemini 3.1 Flash -> Gemini 3.1 Flash Lite -> Llama 3.3 70B -> Llama 4 Scout
const MODELS_CHAIN = [MODEL_GEMINI_31_FLASH, MODEL_GEMINI_31_FLASH_LITE, MODEL_LLAMA_3_3, MODEL_LLAMA_SCOUT];
let activeModelIndex = 0;

const MAX_CONTEXT_CHARS = 16_000;
const GROQ_CONTEXT_CHARS = 30_000; // ~7.5k tokens, fits within Groq's 12k TPM free tier
const ITEMS_PER_BATCH = 4;
const INTER_REQUEST_DELAY_MS = 15_000; // 15s delay for Gemini
const GROQ_INTER_REQUEST_DELAY_MS = 65_000; // 65s delay for Groq to fully reset TPM window
const RETRY_BACKOFF_BASE_MS = 15_000;

function getApiKey(type: "GEMINI" | "GROQ" | "DEEPSEEK"): string | null {
    if (type === "GEMINI") return process.env.GEMINI_API_KEY || null;
    if (type === "GROQ") return process.env.GROQ_API_KEY || null;
    if (type === "DEEPSEEK") return process.env.DEEPSEEK_API_KEY || null;
    return null;
}

// ── Multi-Model Chat (Free Tier Fallback Chain) ──

async function geminiChat(system: string, user: string, temp = 0.05, explicitModelId?: string): Promise<string> {
    const tryModel = async (modelId: string): Promise<string> => {
        // --- Groq Path ---
        if ([MODEL_LLAMA_3_3, MODEL_LLAMA_SCOUT].includes(modelId)) {
            const key = getApiKey("GROQ");
            if (!key) throw new Error("SKIP: GROQ_API_KEY not configured");

            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: "system", content: system },
                        { role: "user", content: user },
                    ],
                    temperature: temp,
                    response_format: { type: "json_object" },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`Groq Error: ${data.error?.message || res.statusText}`);
            return data.choices[0]?.message?.content || "";
        }

        // --- Gemini Path ---
        const key = getApiKey("GEMINI");
        if (!key) throw new Error("SKIP: GEMINI_API_KEY not configured");

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: {
                temperature: temp,
                responseMimeType: "application/json",
            } as any,
            systemInstruction: system,
        });
        const result = await model.generateContent(user);
        const text = result.response.text();
        if (!text) throw new Error("Empty response from Gemini");
        return text;
    };

    // If an explicit model is provided, use only that model (no fallback)
    if (explicitModelId && explicitModelId !== "auto") {
        return await tryModel(explicitModelId);
    }

    // Try current model and fallback if needed
    for (let i = activeModelIndex; i < MODELS_CHAIN.length; i++) {
        const modelId = MODELS_CHAIN[i];
        try {
            const result = await tryModel(modelId);
            activeModelIndex = i;
            return result;
        } catch (error: any) {
            const msg = error.message || "";

            // Fallback on ANY error (rate limit, quota, server error, parsing error, etc.)
            if (i < MODELS_CHAIN.length - 1) {
                console.warn(`  ⚡ ${modelId} failed (${msg}) — falling back to ${MODELS_CHAIN[i + 1]}`);
                continue;
            }
            throw error;
        }
    }
    throw new Error("All models in the fallback chain failed.");
}

// ── Engineering Domain Synonyms ──

const DOMAIN_SYNONYMS: Record<string, string[]> = {
    motor: ["motor", "drive", "vfd", "variable frequency", "electric machine", "actuator", "servo"],
    pump: ["pump", "impeller", "centrifugal", "submersible", "booster", "dosing"],
    valve: ["valve", "gate valve", "butterfly", "check valve", "ball valve", "solenoid", "actuated"],
    tank: ["tank", "vessel", "reservoir", "storage", "silo", "hopper", "container"],
    pipe: ["pipe", "piping", "tubing", "conduit", "duct", "manifold", "header"],
    panel: ["panel", "switchboard", "mcc", "pcc", "control panel", "distribution board", "db"],
    cable: ["cable", "wire", "conductor", "wiring", "harness"],
    sensor: ["sensor", "transmitter", "transducer", "probe", "detector", "gauge", "meter"],
    plc: ["plc", "programmable logic", "controller", "scada", "hmi", "dcs", "automation"],
    transformer: ["transformer", "xfmr", "step-up", "step-down", "power supply"],
    compressor: ["compressor", "blower", "fan", "air handling", "ahu"],
    filter: ["filter", "strainer", "screen", "separator", "filtration"],
    bearing: ["bearing", "bushing", "sleeve", "roller", "ball bearing"],
    seal: ["seal", "gasket", "o-ring", "gland", "packing", "mechanical seal"],
    coating: ["coating", "paint", "finish", "galvanized", "epoxy", "powder coat", "anodized"],
    material: ["material", "stainless steel", "ss304", "ss316", "carbon steel", "ms", "cs", "alloy", "duplex", "cast iron", "ci", "hdpe", "pvc", "frp", "grp"],
    protection: ["protection", "ip65", "ip66", "ip67", "ip55", "ip54", "nema", "weatherproof", "dustproof", "waterproof", "explosion proof", "flameproof", "atex"],
    insulation: ["insulation", "class f", "class h", "class b", "thermal", "lagging"],
    certification: ["certification", "certified", "iso", "ce", "ul", "iec", "astm", "bureau veritas", "tuv", "approved", "compliant"],
    warranty: ["warranty", "guarantee", "defect liability", "dlp"],
    capacity: ["capacity", "rating", "output", "throughput", "flow rate", "duty"],
    efficiency: ["efficiency", "cop", "eta", "performance", "power factor", "pf"],
    voltage: ["voltage", "volt", "kv", "mv", "lv", "hv", "supply voltage", "rated voltage"],
    power: ["power", "kw", "hp", "watt", "mw", "kva", "kvar"],
    pressure: ["pressure", "bar", "psi", "mpa", "kpa", "pascal", "head"],
    temperature: ["temperature", "deg c", "°c", "°f", "celsius", "fahrenheit", "thermal"],
    speed: ["speed", "rpm", "rev/min", "velocity", "flow velocity"],
    noise: ["noise", "db", "dba", "decibel", "sound", "acoustic", "silencer"],
    dimension: ["dimension", "size", "length", "width", "height", "diameter", "mm", "cm", "meter", "inch"],
    weight: ["weight", "mass", "kg", "ton", "tonne", "lb"],
    flow: ["flow", "lpm", "gpm", "m3/h", "cfm", "lps", "m³/hr"],
    commercial: ["price", "cost", "total", "amount", "usd", "eur", "gbp", "bdt", "inr", "$", "€", "£", "tax", "vat", "gst", "delivery", "lead time", "warranty", "guarantee", "payment", "commercial", "quote", "quotation", "validity"],
};

// ── Context Extraction ──

function buildSearchTerms(desc: string, spec: string) {
    const combined = `${desc} ${spec}`.toLowerCase();
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "shall", "may", "might", "can",
        "must", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
        "during", "before", "after", "above", "below", "and", "but", "or", "not", "no", "nor", "so",
        "yet", "both", "each", "all", "any", "few", "more", "most", "other", "some", "such", "than",
        "too", "very", "just", "also", "that", "this", "these", "those", "which", "what", "who",
        "per", "its", "our", "their", "your", "his", "her", "type", "etc", "min", "max", "approx",
    ]);

    const words = combined.split(/[\s,;:()\[\]{}/\\]+/).filter(w => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w));
    const primary = [...new Set(words)];

    // Expand with domain synonyms
    const expanded = new Set<string>();
    for (const word of primary) {
        for (const [, synonyms] of Object.entries(DOMAIN_SYNONYMS)) {
            if (synonyms.some(s => s.includes(word) || word.includes(s))) {
                synonyms.forEach(s => expanded.add(s));
            }
        }
    }

    // Extract numbers and units
    const numbers = (combined.match(/\d+\.?\d*/g) || []).map(Number).filter(n => !isNaN(n));
    const units = [...new Set((combined.match(/\b(kw|mw|hp|kva|kvar|mv|kv|volt|amp|ma|hz|rpm|mm|cm|meter|metre|inch|ft|kg|ton|tonne|lb|bar|psi|mpa|pa|°c|°f|liter|litre|gallon|cfm|lpm|gpm|db|dba|lux|ip\d{2}|iec|iso|astm|ul|nfpa|din|ieee|atex|nema)\b/gi) || []).map(u => u.toLowerCase()))];

    return { primary, expanded: [...expanded], numbers, units };
}

function extractSmartContext(fullText: string, desc: string, spec: string, maxLen = MAX_CONTEXT_CHARS): string {
    const rawSections = fullText.split(/\n{2,}|\r\n{2,}/).map(s => s.trim()).filter(s => s.length > 5);

    const sections: { section: string; index: number; docName: string }[] = [];
    let currentDoc = "Unknown Document";

    for (let i = 0; i < rawSections.length; i++) {
        let text = rawSections[i];

        const docMatch = text.match(/=== Document: (.*?) ===/);
        if (docMatch) {
            currentDoc = docMatch[1].trim();
            text = text.replace(/=== Document: .*? ===\n?/, "").trim();
        }

        if (text.length > 10) {
            sections.push({ section: `[Source: ${currentDoc}]\n${text}`, index: sections.length, docName: currentDoc });
        }
    }

    if (sections.length === 0) return fullText.substring(0, maxLen);

    const terms = buildSearchTerms(desc, spec);

    const scored = sections.map((item, index) => {
        const lower = item.section.toLowerCase();
        let score = 0;

        for (const t of terms.primary) { if (lower.includes(t)) score += 10; }
        for (const t of terms.expanded) { if (lower.includes(t)) score += 4; }
        for (const n of terms.numbers) { if (lower.includes(String(n))) score += 5; }
        for (const u of terms.units) { if (lower.includes(u)) score += 3; }

        if (/^#{1,4}\s|^\[Source:.*?\]\n[A-Z][A-Z\s]{3,}$|^\d+\.\d*\s/.test(item.section) && score > 0) score += 8;
        if ((/\|.*\|/.test(item.section) || /\t.*\t/.test(item.section)) && score > 0) score += 5;

        const isCommercialSearch = /price|commercial|total|vat|duty|breakdown/i.test(desc + " " + spec);
        if (isCommercialSearch) {
            const isNearEnd = index >= sections.length - 3 ||
                (index < sections.length - 3 && sections[index + 3].docName !== item.docName);
            if (isNearEnd) score += 50;
            if (/total|amount|grand|sum|net|gross|tax|vat|freight/i.test(lower)) score += 20;
        }

        return { section: item.section, score, index: item.index };
    });

    scored.sort((a, b) => b.score - a.score);

    const selected = new Set<number>();
    let chars = 0;
    // Pass 1: Add all scored sections with their neighbors
    for (const item of scored) {
        if (item.score === 0 || chars >= maxLen) break;
        if (!selected.has(item.index)) { selected.add(item.index); chars += item.section.length; }
        // Wider neighbor window: ±2 sections for better context continuity
        for (const off of [-2, -1, 1, 2]) {
            const ni = item.index + off;
            if (ni >= 0 && ni < sections.length && !selected.has(ni) && chars + sections[ni].section.length <= maxLen * 1.3) {
                selected.add(ni); chars += sections[ni].section.length;
            }
        }
    }

    // Pass 2: Fill remaining space with unselected sections (round-robin from start)
    if (chars < maxLen * 0.8) {
        for (const item of scored) {
            if (chars >= maxLen) break;
            if (!selected.has(item.index) && chars + sections[item.index].section.length <= maxLen) {
                selected.add(item.index); chars += sections[item.index].section.length;
            }
        }
    }

    if (selected.size === 0) {
        return fullText.substring(0, maxLen);
    }

    return Array.from(selected).sort((a, b) => a - b).map(i => sections[i].section).join("\n\n").substring(0, maxLen);
}

function extractBatchContext(fullText: string, items: { description: string; specifications: string }[], maxLen = GROQ_CONTEXT_CHARS): string {
    return extractSmartContext(fullText, items.map(i => i.description).join(" "), items.map(i => i.specifications).join(" "), maxLen);
}

// ── Per-item deep context (for second pass) ──

function extractDeepContext(fullText: string, desc: string, spec: string): string {
    // Slightly more context for individual re-evaluation
    return extractSmartContext(fullText, desc, spec, MAX_CONTEXT_CHARS * 1.5);
}

// ── Prompt ──

const SYSTEM_PROMPT = `You are a world-class senior procurement engineer with 25+ years of industrial experience performing an exhaustive compliance audit of vendor proposals against User Requirement Specifications (URS). Your analysis must demonstrate deep engineering knowledge, aggressive document mining, and rigorous logical reasoning.

## EVALUATION METHODOLOGY

### Step 1: UNDERSTAND the URS Requirement (Think Like an Engineer)
- Identify the EXACT requirement: product, feature, parameter, standard, certification.
- Note ALL quantitative thresholds, ranges, tolerances, or specific values.
- Understand the INTENT behind the requirement — what engineering problem does it solve?
- Consider the OPERATING CONTEXT: What system is this part of? What failure mode does this requirement prevent?
- Decompose compound requirements: "SS316 wetted parts with IP65 enclosure" = TWO separate checks.

### Step 2: AGGRESSIVE DEEP SEARCH of Vendor Documentation
- Read the vendor text methodically — do NOT skim. Read EVERY line.
- Search for: exact terms, synonyms, abbreviations, trade names, model numbers, part numbers.
- Apply engineering equivalences aggressively:
  * Materials: "SS316" = "stainless steel 316" = "1.4401" = "A4 grade" = "marine grade stainless"
  * Protection: "IP65" = "weatherproof" = "dust-tight, water-jet proof"; "IP66" > "IP65" (EXCEEDS)
  * Power: "VFD" = "variable frequency drive" = "AC drive" = "inverter" = "frequency converter"
  * Insulation: "Class F" = "155°C" = "Class 155"; "Class H" > "Class F" (EXCEEDS)
  * Standards: "IEC 60034" covers rotating machines; "IEC 61439" covers switchgear assemblies
  * Flow: "m³/h" ↔ "LPM" ↔ "GPM" — convert and compare numerically
  * Pressure: "bar" ↔ "PSI" ↔ "MPa" — convert and compare numerically
- Check tables, spec sheets, feature lists, data sections, footnotes, headers, footers.
- If a model number is mentioned (e.g. "ABB ACS580", "Grundfos CR"), USE YOUR KNOWLEDGE of that product line to infer capabilities.
- Search for RELATED terms: if looking for "motor power", also check "drive rating", "kW", "HP", "output", "shaft power", "rated power".
- Search for IMPLICIT information: a "316SS pump" inherently has "316SS impeller" unless stated otherwise.
- Look for information in UNEXPECTED places: pricing tables may mention specs, delivery schedules may mention testing, scope sections may list features.

### Step 3: INTELLIGENT LOGICAL COMPARISON (Engineering Reasoning, NOT Keyword Matching)
- QUANTITATIVE comparison with unit conversion: 45kW offered vs 50kW required = "Does Not Meet". 55kW offered vs 50kW required = "Meets" (exceeds by 10%).
- If vendor EXCEEDS or provides a BETTER specification (higher capacity, better material, newer standard, tighter tolerance, higher IP rating), status MUST be "Meets" — note the improvement.
- If vendor offers a RANGE that covers the requirement, status = "Meets".
- INFER from product category: A centrifugal pump vendor offering "Grundfos CR series" inherently provides stainless steel impeller, mechanical seal, and standard motor mounting — even if not explicitly stated.
- INFER from industry standards: If vendor claims "IEC 60034 compliant motor", that inherently covers insulation class, efficiency class, and terminal box requirements per that standard.
- CROSS-REFERENCE within the document: If Section A says "all wetted parts are SS316" and Section B describes the pump — the pump's wetted parts ARE SS316.
- Consider COMMERCIAL implications: If vendor quotes a premium product line, infer premium features unless explicitly downgraded.
- If data is ambiguous or implied but not explicitly confirmed with specific values, status = "Partial" with detailed reasoning about what IS and ISN'T confirmed.

### Step 4: STATUS DETERMINATION (Be Aggressive, Minimize "Not Mentioned")
- **Meets**: Vendor EXPLICITLY or IMPLICITLY provides what is required. Numbers match/exceed. Features confirmed directly or through engineering inference.
- **Does Not Meet**: Vendor addresses this topic but FAILS (lower spec, wrong type, missing feature, incompatible standard).
- **Partial**: Vendor partially addresses it — some aspects met, others missing/unclear. Use this for implied but unconfirmed capabilities.
- **Not Mentioned**: After EXHAUSTIVE search using all techniques above, ABSOLUTELY NOTHING relates to this requirement. This is a LAST RESORT — you must justify why no inference is possible.

## CRITICAL RULES
1. NEVER mark "Not Mentioned" if ANY related information exists anywhere in the document — use "Partial" instead and explain what's missing.
2. Use engineering reasoning and product knowledge — don't just match keywords. Think about what the vendor's product INHERENTLY provides.
3. Do NOT confuse similar specs (input vs output, nominal vs max, design vs operating, gross vs net).
4. CROSS-REFERENCE across different sections of the document. Information about one requirement may appear in a section about another.
5. CONVERT UNITS before comparing. Never mark "Does Not Meet" due to different unit systems without converting first.
6. Remarks MUST be highly detailed, analytical, and intelligent. Do not be brief. Explain your engineering reasoning thoroughly — follow the structured format below.

## RESPONSE FORMAT
JSON object keyed by item ID:
{"<id>": {
  "vendor_proposed_spec": "<very brief, punchy summary of the exact spec offered (e.g. '45kW', 'IP65', 'SS316', 'Not mentioned'). Do NOT put long quotes here.>",
  "status": "<Meets | Does Not Meet | Not Mentioned | Partial>",
  "remarks": "FOUND: <Detailed description of what the vendor documentation states about this requirement, including specific values, constraints, and model numbers. MUST explicitly cite the [Source: filename] and page/section number if visible>. COMPARISON: <Deep, multi-sentence engineering analysis logically comparing the URS requirement vs the vendor's offering. Explain the exact gaps, equivalencies, or improvements. Detail WHY the specific status was determined. Include unit conversions, standard cross-references, and product knowledge inference where applicable>. VERDICT: <1-sentence conclusion>."
}}`;

// ── Single-Item Evaluation ──

export async function evaluateSpecification(
    input: EvaluationInput,
    model?: string
): Promise<EvaluationResult> {
    const ctx = extractSmartContext(input.vendorText, input.ursDescription, input.ursSpecification);

    const userPrompt = `## URS REQUIREMENT
**Item ID**: single_item
**Description**: ${input.ursDescription}
**Required Specification**: ${input.ursSpecification || "Evaluate based on description"}
${input.ursRemarks ? `**Context**: ${input.ursRemarks}` : ""}

## VENDOR DOCUMENTATION (${input.vendorName})
${ctx}

Evaluate and respond with JSON.`;

    return await callWithRetry(async () => {
        const text = await geminiChat(SYSTEM_PROMPT, userPrompt, 0.05, model);
        const parsed = parseJsonResponse(text);
        const result = parsed["single_item"] || Object.values(parsed)[0];
        if (!result) throw new Error("No result in AI response");
        return {
            vendor_proposed_spec: result.vendor_proposed_spec || "Not found in documentation",
            status: normalizeStatus(result.status),
            remarks: result.remarks || "",
        };
    }, `"${input.ursDescription}"`);
}

// ── Bulk Evaluation (One-Pass) ──

export async function evaluateVendorAgainstURS(
    vendorName: string,
    vendorText: string,
    ursItems: { id: string; description: string; specifications: string; remarks?: string }[],
    model?: string
): Promise<BulkEvaluationResult> {
    const allResults: BulkEvaluationResult = {};
    const totalItems = ursItems.length;
    const activeModelId = model || MODELS_CHAIN[activeModelIndex];
    const isGroq = [MODEL_LLAMA_3_3, MODEL_LLAMA_SCOUT].includes(activeModelId);
    const batchSize = isGroq ? 3 : totalItems;
    const totalBatches = Math.ceil(totalItems / batchSize);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`🧠 ${isGroq ? "BATCHED" : "ONE-PASS"} EVALUATION: ${totalItems} URS items vs ${vendorName}`);
    console.log(`   Model: ${activeModelId} | Doc: ${vendorText.length} chars | Batches: ${totalBatches}`);
    console.log(`${"═".repeat(60)}\n`);

    let globalSuccess = true;

    for (let batchStart = 0; batchStart < totalItems; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalItems);
        const batch = ursItems.slice(batchStart, batchEnd);
        const batchNum = Math.floor(batchStart / batchSize) + 1;

        if (totalBatches > 1) {
            console.log(`\n── Batch ${batchNum}/${totalBatches} (items ${batchStart + 1}-${batchEnd}) ──`);
        }

        const itemsList = batch.map((item, idx) =>
            `### Item ${idx + 1} (ID: ${item.id})\n**Description**: ${item.description}\n**Required Specification**: ${item.specifications || "Evaluate based on description"}${item.remarks ? `\n**Context**: ${item.remarks}` : ""}`
        ).join("\n\n");

        const ctx = isGroq ? extractBatchContext(vendorText, batch.map(i => ({ description: i.description, specifications: i.specifications }))) : vendorText;

        const userPrompt = `## VENDOR DOCUMENTATION (${vendorName})\n${ctx}\n\n## URS REQUIREMENTS (${batch.length} items)\n\n${itemsList}\n\nEvaluate ALL ${batch.length} items based on the vendor documentation provided above. Respond with JSON using the item IDs as keys.`;

        let batchSuccess = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const text = await geminiChat(SYSTEM_PROMPT, userPrompt, 0.05, model);
                const parsed = parseJsonResponse(text);

                for (const item of batch) {
                    const r = parsed[item.id];
                    if (r) {
                        allResults[item.id] = {
                            vendor_proposed_spec: r.vendor_proposed_spec || "Not found in documentation",
                            status: normalizeStatus(r.status),
                            remarks: r.remarks || "",
                        };
                        console.log(`  [${ursItems.indexOf(item) + 1}/${totalItems}] ${r.status} | ${item.description.substring(0, 60)}`);
                    } else {
                        allResults[item.id] = { vendor_proposed_spec: "Not found in documentation", status: "Not Mentioned", remarks: "Missed in evaluation — queued for re-evaluation." };
                        console.warn(`  [${ursItems.indexOf(item) + 1}/${totalItems}] ⚠ Missing from response`);
                    }
                }
                batchSuccess = true;
                break;
            } catch (error: any) {
                if (await handleRetryError(error, attempt, 5)) continue;
                console.error(`  ✗ Batch ${batchNum} failed:`, error.message);
                break;
            }
        }

        if (!batchSuccess) {
            globalSuccess = false;
            for (const item of batch) {
                if (!allResults[item.id]) {
                    allResults[item.id] = { vendor_proposed_spec: "Evaluation failed", status: "Not Mentioned", remarks: "Evaluation failed. Please retry." };
                }
            }
        }

        if (totalBatches > 1 && batchEnd < totalItems) {
            const delay = isGroq ? GROQ_INTER_REQUEST_DELAY_MS : INTER_REQUEST_DELAY_MS;
            console.log(`  ⏳ Waiting ${delay / 1000}s before next batch...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    // ── PASS 2: Re-evaluate "Not Mentioned" and "Partial" items with deeper context ──
    const reEvalItems = ursItems.filter(item => {
        const status = allResults[item.id]?.status;
        const isMissed = allResults[item.id]?.remarks.includes("Missed in evaluation");
        return status === "Not Mentioned" || status === "Partial" || isMissed;
    });

    if (reEvalItems.length > 0 && reEvalItems.length <= 15) {
        console.log(`\n${"═".repeat(60)}`);
        console.log(`🔍 PASS 2: Re-evaluating ${reEvalItems.length} items (Not Mentioned / Partial)`);
        console.log(`${"═".repeat(60)}\n`);

        for (const item of reEvalItems) {
            const delay = isGroq ? GROQ_INTER_REQUEST_DELAY_MS : INTER_REQUEST_DELAY_MS;
            await new Promise(r => setTimeout(r, delay));

            const deepCtx = extractDeepContext(vendorText, item.description, item.specifications);
            const prevStatus = allResults[item.id]?.status || "Unknown";
            const prevRemarks = allResults[item.id]?.remarks || "";

            const reEvalPrompt = `## SECOND-PASS DEEP EVALUATION
This item was initially evaluated as "${prevStatus}" in a batch evaluation.
Previous remarks: ${prevRemarks}

You are now given EXPANDED vendor context. Search AGGRESSIVELY for ANY related information.
Even indirect references, implied capabilities, related product features, or engineering equivalences count.

**Item ID**: ${item.id}
**Description**: ${item.description}
**Required Specification**: ${item.specifications || "Evaluate based on description"}
${item.remarks ? `**Context**: ${item.remarks}` : ""}

## EXPANDED VENDOR DOCUMENTATION (${vendorName})
${deepCtx}

IMPORTANT: Only confirm "Not Mentioned" if you are ABSOLUTELY CERTAIN nothing in the text relates to this requirement.
If ANY related information exists, use "Partial" or "Meets" as appropriate.

Respond with JSON using the item ID as key.`;

            try {
                const text = await geminiChat(SYSTEM_PROMPT, reEvalPrompt, 0.05, model);
                const parsed = parseJsonResponse(text);
                const r = parsed[item.id] || Object.values(parsed)[0];

                if (r) {
                    const newStatus = normalizeStatus(r.status);
                    const statusRank: Record<string, number> = { "Meets": 3, "Partial": 2, "Does Not Meet": 1, "Not Mentioned": 0 };
                    const improved = statusRank[newStatus] > statusRank[prevStatus] || prevStatus === "Not Mentioned";

                    if (improved || newStatus !== prevStatus) {
                        allResults[item.id] = {
                            vendor_proposed_spec: r.vendor_proposed_spec || allResults[item.id]?.vendor_proposed_spec || "Not found in documentation",
                            status: newStatus,
                            remarks: `[Pass 2] ${r.remarks || ""}`,
                        };
                        console.log(`  🔍 ${prevStatus} → ${newStatus}: ${item.description.substring(0, 50)}`);
                    } else {
                        allResults[item.id].remarks = `[Confirmed] ${r.remarks || allResults[item.id].remarks}`;
                        console.log(`  ✓ Confirmed ${prevStatus}: ${item.description.substring(0, 50)}`);
                    }
                }
            } catch (error: any) {
                console.warn(`  ⚠ Pass 2 failed for "${item.description.substring(0, 40)}": ${error.message}`);
            }
        }
    }

    // ── Summary ──
    const stats = {
        meets: Object.values(allResults).filter(r => r.status === "Meets").length,
        doesNotMeet: Object.values(allResults).filter(r => r.status === "Does Not Meet").length,
        partial: Object.values(allResults).filter(r => r.status === "Partial").length,
        notMentioned: Object.values(allResults).filter(r => r.status === "Not Mentioned").length,
    };

    console.log(`\n${"─".repeat(60)}`);
    console.log(`🧠 Final: ✓${stats.meets} ✗${stats.doesNotMeet} ◐${stats.partial} ?${stats.notMentioned}`);
    console.log(`${"─".repeat(60)}\n`);

    if (Object.keys(allResults).length === 0) throw new Error("All evaluations failed.");
    return allResults;
}

// ── Helpers ──

async function callWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < 5; attempt++) {
        try { return await fn(); }
        catch (error: any) {
            lastError = error;
            if (await handleRetryError(error, attempt, 5)) continue;
            break;
        }
    }
    console.error(`Evaluation failed for ${label}:`, lastError?.message);
    return { vendor_proposed_spec: "Error", status: "Not Mentioned", remarks: `Failed: ${lastError?.message}` } as any;
}

async function handleRetryError(error: any, attempt: number, maxRetries: number): Promise<boolean> {
    const msg = error.message || "";
    const isRateLimit = msg.includes("429") || msg.includes("RATE_LIMIT") || msg.includes("rate limit") || msg.includes("quota");
    const isOverloaded = msg.includes("503") || msg.includes("overloaded") || msg.includes("high demand") || msg.includes("Service Unavailable");
    if ((isRateLimit || isOverloaded) && attempt < maxRetries - 1) {
        const delay = RETRY_BACKOFF_BASE_MS * (attempt + 1);
        console.warn(`  ⏳ ${isOverloaded ? "Model overloaded" : "Rate limit"}. Waiting ${delay / 1000}s (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, delay));
        return true;
    }
    if ((msg.includes("413") || msg.includes("Request too large") || msg.includes("INVALID_ARGUMENT")) && attempt < maxRetries - 1) {
        console.warn(`  ⚠ Request too large — retrying...`);
        await new Promise(r => setTimeout(r, 2_000));
        return true;
    }
    return false;
}

function parseJsonResponse(text: string): Record<string, any> {
    let cleaned = text.trim();
    if (cleaned.includes("```json")) cleaned = cleaned.split("```json")[1].split("```")[0].trim();
    else if (cleaned.includes("```")) cleaned = cleaned.split("```")[1].split("```")[0].trim();
    try { return JSON.parse(cleaned); }
    catch { throw new Error("Invalid AI response — could not parse JSON"); }
}

function normalizeStatus(raw: string | undefined): EvaluationResult["status"] {
    if (!raw) return "Not Mentioned";
    const valid: EvaluationResult["status"][] = ["Meets", "Does Not Meet", "Not Mentioned", "Partial"];
    if (valid.includes(raw as any)) return raw as EvaluationResult["status"];
    const lower = raw.toLowerCase();
    if (lower.includes("does not meet") || lower.includes("doesn't meet") || lower.includes("not meet")) return "Does Not Meet";
    if (lower.includes("partial")) return "Partial";
    if (lower.includes("meet")) return "Meets";
    return "Not Mentioned";
}

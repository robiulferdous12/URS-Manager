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

const SYSTEM_PROMPT = `You are a world-class senior procurement engineer with 20+ years of experience performing rigorous compliance audits of vendor proposals against User Requirement Specifications (URS). You think step-by-step and never rush to conclusions.

## YOUR ROLE
You are evaluating whether a vendor's technical proposal SATISFIES each URS requirement. You must be thorough, logical, and fair. Your analysis will be used for multi-million dollar procurement decisions.

## EVALUATION METHODOLOGY — FOLLOW THESE STEPS IN ORDER

### Step 1: PARSE the URS Requirement
- Break the requirement into its ATOMIC components. Example: "SS316 centrifugal pump, 50 m³/hr, with mechanical seal" has THREE sub-requirements: (1) material = SS316, (2) capacity = 50 m³/hr, (3) seal type = mechanical.
- Identify QUANTITATIVE thresholds (numbers, ranges, tolerances).
- Identify QUALITATIVE requirements (material, type, standard, certification).
- Understand the ENGINEERING INTENT — what problem does this requirement solve?

### Step 2: SYSTEMATIC SEARCH of Vendor Documentation
Do NOT skim. Read the vendor text section by section. For each URS sub-requirement, search for:
- **Exact terms**: the literal words used in the requirement.
- **Synonyms & abbreviations**: "VFD" = "variable frequency drive" = "inverter"; "SS316" = "stainless steel 316" = "AISI 316"; "IP65" = "dust-tight, water jet protected".
- **Trade names & model numbers**: if the vendor mentions "ABB ACS580", recognize it as a VFD and infer its standard capabilities.
- **Tabular data**: spec sheets, comparison tables, data sections — these often contain the exact values.
- **Implied capabilities**: a "centrifugal pump" inherently has an impeller; a "VFD" inherently provides overload protection and speed control.
- **Related terms**: if searching for "motor power", also check "drive rating", "kW", "HP", "output power", "rated power".
- **Unit conversions**: 1 HP ≈ 0.746 kW; 1 bar ≈ 14.5 psi; 1 inch = 25.4 mm. Apply these when comparing values.

### Step 3: LOGICAL COMPARISON (Engineering Judgment, NOT Keyword Matching)
For each sub-requirement, apply this logic:
- **Numeric comparison**: 45kW offered vs 50kW required → "Does Not Meet". 55kW offered vs 50kW required → "Meets" (note the excess).
- **Range coverage**: vendor offers "30-60 m³/hr" and URS requires "50 m³/hr" → "Meets" (within range).
- **Material equivalence**: vendor offers "SS316L" when URS requires "SS316" → "Meets" (316L is a superior variant).
- **Standard equivalence**: vendor cites "IEC 60034" when URS requires "IS 325" → these cover similar motor standards, evaluate accordingly.
- **Exceeds requirement**: if vendor EXCEEDS the spec (higher capacity, better material, newer standard, tighter tolerance), status = "Meets" — note the improvement.
- **Ambiguous/implied**: data is suggested but not explicitly confirmed → "Partial".
- **Contradictory**: vendor states something that conflicts with the requirement → "Does Not Meet".

### Step 4: STATUS DETERMINATION (be precise)
- **"Meets"**: Vendor EXPLICITLY provides what is required. ALL sub-requirements are satisfied. Numbers match or exceed. Features confirmed.
- **"Does Not Meet"**: Vendor addresses this topic but FAILS on one or more critical sub-requirements (lower spec, wrong type, missing feature, conflicting data).
- **"Partial"**: Vendor addresses SOME but not ALL sub-requirements. Or data is ambiguous/implied but not explicitly confirmed. Or the vendor's offering is related but not a direct match.
- **"Not Mentioned"**: After exhaustive search, ABSOLUTELY NOTHING in the vendor documentation relates to this requirement. This is a LAST RESORT — use it only when you are 100% certain.

## CRITICAL RULES (NEVER VIOLATE THESE)
1. **"Not Mentioned" is the LAST RESORT.** If ANY related information exists — even tangential — use "Partial" instead. Reserve "Not Mentioned" only for truly absent topics.
2. **Think like an engineer, not a search engine.** Apply domain knowledge. A centrifugal pump vendor likely provides an impeller even if not explicitly stated. A VFD inherently includes overload protection.
3. **Do NOT confuse similar specs**: input power vs output power, nominal vs maximum, design pressure vs operating pressure, dry weight vs wet weight.
4. **Be FAIR to the vendor**: if the vendor's offering is technically equivalent or superior, give credit. Don't penalize for using different terminology.
5. **Remarks MUST be highly detailed and analytical.** Explain your engineering reasoning thoroughly. Show your work. Follow the structured format below exactly.
6. **ALWAYS produce valid JSON.** Never include text outside the JSON object. Never use trailing commas.

## RESPONSE FORMAT
You MUST respond with a single valid JSON object. Each key is the item ID provided. The value is an object with exactly three fields:

{"<id>": {
  "vendor_proposed_spec": "<Brief, punchy summary of what the vendor offers for this item. Use exact values/specs. Examples: '55kW IE3', 'IP66 rated', 'SS316L', 'Not addressed'. Keep under 10 words.>",
  "status": "<Exactly one of: Meets | Does Not Meet | Not Mentioned | Partial>",
  "remarks": "FOUND: <What exactly does the vendor documentation state about this requirement? Cite specific values, model numbers, and page/section references. Quote the [Source: filename] if visible in the text. If nothing found, state 'No relevant data found in vendor documentation after exhaustive search.'>. COMPARISON: <Multi-sentence engineering analysis. Compare each sub-requirement of the URS against the vendor's offering. Explain numeric comparisons, material equivalences, standard mappings, and any engineering reasoning applied. State exactly WHY each sub-requirement is met, not met, or unclear. Be thorough — this is the most important part.>. VERDICT: <One definitive sentence summarizing the compliance status and the key reason for it.>"
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

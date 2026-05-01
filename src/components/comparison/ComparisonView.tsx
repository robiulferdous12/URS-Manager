"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Download,
    BarChart3,
    AlertCircle,
    Loader2,
    Sparkles,
    CheckCircle2,
    XCircle,
    HelpCircle,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Building2,
    RefreshCw,
} from "lucide-react";
import { UrsItem, VendorProfile, ComparisonResult } from "@/lib/types";
import * as XLSX from "xlsx";

interface Props {
    projectId: string;
}

interface VendorProfileMeta extends VendorProfile {
    combinedTextLength?: number;
}

export default function ComparisonView({ projectId }: Props) {
    const [ursItems, setUrsItems] = useState<UrsItem[]>([]);
    const [vendors, setVendors] = useState<VendorProfileMeta[]>([]);
    const [results, setResults] = useState<ComparisonResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingVendorId, setGeneratingVendorId] = useState<string | null>(null);
    const [reEvalId, setReEvalId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>("auto");

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [ursRes, vendorRes, resultsRes] = await Promise.all([
                fetch(`/api/urs?projectId=${projectId}`),
                fetch(`/api/vendor-profiles?projectId=${projectId}`),
                fetch(`/api/comparison/results?projectId=${projectId}`),
            ]);

            if (!ursRes.ok || !vendorRes.ok || !resultsRes.ok) {
                throw new Error("Failed to fetch data");
            }

            const [ursData, vendorData, resultsData] = await Promise.all([
                ursRes.json(),
                vendorRes.json(),
                resultsRes.json(),
            ]);

            setUrsItems(ursData);
            setVendors(vendorData);
            setResults(resultsData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const showMessage = (msg: string, type: "success" | "error") => {
        if (type === "success") {
            setSuccess(msg);
            setError(null);
        } else {
            setError(msg);
            setSuccess(null);
        }
        setTimeout(() => {
            setSuccess(null);
            setError(null);
        }, 5000);
    };

    // ──────────────────────────────────────────────
    // Generate AI Comparison
    // ──────────────────────────────────────────────

    const handleGenerate = async () => {
        try {
            setGenerating(true);
            setError(null);

            const res = await fetch("/api/comparison/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, model: selectedModel }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate comparison");

            // Refresh results
            await fetchData();

            if (data.message) {
                showMessage(data.message, "success");
            } else {
                const { statusCounts, skippedVendors } = data;
                let msg = `Analysis complete: ${statusCounts.meets} Meets, ${statusCounts.doesNotMeet} Doesn't Meet, ${statusCounts.partial} Partial, ${statusCounts.notMentioned} Not Mentioned`;
                if (skippedVendors?.length > 0) {
                    msg += ` (${skippedVendors.length} already analyzed — skipped)`;
                }
                showMessage(msg, "success");
            }
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setGenerating(false);
        }
    };

    const handleGenerateVendor = async (vendorId: string, vendorName: string) => {
        try {
            setGeneratingVendorId(vendorId);
            setError(null);

            const res = await fetch("/api/comparison/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, vendorId, model: selectedModel }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to analyze vendor");

            await fetchData();

            const { statusCounts } = data;
            showMessage(
                `${vendorName}: ${statusCounts.meets} Meets, ${statusCounts.doesNotMeet} Doesn't Meet, ${statusCounts.partial} Partial, ${statusCounts.notMentioned} Not Mentioned`,
                "success"
            );
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setGeneratingVendorId(null);
        }
    };

    const handleReEvalSingle = async (ursItemId: string, vendorId: string) => {
        const key = `${ursItemId}_${vendorId}`;
        try {
            setReEvalId(key);
            setError(null);
            const res = await fetch("/api/comparison/generate-single", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, vendorId, ursItemId, model: selectedModel }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to re-evaluate item");

            // Update local state instead of refreshing the whole page
            if (data.result) {
                setResults((prev) => {
                    const index = prev.findIndex((r) => r.ursItemId === ursItemId && r.vendorProfileId === vendorId);
                    if (index >= 0) {
                        const newResults = [...prev];
                        newResults[index] = data.result;
                        return newResults;
                    }
                    return [...prev, data.result];
                });
            }

            showMessage("Item re-evaluated successfully", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setReEvalId(null);
        }
    };

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    const getResultForCell = (ursItemId: string, vendorId: string): ComparisonResult | undefined => {
        return results.find(
            (r) => r.ursItemId === ursItemId && r.vendorProfileId === vendorId
        );
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "Meets":
                return {
                    bg: "bg-success/10",
                    text: "text-success",
                    border: "border-success/20",
                    icon: <CheckCircle2 size={13} />,
                    label: "Meets",
                };
            case "Does Not Meet":
                return {
                    bg: "bg-danger/10",
                    text: "text-danger",
                    border: "border-danger/20",
                    icon: <XCircle size={13} />,
                    label: "Doesn't Meet",
                };
            case "Partial":
                return {
                    bg: "bg-primary/10",
                    text: "text-primary",
                    border: "border-primary/20",
                    icon: <AlertTriangle size={13} />,
                    label: "Partial",
                };
            case "Not Mentioned":
            default:
                return {
                    bg: "bg-warning/10",
                    text: "text-warning",
                    border: "border-warning/20",
                    icon: <HelpCircle size={13} />,
                    label: "Not Mentioned",
                };
        }
    };

    // ──────────────────────────────────────────────
    // Stats
    // ──────────────────────────────────────────────

    // Only count results for URS items that still exist
    const validUrsItemIds = new Set(ursItems.map(i => i.id));
    const validResults = results.filter(r => validUrsItemIds.has(r.ursItemId));

    const getVendorStats = (vendorId: string) => {
        const vendorResults = validResults.filter((r) => r.vendorProfileId === vendorId);
        const total = vendorResults.length;
        if (total === 0) return null;

        const meets = vendorResults.filter((r) => r.status === "Meets").length;
        const doesNotMeet = vendorResults.filter((r) => r.status === "Does Not Meet").length;
        const partial = vendorResults.filter((r) => r.status === "Partial").length;
        const notMentioned = vendorResults.filter((r) => r.status === "Not Mentioned").length;
        const compliancePercent = Math.round(((meets + partial * 0.5) / total) * 100);

        return { meets, doesNotMeet, partial, notMentioned, total, compliancePercent };
    };

    // ──────────────────────────────────────────────
    // Export
    // ──────────────────────────────────────────────

    const handleExport = () => {
        if (ursItems.length === 0 || results.length === 0) return;

        const headers = ["Sl No", "Section", "Description", "Required Spec"];
        vendors.forEach((v) => {
            headers.push(`${v.vendorName} - Proposed Spec`);
            headers.push(`${v.vendorName} - Status`);
            headers.push(`${v.vendorName} - Remarks`);
        });

        const rows: any[][] = [];
        const virtualCommercialItems = [
            {
                id: "PRICE_DATA",
                section: "Commercial & Pricing",
                description: "Price Data",
                specifications: "Total Price, currency, VAT, Duty, Freight, specific cost breakdown.",
            },
            {
                id: "WARRANTY",
                section: "Commercial & Pricing",
                description: "Warranty",
                specifications: "Duration, conditions, and coverage.",
            },
            {
                id: "COMMERCIAL_TERMS",
                section: "Commercial & Pricing",
                description: "Commercial Terms",
                specifications: "Delivery Time, Payment Terms.",
            }
        ] as any[];

        const exportItems = [...ursItems, ...virtualCommercialItems];
        const exportSections = [...new Set(exportItems.map(i => i.section || "General"))];
        for (const section of exportSections) {
            const sectionItems = exportItems.filter(i => (i.section || "General") === section);
            sectionItems.forEach((item, idx) => {
                const row: any[] = [
                    idx + 1,
                    section,
                    item.description,
                    item.specifications || "",
                ];

                vendors.forEach((v) => {
                    const result = getResultForCell(item.id, v.id);
                    row.push(result?.vendorProposedSpec || "—");
                    row.push(result?.status || "—");
                    row.push(result?.remarks || "—");
                });

                rows.push(row);
            });
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

        const colWidths = [{ wch: 6 }, { wch: 15 }, { wch: 40 }, { wch: 30 }];
        vendors.forEach(() => {
            colWidths.push({ wch: 30 }, { wch: 15 }, { wch: 30 });
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "AI Comparison");
        XLSX.writeFile(wb, `URS_AI_Comparison.xlsx`);
    };

    // ──────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────

    if (loading) {
        return (
            <div className="p-8 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 animate-shimmer rounded-lg" />
                ))}
            </div>
        );
    }

    const hasNoData = ursItems.length === 0 || vendors.length === 0;
    const hasResults = validResults.length > 0;

    // Group URS items by section
    const sections = [...new Set(ursItems.map(i => i.section || "General"))];
    const itemsBySection = sections.map(section => ({
        section,
        items: ursItems.filter(i => (i.section || "General") === section),
    }));

    if (ursItems.length > 0) {
        itemsBySection.push({
            section: "Commercial & Pricing",
            items: [
                {
                    id: "PRICE_DATA",
                    projectId,
                    description: "Price Data",
                    specifications: "Total Price, currency, VAT, Duty, Freight, specific cost breakdown.",
                    section: "Commercial & Pricing",
                    slNo: 9997,
                    quantity: 1,
                    unit: "Lot",
                    remarks: "AI extracted pricing",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: "WARRANTY",
                    projectId,
                    description: "Warranty",
                    specifications: "Duration, conditions, and coverage.",
                    section: "Commercial & Pricing",
                    slNo: 9998,
                    quantity: 1,
                    unit: "Lot",
                    remarks: "AI extracted warranty",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: "COMMERCIAL_TERMS",
                    projectId,
                    description: "Commercial Terms",
                    specifications: "Delivery Time, Payment Terms.",
                    section: "Commercial & Pricing",
                    slNo: 9999,
                    quantity: 1,
                    unit: "Lot",
                    remarks: "AI extracted commercials",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ] as UrsItem[]
        });
    }
    const vendorsWithDocs = vendors.filter((v) => (v.combinedTextLength || 0) > 0);

    if (hasNoData) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-20">
                <div className="empty-state-box mx-5">
                    <BarChart3 size={48} className="mb-4 text-border relative z-10" />
                    <h3 className="mb-2 text-heading relative z-10">
                        Cannot Generate Comparison
                    </h3>
                    <div className="relative z-10 space-y-2 text-center">
                        {ursItems.length === 0 && (
                            <p className="text-sm text-muted flex items-center gap-2 justify-center">
                                <AlertCircle size={14} className="text-warning" />
                                No URS items found. Add items in the URS Builder tab first.
                            </p>
                        )}
                        {vendors.length === 0 && (
                            <p className="text-sm text-muted flex items-center gap-2 justify-center">
                                <AlertCircle size={14} className="text-warning" />
                                No vendor profiles found. Create vendors in the Vendor
                                Profiles tab.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleGenerate}
                        className="btn-primary py-2 px-4 shadow-sm"
                        disabled={generating || generatingVendorId !== null || vendorsWithDocs.length === 0}
                    >
                        {generating ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : hasResults ? (
                            <RefreshCw size={16} strokeWidth={2.5} />
                        ) : (
                            <Sparkles size={16} strokeWidth={2.5} />
                        )}
                        <span className="font-semibold">
                            {generating
                                ? "Analyzing..."
                                : hasResults
                                    ? "Re-Generate"
                                    : "Generate Comparison"}
                        </span>
                    </button>

                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={generating || generatingVendorId !== null || vendorsWithDocs.length === 0}
                        className="bg-surface border border-border text-sm rounded-lg px-3 py-2 text-heading focus:outline-none focus:ring-1 focus:ring-primary shadow-sm font-semibold"
                    >
                        <option value="auto">Auto Config (Default)</option>
                        <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                        <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview</option>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                        <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option>
                    </select>

                    {generating && (
                        <span className="text-xs text-muted animate-pulse">
                            AI is evaluating new vendors...
                        </span>
                    )}

                    {generatingVendorId && (
                        <span className="text-xs text-muted animate-pulse">
                            Re-analyzing vendor...
                        </span>
                    )}

                    {vendorsWithDocs.length === 0 && (
                        <span className="text-xs text-warning font-medium flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Upload vendor documents first
                        </span>
                    )}
                </div>

                {hasResults && (
                    <button
                        onClick={handleExport}
                        className="btn-secondary py-2 px-4 shadow-sm"
                    >
                        <Download size={16} strokeWidth={2.5} />
                        <span className="font-semibold">Export</span>
                    </button>
                )}
            </div>

            {/* Messages */}
            {(error || success) && (
                <div
                    className={`mx-5 mt-3 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-sm ${error
                        ? "bg-danger-light border border-danger/20 text-danger"
                        : "bg-success-light border border-success/20 text-success"
                        }`}
                >
                    {error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                    {error || success}
                </div>
            )}

            {/* Vendor Compliance Summary Cards */}
            {vendors.length > 0 && (
                <div
                    className="shrink-0 grid gap-3 px-5 py-3 border-b border-border bg-surface-hover/30"
                    style={{
                        gridTemplateColumns: `repeat(${vendors.length}, 1fr)`,
                    }}
                >
                    {vendors.map((v) => {
                        const stats = getVendorStats(v.id);
                        const hasVendorDocs = (v.combinedTextLength || 0) > 0;
                        const isAnalyzingThis = generatingVendorId === v.id;

                        // Vendor with no results yet
                        if (!stats) {
                            return (
                                <div
                                    key={v.id}
                                    className="p-3 rounded-xl border bg-surface border-border"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                                                <Building2 size={16} className="text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-muted truncate max-w-[120px]">
                                                    {v.vendorName}
                                                </p>
                                                <p className="text-[13px] font-bold text-muted leading-tight">
                                                    Not Analyzed
                                                </p>
                                            </div>
                                        </div>
                                        {hasVendorDocs && (
                                            <button
                                                onClick={() => handleGenerateVendor(v.id, v.vendorName)}
                                                className="text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                                                disabled={generating || generatingVendorId !== null}
                                            >
                                                {isAnalyzingThis ? (
                                                    <Loader2 size={11} className="animate-spin" />
                                                ) : (
                                                    <Sparkles size={11} />
                                                )}
                                                {isAnalyzingThis ? "Analyzing..." : "Analyze"}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-border/30" />
                                    <p className="text-[10px] text-muted mt-2">
                                        {hasVendorDocs ? "Click Analyze to evaluate" : "Upload documents first"}
                                    </p>
                                </div>
                            );
                        }

                        const isTopCompliance =
                            vendors.length > 1 &&
                            stats.compliancePercent ===
                            Math.max(
                                ...vendors
                                    .map((vv) => getVendorStats(vv.id)?.compliancePercent || 0)
                            );

                        return (
                            <div
                                key={v.id}
                                className={`p-3 rounded-xl border transition-all ${isTopCompliance
                                    ? "bg-success-light border-success/30 shadow-sm"
                                    : "bg-surface border-border"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${isTopCompliance
                                                ? "bg-success/20"
                                                : "bg-primary/10"
                                                }`}
                                        >
                                            <Building2
                                                size={16}
                                                className={
                                                    isTopCompliance
                                                        ? "text-success"
                                                        : "text-primary"
                                                }
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-muted truncate max-w-[120px]">
                                                {v.vendorName}
                                            </p>
                                            <p
                                                className={`text-[18px] font-extrabold leading-tight ${isTopCompliance
                                                    ? "text-success"
                                                    : "text-heading"
                                                    }`}
                                            >
                                                {stats.compliancePercent}%
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isTopCompliance && vendors.length > 1 && (
                                            <span className="text-[9px] font-bold text-success bg-success/15 px-2 py-0.5 rounded-lg">
                                                ★ BEST
                                            </span>
                                        )}
                                        <button
                                            onClick={() => handleGenerateVendor(v.id, v.vendorName)}
                                            className="text-[10px] font-bold text-muted hover:text-primary bg-surface-hover hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                                            disabled={generating || generatingVendorId !== null}
                                            title="Re-analyze this vendor"
                                        >
                                            {isAnalyzingThis ? (
                                                <Loader2 size={13} className="animate-spin text-primary" />
                                            ) : (
                                                <RefreshCw size={13} />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Mini stat bar */}
                                <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-border/30">
                                    {stats.meets > 0 && (
                                        <div
                                            className="bg-success rounded-full transition-all"
                                            style={{
                                                width: `${(stats.meets / stats.total) * 100}%`,
                                            }}
                                        />
                                    )}
                                    {stats.partial > 0 && (
                                        <div
                                            className="bg-primary rounded-full transition-all"
                                            style={{
                                                width: `${(stats.partial / stats.total) * 100}%`,
                                            }}
                                        />
                                    )}
                                    {stats.doesNotMeet > 0 && (
                                        <div
                                            className="bg-danger rounded-full transition-all"
                                            style={{
                                                width: `${(stats.doesNotMeet / stats.total) * 100}%`,
                                            }}
                                        />
                                    )}
                                    {stats.notMentioned > 0 && (
                                        <div
                                            className="bg-warning rounded-full transition-all"
                                            style={{
                                                width: `${(stats.notMentioned / stats.total) * 100}%`,
                                            }}
                                        />
                                    )}
                                </div>

                                <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold text-muted">
                                    <span className="text-success">✓ {stats.meets}</span>
                                    <span className="text-danger">✗ {stats.doesNotMeet}</span>
                                    <span className="text-primary">◐ {stats.partial}</span>
                                    <span className="text-warning">? {stats.notMentioned}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Comparison Matrix Table */}
            {hasResults ? (
                <div className="flex-1 overflow-auto">
                    <table className="text-sm border-separate border-spacing-0" style={{ tableLayout: 'fixed', minWidth: `${50 + 250 * 2 + vendors.length * (350 + 120)}px` }}>
                        <thead className="sticky top-0 z-10 bg-surface-hover shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            <tr className="bg-surface-hover border-b border-border">
                                <th className="boq-th text-center px-3 py-2.5 w-[50px] min-w-[50px] max-w-[50px] sticky left-0 bg-surface-hover z-20 border-b border-r border-border">
                                    Sl
                                </th>
                                <th className="boq-th text-left px-3 py-2.5 w-[250px] min-w-[250px] sticky left-[50px] bg-surface-hover z-20 border-b border-r border-border">
                                    URS Requirement
                                </th>
                                <th className="boq-th text-left px-3 py-2.5 w-[250px] min-w-[250px] bg-surface-hover border-b border-r border-border">
                                    Required Spec
                                </th>
                                {vendors.map((v) => (
                                    <th
                                        key={v.id}
                                        colSpan={2}
                                        className="boq-th text-center px-3 py-2.5 bg-surface-hover border-b border-r border-border"
                                    >
                                        <span className="text-primary">{v.vendorName}</span>
                                    </th>
                                ))}
                            </tr>
                            <tr className="bg-surface-hover border-b border-border">
                                <th className="sticky left-0 bg-surface-hover z-20 border-b border-r border-border" />
                                <th className="sticky left-[50px] bg-surface-hover z-20 border-b border-r border-border" />
                                <th className="bg-surface-hover border-b border-r border-border" />
                                {vendors.map((v) => (
                                    <React.Fragment key={`sub-${v.id}`}>
                                        <th className="boq-th text-center px-2 py-1.5 w-[350px] min-w-[350px] bg-surface-hover border-b border-r border-border text-[9px]">
                                            Proposed Spec
                                        </th>
                                        <th className="boq-th text-center px-2 py-1.5 w-[120px] min-w-[120px] bg-surface-hover border-b border-r border-border text-[9px]">
                                            Status
                                        </th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {itemsBySection.map(({ section, items: sectionItems }) => (
                                <React.Fragment key={`section-${section}`}>
                                    {/* Section Header Row */}
                                    <tr className="bg-primary/5 border-b border-border">
                                        <td
                                            colSpan={3 + vendors.length * 2}
                                            className="px-4 py-2 sticky left-0 z-10"
                                        >
                                            <span className="text-[11px] font-extrabold text-primary uppercase tracking-wider">
                                                {section}
                                            </span>
                                            <span className="text-[10px] text-muted ml-2 font-semibold">
                                                ({sectionItems.length} {sectionItems.length === 1 ? "item" : "items"})
                                            </span>
                                        </td>
                                    </tr>
                                    {sectionItems.map((item, itemIndex) => {
                                        const isExpanded = expandedRow === item.id;
                                        return (
                                            <React.Fragment key={item.id}>
                                                <tr
                                                    className="boq-row cursor-pointer"
                                                    onClick={() =>
                                                        setExpandedRow(
                                                            isExpanded ? null : item.id
                                                        )
                                                    }
                                                >
                                                    <td className="px-3 py-2.5 text-center text-xs font-semibold text-muted sticky left-0 bg-surface z-10 w-[50px] min-w-[50px] max-w-[50px] border-b border-r border-border">
                                                        {itemIndex + 1}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-left text-[13px] text-heading font-medium sticky left-[50px] bg-surface z-10 border-b border-r border-border" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                                        <div className="flex items-start gap-1.5">
                                                            {isExpanded ? (
                                                                <ChevronDown
                                                                    size={13}
                                                                    className="text-muted shrink-0"
                                                                />
                                                            ) : (
                                                                <ChevronRight
                                                                    size={13}
                                                                    className="text-muted shrink-0"
                                                                />
                                                            )}
                                                            <span>
                                                                {item.description}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-left text-[12px] text-body leading-relaxed border-b border-r border-border" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                        <span>
                                                            {item.specifications || "—"}
                                                        </span>
                                                    </td>
                                                    {vendors.map((v) => {
                                                        const result = getResultForCell(
                                                            item.id,
                                                            v.id
                                                        );
                                                        const config = result
                                                            ? getStatusConfig(result.status)
                                                            : null;

                                                        return (
                                                            <React.Fragment
                                                                key={`${v.id}-${item.id}`}
                                                            >
                                                                <td className="px-2 py-2.5 text-left text-[12px] text-body border-b border-r border-border" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                                    <span>
                                                                        {result?.vendorProposedSpec ||
                                                                            "—"}
                                                                    </span>
                                                                </td>
                                                                <td className="px-2 py-2.5 text-center border-b border-r border-border">
                                                                    {config ? (
                                                                        <span
                                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${config.bg} ${config.text} border ${config.border}`}
                                                                        >
                                                                            {config.icon}
                                                                            {config.label}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-xs text-muted">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tr>

                                                {/* Expanded remarks row */}
                                                {isExpanded && (
                                                    <tr className="bg-surface-hover/30">
                                                        <td />
                                                        <td
                                                            colSpan={2}
                                                            className="px-5 py-3 sticky left-[50px] bg-surface-hover/30 z-10"
                                                            style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '500px' }}
                                                        >
                                                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                                                URS Remarks
                                                            </span>
                                                            <p className="text-xs text-body mt-0.5">
                                                                {item.remarks || "No additional remarks"}
                                                            </p>
                                                        </td>
                                                        {vendors.map((v) => {
                                                            const result = getResultForCell(
                                                                item.id,
                                                                v.id
                                                            );
                                                            const isBusy = reEvalId === `${item.id}_${v.id}`;
                                                            const config = result ? getStatusConfig(result.status) : null;

                                                            // Parse structured remarks (FOUND: ... COMPARISON: ... VERDICT: ...)
                                                            const remarksText = result?.remarks || "";
                                                            const foundMatch = remarksText.match(/FOUND:\s*([\s\S]*?)(?=\s*COMPARISON:|$)/i);
                                                            const comparisonMatch = remarksText.match(/COMPARISON:\s*([\s\S]*?)(?=\s*VERDICT:|$)/i);
                                                            const verdictMatch = remarksText.match(/VERDICT:\s*([\s\S]*?)$/i);
                                                            const hasStructured = foundMatch || comparisonMatch || verdictMatch;

                                                            return (
                                                                <td
                                                                    key={`remark-${v.id}`}
                                                                    colSpan={2}
                                                                    className="px-3 py-3 border-l border-border align-top"
                                                                    style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '470px' }}
                                                                >
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                                                                AI Analysis
                                                                            </span>
                                                                            {config && (
                                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${config.bg} ${config.text} border ${config.border}`}>
                                                                                    {config.icon} {config.label}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleReEvalSingle(item.id, v.id); }}
                                                                            disabled={isBusy || generating || generatingVendorId !== null}
                                                                            className="text-[10px] text-muted hover:text-primary bg-surface-hover hover:bg-primary/10 p-1 rounded-md transition-colors flex items-center gap-1"
                                                                            title="Re-evaluate this item"
                                                                        >
                                                                            {isBusy ? <Loader2 size={11} className="animate-spin text-primary" /> : <RefreshCw size={11} />}
                                                                        </button>
                                                                    </div>


                                                                    {hasStructured ? (
                                                                        <div className="space-y-1.5">
                                                                            {foundMatch?.[1]?.trim() && (
                                                                                <div className="flex gap-1.5">
                                                                                    <span className="text-[9px] font-bold text-blue-500 uppercase shrink-0 mt-0.5 w-[75px]">📋 Found</span>
                                                                                    <p className="text-[11px] text-body leading-relaxed">{foundMatch[1].trim()}</p>
                                                                                </div>
                                                                            )}
                                                                            {comparisonMatch?.[1]?.trim() && (
                                                                                <div className="flex gap-1.5">
                                                                                    <span className="text-[9px] font-bold text-amber-500 uppercase shrink-0 mt-0.5 w-[75px]">⚖️ Logic</span>
                                                                                    <p className="text-[11px] text-body leading-relaxed">{comparisonMatch[1].trim()}</p>
                                                                                </div>
                                                                            )}
                                                                            {verdictMatch?.[1]?.trim() && (
                                                                                <div className="flex gap-1.5">
                                                                                    <span className="text-[9px] font-bold text-emerald-500 uppercase shrink-0 mt-0.5 w-[75px]">✅ Verdict</span>
                                                                                    <p className="text-[11px] text-heading font-semibold leading-relaxed">{verdictMatch[1].trim()}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-[11px] text-body leading-relaxed">
                                                                            {remarksText || "No analysis available"}
                                                                        </p>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-20">
                    <div className="text-center max-w-md">
                        <Sparkles
                            size={48}
                            className="mx-auto mb-4 text-primary/30"
                        />
                        <h3 className="text-lg font-bold text-heading mb-2">
                            Ready to Compare
                        </h3>
                        <p className="text-sm text-muted mb-6">
                            Click &quot;Generate Comparison&quot; to have AI analyze{" "}
                            {ursItems.length} URS requirements against{" "}
                            {vendorsWithDocs.length} vendor
                            {vendorsWithDocs.length !== 1 ? "s" : ""}&apos;
                            documentation.
                        </p>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-muted mb-6">
                            <span className="flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-success" /> Meets
                            </span>
                            <span className="flex items-center gap-1">
                                <XCircle size={12} className="text-danger" /> Doesn&apos;t
                                Meet
                            </span>
                            <span className="flex items-center gap-1">
                                <AlertTriangle size={12} className="text-primary" /> Partial
                            </span>
                            <span className="flex items-center gap-1">
                                <HelpCircle size={12} className="text-warning" /> Not
                                Mentioned
                            </span>
                        </div>

                        <button
                            onClick={handleGenerate}
                            className="btn-primary py-2.5 px-6 shadow-md mx-auto"
                            disabled={generating || vendorsWithDocs.length === 0}
                        >
                            {generating ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Sparkles size={18} />
                            )}
                            {generating ? "Analyzing..." : "Generate AI Comparison"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

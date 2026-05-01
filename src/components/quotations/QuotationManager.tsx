"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Upload,
    Trash2,
    FileSpreadsheet,
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Package,
    Building2,
    Calendar,
    Hash,
} from "lucide-react";
import { Quotation } from "@/lib/types";

interface Props {
    projectId: string;
}

export default function QuotationManager({ projectId }: Props) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [vendorName, setVendorName] = useState("");
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchQuotations = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/quotations?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to fetch quotations");
            const data = await res.json();
            setQuotations(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchQuotations();
    }, [fetchQuotations]);

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
        }, 3000);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!vendorName.trim()) {
            showMessage("Please enter a vendor name first", "error");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("projectId", projectId);
            formData.append("vendorName", vendorName.trim());

            const res = await fetch("/api/quotations", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            await fetchQuotations();
            setVendorName("");
            setShowUploadForm(false);
            showMessage(`Quotation from "${data.vendorName}" uploaded (${data.items.length} items)`, "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (id: string, vendorName: string) => {
        if (!confirm(`Delete quotation from "${vendorName}"?`)) return;
        try {
            const res = await fetch(`/api/quotations/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete quotation");
            await fetchQuotations();
            showMessage("Quotation deleted", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        }
    };

    const formatDate = (d: string) => {
        return new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getTotal = (q: Quotation) =>
        q.items.reduce((sum, item) => sum + item.totalPrice, 0);

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowUploadForm(!showUploadForm)}
                        className="btn-primary py-2 px-3.5 text-xs"
                    >
                        <Upload size={15} strokeWidth={2} />
                        <span>Upload Quotation</span>
                    </button>
                </div>
                <span className="text-xs font-semibold text-muted">
                    {quotations.length} quotation{quotations.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Upload Form */}
            {showUploadForm && (
                <div className="mx-5 mt-3 p-4 bg-surface-hover border border-border rounded-xl animate-fade-in">
                    <h3 className="text-sm font-semibold text-heading mb-3">Upload Vendor Quotation</h3>
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-heading mb-1.5">
                                Vendor Name <span className="text-danger">*</span>
                            </label>
                            <input
                                type="text"
                                value={vendorName}
                                onChange={(e) => setVendorName(e.target.value)}
                                placeholder="e.g. ABC Supplies Ltd."
                                className="input-field w-full py-2 text-xs"
                            />
                        </div>
                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleUpload}
                                className="hidden"
                                id="quotation-upload"
                            />
                            <button
                                onClick={() => {
                                    if (!vendorName.trim()) {
                                        showMessage("Enter vendor name first", "error");
                                        return;
                                    }
                                    fileInputRef.current?.click();
                                }}
                                className="btn-primary py-2 px-4 text-xs"
                                disabled={uploading}
                            >
                                <Upload size={14} />
                                {uploading ? "Uploading..." : "Choose File"}
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                setShowUploadForm(false);
                                setVendorName("");
                            }}
                            className="btn-secondary py-2 px-3 text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                    <p className="text-[11px] text-muted mt-2">
                        Excel should contain columns: Description, Unit, Quantity, Unit Rate/Rate, Total/Amount
                    </p>
                </div>
            )}

            {/* Messages */}
            {(error || success) && (
                <div
                    className={`mx-5 mt-3 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                        error
                            ? "bg-danger-light border border-danger/20 text-danger"
                            : "bg-success-light border border-success/20 text-success"
                    }`}
                >
                    {error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                    {error || success}
                </div>
            )}

            {/* Quotation List */}
            <div className="flex-1 overflow-auto p-5 space-y-3">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-20 animate-shimmer rounded-xl" />
                        ))}
                    </div>
                ) : quotations.length === 0 ? (
                    <div className="empty-state-box">
                        <Package size={48} className="mb-4 text-border relative z-10" />
                        <h3 className="mb-1 text-heading relative z-10">No Quotations Yet</h3>
                        <p className="text-muted text-sm max-w-xs text-center relative z-10">
                            Upload vendor quotation Excel files to compare against your URS.
                        </p>
                        <button
                            onClick={() => setShowUploadForm(true)}
                            className="btn-primary py-2 px-4 text-xs mt-5 relative z-10"
                        >
                            <Upload size={15} />
                            Upload First Quotation
                        </button>
                    </div>
                ) : (
                    quotations.map((q) => (
                        <div
                            key={q.id}
                            className="card overflow-hidden animate-fade-in"
                        >
                            {/* Quotation Header */}
                            <div
                                className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-surface-hover/50 transition-colors"
                                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                        <Building2 size={20} className="text-primary" strokeWidth={1.5} />
                                    </div>
                                    <div>
                                        <h3 className="text-[14px] font-semibold text-heading">{q.vendorName}</h3>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-[11px] text-muted flex items-center gap-1">
                                                <Calendar size={11} />
                                                {formatDate(q.uploadedAt)}
                                            </span>
                                            <span className="text-[11px] text-muted flex items-center gap-1">
                                                <Hash size={11} />
                                                {q.items.length} items
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="text-right mr-2">
                                        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total</p>
                                        <p className="text-[15px] font-bold text-heading">
                                            ৳{getTotal(q).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(q.id, q.vendorName);
                                        }}
                                        className="p-2 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors cursor-pointer"
                                        title="Delete Quotation"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                    {expandedId === q.id ? (
                                        <ChevronDown size={18} className="text-muted" />
                                    ) : (
                                        <ChevronRight size={18} className="text-muted" />
                                    )}
                                </div>
                            </div>

                            {/* Expanded Items Table */}
                            {expandedId === q.id && (
                                <div className="border-t border-border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-surface-hover">
                                                <th className="boq-th text-center px-3 py-2 w-[50px]">#</th>
                                                <th className="boq-th text-left px-3 py-2">Description</th>
                                                <th className="boq-th text-center px-3 py-2 w-[80px]">Unit</th>
                                                <th className="boq-th text-center px-3 py-2 w-[80px]">Qty</th>
                                                <th className="boq-th text-center px-3 py-2 w-[100px]">Unit Rate</th>
                                                <th className="boq-th text-center px-3 py-2 w-[120px]">Total Price</th>
                                                <th className="boq-th text-left px-3 py-2 w-[150px]">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {q.items.map((item, idx) => (
                                                <tr key={item.id} className="boq-row">
                                                    <td className="px-3 py-2 text-center text-xs text-muted">{idx + 1}</td>
                                                    <td className="px-3 py-2 text-left text-[13px] text-heading font-medium">{item.description}</td>
                                                    <td className="px-3 py-2 text-center text-xs text-muted">{item.unit || "—"}</td>
                                                    <td className="px-3 py-2 text-center text-xs font-semibold">{item.quantity}</td>
                                                    <td className="px-3 py-2 text-center text-xs font-semibold">
                                                        ৳{item.unitRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-3 py-2 text-center text-xs font-bold text-heading">
                                                        ৳{item.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-3 py-2 text-left text-xs text-muted">{item.remarks || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="boq-footer-row font-bold">
                                                <td colSpan={5} className="px-3 py-2.5 text-right text-xs uppercase tracking-wider text-muted">
                                                    Grand Total
                                                </td>
                                                <td className="px-3 py-2.5 text-center text-sm text-heading">
                                                    ৳{getTotal(q).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

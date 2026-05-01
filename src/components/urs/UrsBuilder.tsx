"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Plus,
    Trash2,
    Upload,
    Download,
    Save,
    FileSpreadsheet,
    AlertCircle,
    CheckCircle2,
    X,
    GripVertical,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { UrsItem } from "@/lib/types";
import * as XLSX from "xlsx";

interface Props {
    projectId: string;
}

export default function UrsBuilder({ projectId }: Props) {
    const [items, setItems] = useState<UrsItem[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<UrsItem>>({});
    const [newRow, setNewRow] = useState<Partial<UrsItem> & { section: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Delete Modal
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);

    // Preview Modal
    const [previewItems, setPreviewItems] = useState<Partial<UrsItem>[] | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [uploadSummary, setUploadSummary] = useState<any>(null);

    const fetchItems = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/urs?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to fetch URS items");
            const data: UrsItem[] = await res.json();
            setItems(data);
            
            // Extract unique sections
            const uniqueSections = Array.from(new Set(data.map(i => i.section || "General")));
            setSections(prev => {
                const combined = Array.from(new Set([...prev, ...uniqueSections]));
                return combined.length > 0 ? combined : ["General"];
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

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

    const handleAddSection = () => {
        const sectionName = prompt("Enter new section name:");
        if (sectionName && sectionName.trim()) {
            const cleanName = sectionName.trim();
            if (!sections.includes(cleanName)) {
                setSections([...sections, cleanName]);
            }
        }
    };

    const handleDeleteSection = async (sectionName: string, confirmed: boolean = false) => {
        if (!confirmed) {
            setSectionToDelete(sectionName);
            return;
        }

        try {
            setSaving(true);
            const res = await fetch(`/api/urs?projectId=${projectId}&section=${encodeURIComponent(sectionName)}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete section");
            
            // Remove section from state
            setSections(sections.filter(s => s !== sectionName));
            await fetchItems(); // Refresh items
            showMessage(`Section "${sectionName}" deleted`, "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const toggleSection = (sectionName: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionName)) {
                next.delete(sectionName);
            } else {
                next.add(sectionName);
            }
            return next;
        });
    };

    const handleAddRow = (sectionName: string) => {
        // Use project-wide max slNo for strictly sequential numbering
        const nextSlNo = items.length > 0 ? Math.max(...items.map((i) => i.slNo)) + 1 : 1;
        
        // Ensure the section is expanded before adding a row
        if (collapsedSections.has(sectionName)) {
            toggleSection(sectionName);
        }

        setNewRow({
            section: sectionName,
            slNo: nextSlNo,
            description: "",
            specifications: "",
            remarks: "",
            unit: null,
            quantity: 0
        });
    };

    const handleSaveNew = async () => {
        if (!newRow?.description?.trim()) {
            showMessage("Description is required", "error");
            return;
        }

        try {
            setSaving(true);
            const res = await fetch("/api/urs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newRow, projectId }),
            });

            if (!res.ok) throw new Error("Failed to add item");
            setNewRow(null);
            await fetchItems();
            showMessage("Item added successfully", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item: UrsItem) => {
        setEditingId(item.id);
        setEditForm({
            slNo: item.slNo,
            description: item.description,
            specifications: item.specifications || "",
            remarks: item.remarks || "",
            section: item.section || "General",
        });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        try {
            setSaving(true);
            const res = await fetch(`/api/urs/${editingId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });

            if (!res.ok) throw new Error("Failed to update item");
            setEditingId(null);
            setEditForm({});
            await fetchItems();
            showMessage("Item updated", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, confirmed: boolean = false) => {
        if (!confirmed) {
            setItemToDelete(id);
            return;
        }
        try {
            const res = await fetch(`/api/urs/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete item");
            await fetchItems();
            showMessage("Item deleted", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("projectId", projectId);

            const res = await fetch("/api/urs/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            setPreviewItems(data.items);
            setUploadSummary(data.summary || null);
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleConfirmImport = async () => {
        if (!previewItems || previewItems.length === 0) return;

        try {
            setIsImporting(true);
            const res = await fetch("/api/urs/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: previewItems }),
            });

            if (!res.ok) throw new Error("Failed to save imported items");
            
            setPreviewItems(null);
            setUploadSummary(null);
            await fetchItems();
            showMessage(`${previewItems.length} items imported successfully`, "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setIsImporting(false);
        }
    };

    const handlePreviewItemChange = (idx: number, field: keyof Partial<UrsItem>, value: any) => {
        if (!previewItems) return;
        const newItems = [...previewItems];
        newItems[idx] = { ...newItems[idx], [field]: value };
        setPreviewItems(newItems);
    };

    const handleRemovePreviewItem = (idx: number) => {
        if (!previewItems) return;
        setPreviewItems(previewItems.filter((_, i) => i !== idx));
    };

    const handleAddPreviewItem = () => {
        if (!previewItems) return;
        // Check both existing items and preview items for max slNo
        const projectMaxSl = items.length > 0 ? Math.max(...items.map(i => i.slNo)) : 0;
        const previewMaxSl = previewItems.reduce((max, item) => Math.max(max, item.slNo || 0), 0);
        const maxSl = Math.max(projectMaxSl, previewMaxSl);

        setPreviewItems([...previewItems, {
            projectId,
            section: "General",
            slNo: maxSl + 1,
            description: "",
            specifications: "",
            remarks: "",
            quantity: 0
        }]);
    };

    const handleExport = () => {
        if (items.length === 0) return;

        const exportData = items.map((item) => ({
            Section: item.section || "General",
            "Sl No": item.slNo,
            Description: item.description,
            Specifications: item.specifications || "",
            Remarks: item.remarks || "",
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "URS");

        ws["!cols"] = [
            { wch: 15 },
            { wch: 8 },
            { wch: 50 },
            { wch: 30 },
            { wch: 30 },
        ];

        XLSX.writeFile(wb, `URS_Export.xlsx`);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {/* Delete Confirmation Modal */}
            {itemToDelete && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full p-6 animate-scale-in border border-border">
                        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                            <AlertCircle className="text-danger" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-heading mb-2">Delete URS Item?</h3>
                        <p className="text-sm text-muted mb-6">
                            Are you sure you want to delete this URS item? This action cannot be undone and will remove related AI compliance results.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn-secondary py-2 px-4 font-semibold"
                                onClick={() => setItemToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="bg-danger text-white hover:bg-danger-hover py-2 px-4 rounded-lg font-bold shadow-sm transition-colors"
                                onClick={() => {
                                    handleDelete(itemToDelete, true);
                                    setItemToDelete(null);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Section Delete Confirmation Modal */}
            {sectionToDelete && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full p-6 animate-scale-in border border-border">
                        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                            <AlertCircle className="text-danger" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-heading mb-2">Delete Entire Section?</h3>
                        <p className="text-sm text-muted mb-6">
                            Are you sure you want to delete the section <span className="font-semibold text-heading">&quot;{sectionToDelete}&quot;</span>? This will permanently remove all items within this section.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn-secondary py-2 px-4 font-semibold"
                                onClick={() => setSectionToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="bg-danger text-white hover:bg-danger-hover py-2 px-4 rounded-lg font-bold shadow-sm transition-colors"
                                onClick={() => {
                                    handleDeleteSection(sectionToDelete, true);
                                    setSectionToDelete(null);
                                }}
                            >
                                Delete Section
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Preview Modal */}
            {previewItems && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-surface rounded-xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col animate-scale-in border border-border">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-surface">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                    <FileSpreadsheet size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-heading">Review URS Import</h2>
                                    <p className="text-xs text-muted font-medium">Please verify the extracted data before saving.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {uploadSummary && (
                                    <div className="flex items-center gap-2">
                                        {uploadSummary.skippedRows > 0 && (
                                            <span className="px-2.5 py-1 bg-warning/10 text-warning rounded-lg text-[10px] font-bold">
                                                {uploadSummary.skippedRows} rows skipped
                                            </span>
                                        )}
                                        <span className="px-2.5 py-1 bg-success/10 text-success rounded-lg text-[10px] font-bold">
                                            {uploadSummary.sections?.length || 0} sections
                                        </span>
                                    </div>
                                )}
                                <div className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-bold flex items-center gap-2">
                                    <span>{previewItems.length}</span>
                                    <span className="text-[10px] uppercase opacity-80">Items Found</span>
                                </div>
                                <button className="p-2 text-muted hover:text-danger bg-surface-hover hover:bg-danger/10 rounded-lg transition-colors" onClick={() => { setPreviewItems(null); setUploadSummary(null); }} disabled={isImporting}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body / Table view */}
                        <div className="flex-1 overflow-auto bg-surface-hover/30 p-6">
                            <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10 bg-surface-hover border-b border-border shadow-sm">
                                        <tr>
                                            <th className="boq-th text-left px-4 py-3 w-[150px]">Section</th>
                                            <th className="boq-th text-center px-4 py-3 w-[80px]">Sl.No.</th>
                                            <th className="boq-th text-left px-4 py-3 min-w-[200px]">Description</th>
                                            <th className="boq-th text-left px-4 py-3 min-w-[200px]">Specifications</th>
                                            <th className="boq-th text-left px-4 py-3">Remarks</th>
                                            <th className="boq-th text-center px-4 py-3 w-[60px]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {previewItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-surface-hover/30 transition-colors">
                                                <td className="p-2">
                                                    <input 
                                                        type="text" 
                                                        className="w-full px-2 py-1.5 min-h-[36px] bg-transparent border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded text-xs font-bold text-primary"
                                                        value={item.section || ""} 
                                                        onChange={(e) => handlePreviewItemChange(idx, "section", e.target.value)}
                                                        placeholder="Section"
                                                    />
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className="font-semibold text-muted text-xs">
                                                        {item.slNo}
                                                    </span>
                                                </td>
                                                <td className="p-2">
                                                    <textarea 
                                                        className="w-full px-2 py-1.5 min-h-[36px] bg-transparent border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded font-semibold text-heading text-[13px] resize-y"
                                                        value={item.description || ""} 
                                                        onChange={(e) => handlePreviewItemChange(idx, "description", e.target.value)}
                                                        placeholder="Description"
                                                        rows={2}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <textarea 
                                                        className="w-full px-2 py-1.5 min-h-[36px] bg-transparent border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded text-body text-[13px] resize-y"
                                                        value={item.specifications || ""} 
                                                        onChange={(e) => handlePreviewItemChange(idx, "specifications", e.target.value)}
                                                        placeholder="Specifications"
                                                        rows={2}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <textarea 
                                                        className="w-full px-2 py-1.5 min-h-[36px] bg-transparent border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded text-muted text-[13px] resize-y"
                                                        value={item.remarks || ""} 
                                                        onChange={(e) => handlePreviewItemChange(idx, "remarks", e.target.value)}
                                                        placeholder="Remarks"
                                                        rows={1}
                                                    />
                                                </td>
                                                <td className="p-2 text-center h-full align-top pt-3">
                                                    <button 
                                                        onClick={() => handleRemovePreviewItem(idx)}
                                                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors mx-auto flex items-center justify-center"
                                                        title="Delete Row"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex justify-center">
                                <button 
                                    onClick={handleAddPreviewItem}
                                    className="btn-secondary py-2 px-4 shadow-sm border border-border"
                                >
                                    <Plus size={16} strokeWidth={2.5} className="mr-1.5 text-primary" />
                                    Add Custom Row
                                </button>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-surface">
                            <button
                                onClick={() => { setPreviewItems(null); setUploadSummary(null); }}
                                className="btn-secondary py-2 px-5 font-semibold"
                                disabled={isImporting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                className="btn-primary py-2 px-6 font-bold shadow-md"
                                disabled={isImporting}
                            >
                                {isImporting ? "Importing..." : "Confirm & Import"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-surface shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleAddSection} className="btn-primary py-2 px-4 shadow-sm">
                        <Plus size={16} strokeWidth={2.5} />
                        <span className="font-semibold">Add Section</span>
                    </button>
                    <div className="relative">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleUpload}
                            className="hidden"
                            id="urs-upload"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-secondary py-2 px-4 shadow-sm"
                            disabled={uploading}
                        >
                            <Upload size={16} strokeWidth={2.5} />
                            <span className="font-semibold">{uploading ? "Uploading..." : "Upload"}</span>
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-bold text-sm">
                        <span>{items.length}</span>
                        <span className="opacity-80 font-semibold text-xs">ITEMS</span>
                    </div>
                    {items.length > 0 && (
                        <button onClick={handleExport} className="btn-secondary py-2 px-4 shadow-sm">
                            <Download size={16} strokeWidth={2.5} />
                            <span className="font-semibold">Export</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            {(error || success) && (
                <div
                    className={`mx-6 mt-4 p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in shadow-sm ${
                        error
                            ? "bg-danger-light border border-danger/20 text-danger"
                            : "bg-success-light border border-success/20 text-success"
                    }`}
                >
                    {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    {error || success}
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6 scroll-smooth">
                {loading ? (
                    <div className="space-y-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-40 animate-shimmer rounded-xl border border-border/50" />
                        ))}
                    </div>
                ) : sections.length === 0 ? (
                    <div className="empty-state-box max-w-lg mx-auto mt-12 shadow-sm">
                        <FileSpreadsheet size={56} className="mb-5 text-muted relative z-10" strokeWidth={1.5} />
                        <h3 className="mb-2 text-heading text-lg font-bold relative z-10">No URS Sections Yet</h3>
                        <p className="text-muted text-sm max-w-xs text-center relative z-10 mb-6">
                            Start adding requirement sections to build your specification document.
                        </p>
                        <button onClick={handleAddSection} className="btn-primary py-2.5 px-6 font-semibold shadow-md relative z-10">
                            <Plus size={18} strokeWidth={2.5} />
                            Create First Section
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6 pb-12">
                        {sections.map(section => {
                            const sectionItems = items.filter(i => (i.section || "General") === section);
                            const isCollapsed = collapsedSections.has(section);
                            
                            return (
                                <div key={section} className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col mb-6 transition-all duration-200">
                                    <div className="flex-1 w-full flex flex-col min-w-0">
                                        {/* Section Header */}
                                        <div 
                                            className="flex items-center justify-between px-5 py-3 bg-surface-hover/80 border-b border-border border-l-4 border-l-primary cursor-pointer select-none"
                                            onClick={() => toggleSection(section)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <button className="text-muted hover:text-heading transition-colors">
                                                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                                                </button>
                                                <h3 className="font-extrabold text-heading uppercase tracking-wide text-[13px]">{section}</h3>
                                                <div className="flex items-center gap-1.5 ml-2">
                                                    <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                        {sectionItems.length} {sectionItems.length === 1 ? 'Item' : 'Items'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleAddRow(section)}
                                                    className="btn-secondary py-1.5 px-3 text-[12px] shadow-sm border-border/80"
                                                    title="Add Item"
                                                    disabled={!!newRow && newRow.section === section}
                                                >
                                                    <Plus size={14} strokeWidth={2.5} className="text-primary" />
                                                    <span className="font-semibold">Add Item</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSection(section); }}
                                                    className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger flex items-center transition-colors border border-transparent hover:border-danger/20 bg-surface"
                                                    title="Delete Section"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Section Content */}
                                        {!isCollapsed && (sectionItems.length > 0 || newRow?.section === section) && (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm table-fixed">
                                                    <thead>
                                                        <tr className="border-b border-border bg-surface-hover">
                                                            <th className="boq-th text-center px-4 py-2.5 w-[60px]">SL.No.</th>
                                                            <th className="boq-th text-left px-4 py-2.5 w-[25%]">Description</th>
                                                            <th className="boq-th text-left px-4 py-2.5 w-[45%]">Specifications</th>
                                                            <th className="boq-th text-left px-4 py-2.5 w-[30%]">Remarks</th>
                                                            <th className="boq-th text-center px-4 py-2.5 w-[80px]">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sectionItems.map((item, itemIndex) => (
                                                            <tr
                                                                key={item.id}
                                                                className="group hover:bg-surface-hover/50 transition-colors border-b border-border relative"
                                                                onDoubleClick={() => handleEdit(item)}
                                                            >
                                                                {editingId === item.id ? (
                                                                    <>
                                                                        <td className="px-3 py-3 text-center align-top">
                                                                            <span className="font-bold text-muted text-xs mt-2 block">
                                                                                {itemIndex + 1}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            <textarea
                                                                                value={editForm.description ?? ""}
                                                                                onChange={(e) =>
                                                                                    setEditForm({ ...editForm, description: e.target.value })
                                                                                }
                                                                                className="input-field w-full text-[13px] py-2 px-3 resize-none min-h-[60px]"
                                                                                style={{ fieldSizing: "content" } as any}
                                                                                autoFocus
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            <textarea
                                                                                value={editForm.specifications ?? ""}
                                                                                onChange={(e) =>
                                                                                    setEditForm({ ...editForm, specifications: e.target.value })
                                                                                }
                                                                                className="input-field w-full text-[13px] py-2 px-3 resize-none min-h-[60px]"
                                                                                style={{ fieldSizing: "content" } as any}
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            <textarea
                                                                                value={editForm.remarks ?? ""}
                                                                                onChange={(e) =>
                                                                                    setEditForm({ ...editForm, remarks: e.target.value })
                                                                                }
                                                                                className="input-field w-full text-[13px] py-2 px-3 resize-none min-h-[60px]"
                                                                                style={{ fieldSizing: "content" } as any}
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center align-top">
                                                                            <div className="flex items-center justify-center gap-1.5 mt-1">
                                                                                <button
                                                                                    onClick={handleSaveEdit}
                                                                                    className="p-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors shadow-sm"
                                                                                    disabled={saving}
                                                                                    title="Save"
                                                                                >
                                                                                    <Save size={15} strokeWidth={2.5} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingId(null);
                                                                                        setEditForm({});
                                                                                    }}
                                                                                    className="p-1.5 rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors shadow-sm"
                                                                                    title="Cancel"
                                                                                >
                                                                                    <X size={15} strokeWidth={2.5} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <td className="px-3 py-2.5 text-center font-semibold text-muted text-xs align-top">
                                                                            {itemIndex + 1}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-left font-bold text-heading text-[13px] align-top whitespace-pre-wrap">
                                                                            {item.description}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-left text-body text-[13px] align-top whitespace-pre-wrap leading-relaxed">
                                                                            {item.specifications || "—"}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-left text-muted text-[13px] align-top whitespace-pre-wrap leading-relaxed">
                                                                            {item.remarks || "—"}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-center align-top">
                                                                            <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                                                                                <button
                                                                                    onClick={() => handleEdit(item)}
                                                                                    className="p-1.5 rounded-md hover:bg-primary/10 text-muted hover:text-primary transition-colors flex items-center justify-center w-7 h-7"
                                                                                    title="Edit"
                                                                                >
                                                                                    <GripVertical size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                                                                    className="p-1.5 rounded-md hover:bg-danger/10 text-muted hover:text-danger transition-colors flex items-center justify-center w-7 h-7"
                                                                                    title="Delete"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        ))}

                                                        {/* New row specifically for this section */}
                                                        {newRow?.section === section && (
                                                            <tr className="bg-primary/5 border-t border-primary/10 transition-colors relative">
                                                                <td className="px-3 py-4 text-center align-top">
                                                                    <span className="font-bold text-primary text-xs mt-1 block">
                                                                        {sectionItems.length + 1}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-3 align-top">
                                                                    <textarea
                                                                        value={newRow.description ?? ""}
                                                                        onChange={(e) =>
                                                                            setNewRow({ ...newRow, description: e.target.value })
                                                                        }
                                                                        placeholder="Enter description..."
                                                                        className="input-field w-full text-[13px] py-2 px-3 shadow-sm resize-none min-h-[60px]"
                                                                        style={{ fieldSizing: "content" } as any}
                                                                        autoFocus
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-3 align-top">
                                                                    <textarea
                                                                        value={newRow.specifications ?? ""}
                                                                        onChange={(e) =>
                                                                            setNewRow({ ...newRow, specifications: e.target.value })
                                                                        }
                                                                        placeholder="e.g. Dimensions, capacity..."
                                                                        className="input-field w-full text-[13px] py-2 px-3 shadow-sm resize-none min-h-[60px]"
                                                                        style={{ fieldSizing: "content" } as any}
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-3 align-top">
                                                                    <textarea
                                                                        value={newRow.remarks ?? ""}
                                                                        onChange={(e) =>
                                                                            setNewRow({ ...newRow, remarks: e.target.value })
                                                                        }
                                                                        placeholder="Optional notes"
                                                                        className="input-field w-full text-[13px] py-2 px-3 shadow-sm resize-none min-h-[60px]"
                                                                        style={{ fieldSizing: "content" } as any}
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-3 text-center align-top">
                                                                    <div className="flex items-center justify-center gap-1.5 mt-1">
                                                                        <button
                                                                            onClick={handleSaveNew}
                                                                            className="p-1.5 rounded-md bg-success/15 text-success hover:bg-success/25 transition-colors shadow-sm"
                                                                            disabled={saving}
                                                                            title="Save"
                                                                        >
                                                                            <Save size={15} strokeWidth={2.5} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setNewRow(null)}
                                                                            className="p-1.5 rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors shadow-sm"
                                                                            title="Cancel"
                                                                        >
                                                                            <X size={15} strokeWidth={2.5} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

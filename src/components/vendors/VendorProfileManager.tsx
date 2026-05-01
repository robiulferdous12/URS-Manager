"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Plus,
    Trash2,
    Upload,
    Building2,
    FileText,
    FileSpreadsheet,
    FileImage,
    File,
    AlertCircle,
    CheckCircle2,
    X,
    ChevronDown,
    ChevronRight,
    Loader2,
    Database,
    Sparkles,
    Edit2,
} from "lucide-react";
import { VendorProfile, VendorDocument } from "@/lib/types";

interface Props {
    projectId: string;
}

interface DocWithMeta extends VendorDocument {
    extractedTextLength?: number;
}

interface ProfileWithMeta extends VendorProfile {
    combinedTextLength?: number;
    documents?: DocWithMeta[];
}

export default function VendorProfileManager({ projectId }: Props) {
    const [profiles, setProfiles] = useState<ProfileWithMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Delete Modals
    const [vendorToDelete, setVendorToDelete] = useState<{ id: string; name: string } | null>(null);
    const [docToDelete, setDocToDelete] = useState<{ vendorId: string; docId: string; fileName: string } | null>(null);

    // Create vendor
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newVendorName, setNewVendorName] = useState("");
    const [creating, setCreating] = useState(false);

    // Edit Vendor
    const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
    const [editVendorName, setEditVendorName] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);

    // Edit Document
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editingDocVendorId, setEditingDocVendorId] = useState<string | null>(null);
    const [editDocName, setEditDocName] = useState("");
    const [savingDocEdit, setSavingDocEdit] = useState(false);

    // Upload
    const [uploadingVendorId, setUploadingVendorId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const fetchProfiles = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/vendor-profiles?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to fetch vendor profiles");
            const data = await res.json();
            setProfiles(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

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
        }, 4000);
    };

    const handleCreateVendor = async () => {
        if (!newVendorName.trim()) {
            showMessage("Vendor name is required", "error");
            return;
        }

        try {
            setCreating(true);
            const res = await fetch("/api/vendor-profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, vendorName: newVendorName.trim() }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create vendor");

            setNewVendorName("");
            setShowCreateForm(false);
            await fetchProfiles();
            showMessage(`Vendor "${data.vendorName}" created`, "success");
            setExpandedId(data.id);
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteVendor = async (id: string, name: string, confirmed: boolean = false) => {
        if (!confirmed) {
            setVendorToDelete({ id, name });
            return;
        }
        try {
            const res = await fetch(`/api/vendor-profiles/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete vendor");
            await fetchProfiles();
            showMessage(`Vendor "${name}" deleted`, "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        }
    };

    const handleSaveEditVendor = async () => {
        if (!editingVendorId || !editVendorName.trim()) return;
        try {
            setSavingEdit(true);
            const res = await fetch(`/api/vendor-profiles/${editingVendorId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vendorName: editVendorName.trim() }),
            });
            if (!res.ok) throw new Error("Failed to update vendor name");
            await fetchProfiles();
            setEditingVendorId(null);
            showMessage("Vendor name updated", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleSaveEditDoc = async () => {
        if (!editingDocId || !editingDocVendorId || !editDocName.trim()) return;
        try {
            setSavingDocEdit(true);
            const res = await fetch(`/api/vendor-profiles/${editingDocVendorId}/documents/${editingDocId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileName: editDocName.trim() }),
            });
            if (!res.ok) throw new Error("Failed to update document name");
            await fetchProfiles();
            setEditingDocId(null);
            setEditingDocVendorId(null);
            showMessage("Document name updated", "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setSavingDocEdit(false);
        }
    };

    const handleUploadFile = async (vendorId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploadingVendorId(vendorId);
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`/api/vendor-profiles/${vendorId}/documents`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            await fetchProfiles();
            showMessage(
                `"${data.fileName}" processed — ${data.extractedTextLength.toLocaleString()} chars extracted`,
                data.success ? "success" : "error"
            );
        } catch (err: any) {
            showMessage(err.message, "error");
        } finally {
            setUploadingVendorId(null);
            const ref = fileInputRefs.current[vendorId];
            if (ref) ref.value = "";
        }
    };

    const handleDeleteDocument = async (vendorId: string, docId: string, fileName: string, confirmed: boolean = false) => {
        if (!confirmed) {
            setDocToDelete({ vendorId, docId, fileName });
            return;
        }
        try {
            const res = await fetch(`/api/vendor-profiles/${vendorId}/documents/${docId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete document");
            await fetchProfiles();
            showMessage(`"${fileName}" deleted`, "success");
        } catch (err: any) {
            showMessage(err.message, "error");
        }
    };

    const getFileIcon = (fileType: string) => {
        switch (fileType) {
            case "excel":
                return <FileSpreadsheet size={15} className="text-success" />;
            case "pdf":
                return <FileText size={15} className="text-danger" />;
            case "word":
                return <FileText size={15} className="text-primary" />;
            case "image":
                return <FileImage size={15} className="text-warning" />;
            default:
                return <File size={15} className="text-muted" />;
        }
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div className="flex flex-col h-full relative">
            {/* Vendor Delete Modal */}
            {vendorToDelete && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full p-6 animate-scale-in border border-border">
                        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                            <AlertCircle className="text-danger" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-heading mb-2">Delete Vendor?</h3>
                        <p className="text-sm text-muted mb-6">
                            Are you sure you want to delete <span className="font-semibold text-heading">&quot;{vendorToDelete.name}&quot;</span>? All associated documents and AI compliance records will be permanently lost.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn-secondary py-2 px-4 font-semibold"
                                onClick={() => setVendorToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="bg-danger text-white hover:bg-danger-hover py-2 px-4 rounded-lg font-bold shadow-sm transition-colors"
                                onClick={() => {
                                    handleDeleteVendor(vendorToDelete.id, vendorToDelete.name, true);
                                    setVendorToDelete(null);
                                }}
                            >
                                Delete Vendor
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Delete Modal */}
            {docToDelete && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full p-6 animate-scale-in border border-border">
                        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                            <AlertCircle className="text-danger" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-heading mb-2">Delete Document?</h3>
                        <p className="text-sm text-muted mb-6">
                            Are you sure you want to delete <span className="font-semibold text-heading">&quot;{docToDelete.fileName}&quot;</span>? The extracted text will be removed from the vendor&apos;s knowledge base.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn-secondary py-2 px-4 font-semibold"
                                onClick={() => setDocToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="bg-danger text-white hover:bg-danger-hover py-2 px-4 rounded-lg font-bold shadow-sm transition-colors"
                                onClick={() => {
                                    handleDeleteDocument(docToDelete.vendorId, docToDelete.docId, docToDelete.fileName, true);
                                    setDocToDelete(null);
                                }}
                            >
                                Delete Document
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="btn-primary py-2 px-4 shadow-sm"
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        <span className="font-semibold">Add Vendor</span>
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-bold text-sm">
                        <Building2 size={14} />
                        <span>{profiles.length}</span>
                        <span className="opacity-80 font-semibold text-xs">
                            {profiles.length === 1 ? "VENDOR" : "VENDORS"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Create Vendor Form */}
            {showCreateForm && (
                <div className="mx-5 mt-4 p-4 bg-surface-hover border border-border rounded-xl animate-fade-in shadow-sm">
                    <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
                        <Building2 size={15} className="text-primary" />
                        New Vendor Profile
                    </h3>
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-heading mb-1.5">
                                Vendor Name <span className="text-danger">*</span>
                            </label>
                            <input
                                type="text"
                                value={newVendorName}
                                onChange={(e) => setNewVendorName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateVendor()}
                                placeholder="e.g. ABC Engineering Ltd."
                                className="input-field w-full py-2 text-xs"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={handleCreateVendor}
                            className="btn-primary py-2 px-4 text-xs"
                            disabled={creating}
                        >
                            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            {creating ? "Creating..." : "Create"}
                        </button>
                        <button
                            onClick={() => {
                                setShowCreateForm(false);
                                setNewVendorName("");
                            }}
                            className="btn-secondary py-2 px-3 text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

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

            {/* Vendor List */}
            <div className="flex-1 overflow-auto p-5 space-y-4">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 animate-shimmer rounded-xl" />
                        ))}
                    </div>
                ) : profiles.length === 0 ? (
                    <div className="empty-state-box max-w-lg mx-auto mt-8">
                        <Building2
                            size={56}
                            className="mb-5 text-muted relative z-10"
                            strokeWidth={1.5}
                        />
                        <h3 className="mb-2 text-heading text-lg font-bold relative z-10">
                            No Vendor Profiles
                        </h3>
                        <p className="text-muted text-sm max-w-xs text-center relative z-10 mb-6">
                            Create vendor profiles and upload their documentation for AI-powered
                            specification comparison.
                        </p>
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="btn-primary py-2.5 px-6 font-semibold shadow-md relative z-10"
                        >
                            <Plus size={18} strokeWidth={2.5} />
                            Add First Vendor
                        </button>
                    </div>
                ) : (
                    profiles.map((profile) => {
                        const isExpanded = expandedId === profile.id;
                        const isUploading = uploadingVendorId === profile.id;
                        const docCount = profile._count?.documents || profile.documents?.length || 0;

                        return (
                            <div
                                key={profile.id}
                                className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden animate-fade-in transition-all duration-200"
                            >
                                {/* Vendor Header */}
                                <div
                                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-surface-hover/50 transition-colors border-l-4 border-l-primary"
                                    onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <Building2
                                                size={20}
                                                className="text-primary"
                                                strokeWidth={1.5}
                                            />
                                        </div>
                                        <div>
                                            {editingVendorId === profile.id ? (
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editVendorName}
                                                        onChange={(e) => setEditVendorName(e.target.value)}
                                                        onKeyDown={(e) => e.key === "Enter" && handleSaveEditVendor()}
                                                        className="input-field py-1 px-2 text-[14px] font-bold"
                                                        autoFocus
                                                    />
                                                    <button onClick={handleSaveEditVendor} disabled={savingEdit} className="text-success hover:bg-success/10 p-1 rounded-md transition-colors shadow-sm bg-success/5" title="Save">
                                                        {savingEdit ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                                    </button>
                                                    <button onClick={() => setEditingVendorId(null)} disabled={savingEdit} className="text-danger hover:bg-danger/10 p-1 rounded-md transition-colors shadow-sm bg-danger/5" title="Cancel">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h3 className="text-[14px] font-bold text-heading">
                                                    {profile.vendorName}
                                                </h3>
                                            )}
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[11px] text-muted flex items-center gap-1">
                                                    <FileText size={11} />
                                                    {docCount} document{docCount !== 1 ? "s" : ""}
                                                </span>
                                                {(profile.combinedTextLength || 0) > 0 && (
                                                    <span className="text-[11px] text-success flex items-center gap-1">
                                                        <Database size={11} />
                                                        {((profile.combinedTextLength || 0) / 1000).toFixed(1)}k
                                                        chars indexed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        {/* Upload Button */}
                                        <input
                                            ref={(el) => { fileInputRefs.current[profile.id] = el; }}
                                            type="file"
                                            accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.bmp,.tiff"
                                            onChange={(e) => handleUploadFile(profile.id, e)}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRefs.current[profile.id]?.click()}
                                            className="btn-secondary py-1.5 px-3 text-[12px] shadow-sm"
                                            disabled={isUploading}
                                        >
                                            {isUploading ? (
                                                <Loader2 size={13} className="animate-spin text-primary" />
                                            ) : (
                                                <Upload size={13} className="text-primary" />
                                            )}
                                            <span className="font-semibold">
                                                {isUploading ? "Processing..." : "Upload"}
                                            </span>
                                        </button>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingVendorId(profile.id); setEditVendorName(profile.vendorName); }}
                                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted hover:text-primary transition-colors"
                                            title="Edit Vendor Name"
                                        >
                                            <Edit2 size={15} />
                                        </button>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteVendor(profile.id, profile.vendorName); }}
                                            className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                                            title="Delete Vendor"
                                        >
                                            <Trash2 size={15} />
                                        </button>

                                        <div className="text-muted ml-1" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : profile.id); }}>
                                            {isExpanded ? (
                                                <ChevronDown size={18} />
                                            ) : (
                                                <ChevronRight size={18} />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded: Document List */}
                                {isExpanded && (
                                    <div className="border-t border-border">
                                        {(profile.documents?.length || 0) === 0 ? (
                                            <div className="p-8 text-center">
                                                <Sparkles
                                                    size={32}
                                                    className="mx-auto mb-3 text-primary/30"
                                                />
                                                <p className="text-sm text-muted font-medium mb-1">
                                                    No documents uploaded yet
                                                </p>
                                                <p className="text-xs text-muted/70 mb-4">
                                                    Upload Excel, PDF, Word, or image files to build this
                                                    vendor&apos;s knowledge base
                                                </p>
                                                <button
                                                    onClick={() =>
                                                        fileInputRefs.current[profile.id]?.click()
                                                    }
                                                    className="btn-primary py-2 px-4 text-xs mx-auto"
                                                    disabled={isUploading}
                                                >
                                                    <Upload size={14} />
                                                    Upload Document
                                                </button>
                                            </div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-surface-hover">
                                                        <th className="boq-th text-center px-3 py-2 w-[40px]">
                                                            #
                                                        </th>
                                                        <th className="boq-th text-left px-3 py-2">
                                                            File Name
                                                        </th>
                                                        <th className="boq-th text-center px-3 py-2 w-[80px]">
                                                            Type
                                                        </th>
                                                        <th className="boq-th text-center px-3 py-2 w-[120px]">
                                                            Extracted
                                                        </th>
                                                        <th className="boq-th text-center px-3 py-2 w-[130px]">
                                                            Date
                                                        </th>
                                                        <th className="boq-th text-center px-3 py-2 w-[60px]">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {profile.documents?.map((doc, idx) => (
                                                        <tr
                                                            key={doc.id}
                                                            className="boq-row group"
                                                        >
                                                            <td className="px-3 py-2.5 text-center text-xs text-muted">
                                                                {idx + 1}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-left font-medium text-heading text-[13px] flex items-center gap-2">
                                                                {getFileIcon(doc.fileType)}
                                                                {editingDocId === doc.id ? (
                                                                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                                                        <input
                                                                            type="text"
                                                                            value={editDocName}
                                                                            onChange={(e) => setEditDocName(e.target.value)}
                                                                            onKeyDown={(e) => e.key === "Enter" && handleSaveEditDoc()}
                                                                            className="input-field py-1 px-2 text-[13px] font-medium flex-1"
                                                                            autoFocus
                                                                        />
                                                                        <button onClick={handleSaveEditDoc} disabled={savingDocEdit} className="text-success hover:bg-success/10 p-1 rounded-md transition-colors shadow-sm bg-success/5" title="Save">
                                                                            {savingDocEdit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                                        </button>
                                                                        <button onClick={() => { setEditingDocId(null); setEditingDocVendorId(null); }} disabled={savingDocEdit} className="text-danger hover:bg-danger/10 p-1 rounded-md transition-colors shadow-sm bg-danger/5" title="Cancel">
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <span className="break-words whitespace-normal flex-1" style={{ wordBreak: 'break-word' }} title={doc.fileName}>
                                                                        {doc.fileName}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className="text-[10px] font-bold uppercase bg-surface-hover px-2 py-0.5 rounded-md text-muted">
                                                                    {doc.fileType}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center text-xs">
                                                                {(doc.extractedTextLength || 0) > 0 ? (
                                                                    <span className="text-success font-semibold">
                                                                        {((doc.extractedTextLength || 0) / 1000).toFixed(1)}k
                                                                        chars
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-danger font-semibold">
                                                                        Failed
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center text-xs text-muted">
                                                                {formatDate(doc.createdAt)}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingDocId(doc.id);
                                                                            setEditingDocVendorId(profile.id);
                                                                            setEditDocName(doc.fileName);
                                                                        }}
                                                                        className="p-1.5 rounded-md hover:bg-primary/10 text-muted hover:text-primary transition-colors"
                                                                        title="Edit File Name"
                                                                    >
                                                                        <Edit2 size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDeleteDocument(
                                                                                profile.id,
                                                                                doc.id,
                                                                                doc.fileName
                                                                            );
                                                                        }}
                                                                        className="p-1.5 rounded-md hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

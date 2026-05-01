"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Project } from "@/lib/types";

interface Props {
    project: Project | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function ProjectFormModal({ project, onClose, onSaved }: Props) {
    const isEdit = !!project;
    const [form, setForm] = useState({
        name: project?.name || "",
        description: project?.description || "",
        department: project?.department || "",
        cep: project?.cep || "",
        startDate: project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
        endDate: project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
        budget: project?.budget?.toString() || "",
        status: project?.status || "Active",
        priority: project?.priority || "Medium",
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);

        const url = isEdit ? `/api/projects/${project.id}` : "/api/projects";
        const method = isEdit ? "PUT" : "POST";

        await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });

        setSaving(false);
        onSaved();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[999] flex justify-center items-center p-4 sm:p-6" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-[520px] animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                    <h2 className="text-[17px] font-semibold text-heading tracking-tight">
                        {isEdit ? "Edit Project" : "Create New Project"}
                    </h2>
                    <button
                        title="Close"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-heading transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Content */}
                    <div className="px-6 pb-2 space-y-3">
                        {/* Name */}
                    <div>
                        <label className="block text-[13px] font-medium text-heading mb-1">
                            Project Name <span className="text-danger">*</span>
                        </label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            placeholder="e.g. Electrical Correction Work"
                            className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[13px] font-medium text-heading mb-1">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            placeholder="Brief project description..."
                            rows={2}
                            className="input-field w-full resize-none py-2 px-3.5 text-[13px] rounded-xl leading-relaxed"
                            style={{ fieldSizing: "content" as any, minHeight: "60px", maxHeight: "120px" }}
                        />
                    </div>

                    {/* Details Grid: CEP & Department */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                CEP No.
                            </label>
                            <input
                                name="cep"
                                value={form.cep || ""}
                                onChange={handleChange}
                                placeholder="Enter CEP No."
                                className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                Unit
                            </label>
                            <input
                                name="department"
                                value={form.department || ""}
                                onChange={handleChange}
                                placeholder="Enter Unit Name"
                                className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                name="startDate"
                                value={form.startDate}
                                onChange={handleChange}
                                className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                name="endDate"
                                value={form.endDate}
                                onChange={handleChange}
                                className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Budget & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                Budget (৳)
                            </label>
                            <input
                                type="number"
                                name="budget"
                                value={form.budget}
                                onChange={handleChange}
                                placeholder="0"
                                className="input-field w-full py-2 px-3.5 text-[13px] rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-heading mb-1">
                                Status
                            </label>
                            <select
                                title="Status"
                                name="status"
                                value={form.status}
                                onChange={handleChange}
                                className="input-field w-full cursor-pointer py-2 px-3.5 text-[13px] rounded-xl"
                            >
                                <option value="Active">Active</option>
                                <option value="On Hold">On Hold</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="block text-[13px] font-medium text-heading mb-1">
                            Priority
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {["Low", "Medium", "High"].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setForm({ ...form, priority: p })}
                                    className={`py-2 px-3 rounded-xl text-[13px] font-medium transition-all duration-200 cursor-pointer border ${form.priority === p
                                            ? p === "High"
                                                ? "bg-danger-light border-danger text-danger"
                                                : p === "Medium"
                                                    ? "bg-warning-light border-warning text-warning"
                                                    : "bg-primary-light border-primary text-primary"
                                            : "bg-surface border-border text-muted hover:border-slate-300"
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
                        <button type="button" onClick={onClose} className="px-5 py-2 text-[13px] font-medium text-muted hover:text-heading transition-colors bg-transparent border-none cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !form.name.trim()}
                            className="bg-primary hover:bg-primary-hover text-white rounded-xl min-w-[130px] py-2 text-[13px] font-medium shadow-sm shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {saving ? "Saving..." : isEdit ? "Update Project" : "Create Project"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

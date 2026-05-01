"use client";

import Link from "next/link";
import {
    MoreVertical,
    Pencil,
    Trash2,
    FileText,
    Package,
    ArrowUpRight,
    MapPin,
    CalendarDays,
    Wallet,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Project } from "@/lib/types";

interface Props {
    project: Project;
    index: number;
    onEdit: (project: Project) => void;
    onDelete: (id: string) => void;
    isReorderMode?: boolean;
    onMoveUp?: (id: string) => void;
    onMoveDown?: (id: string) => void;
}

export default function ProjectCard({
    project,
    index,
    onEdit,
    onDelete,
    isReorderMode,
    onMoveUp,
    onMoveDown
}: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const priorityColor = project.priority === "High" ? "badge-danger" :
        project.priority === "Medium" ? "badge-warning" : "badge-primary";

    const ursCount = project._count?.ursItems || 0;
    const quotationCount = project._count?.quotations || 0;

    const statusColor = project.status === 'Active' ? 'badge-success' :
        project.status === 'Completed' ? 'badge-primary' :
            project.status === 'On Hold' ? 'badge-warning' : 'badge-danger';

    // Format dates safely
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        try {
            return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        } catch {
            return null;
        }
    };
    const dateRange = project.startDate && project.endDate 
        ? `${formatDate(project.startDate)} — ${formatDate(project.endDate)}`
        : formatDate(project.startDate) || formatDate(project.endDate);

    return (
        <div
            className="group card-hover flex flex-col animate-fade-in relative"
            style={{ "--delay": `${index * 60}ms` } as React.CSSProperties}
        >
            {/* Clickable Area */}
            <div className="p-4 flex-1">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2 mb-2.5">
                            <span className={`badge ${statusColor}`}>
                                {project.status}
                            </span>
                            <span className={`badge ${priorityColor}`}>
                                {project.priority}
                            </span>
                        </div>
                        <Link
                            href={`/projects/${project.id}`}
                            className="text-[16px] font-semibold text-heading hover:text-primary transition-colors duration-200 line-clamp-1 flex items-center gap-1.5"
                        >
                            {project.name}
                            <ArrowUpRight className="opacity-0 group-hover:opacity-100 transition-all duration-200 text-primary" size={14} strokeWidth={2} />
                        </Link>
                    </div>

                    {isAdmin && (
                        <div className="relative z-10 ml-3 shrink-0">
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="p-1 rounded-lg hover:bg-surface-hover text-muted hover:text-heading transition-all duration-200 cursor-pointer border border-transparent hover:border-border"
                                title="Project Options"
                            >
                                <MoreVertical size={16} strokeWidth={1.5} />
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute right-0 top-8 z-20 w-36 bg-surface border border-border rounded-lg py-1 shadow-xl animate-scale-in">
                                        <button
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-body hover:bg-primary-light hover:text-primary transition-colors duration-200 cursor-pointer"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onEdit(project);
                                            }}
                                        >
                                            <Pencil size={12} strokeWidth={1.5} />
                                            Edit Project
                                        </button>
                                        <button
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-danger hover:bg-danger-light transition-colors duration-200 cursor-pointer"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onDelete(project.id);
                                            }}
                                        >
                                            <Trash2 size={12} strokeWidth={1.5} />
                                            Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {project.cep && (
                    <div className="text-[11px] text-muted mb-2 font-medium">
                        {project.cep}
                    </div>
                )}

                {project.description && (
                    <p className="text-[12px] text-body mb-4 line-clamp-2 leading-relaxed">
                        {project.description}
                    </p>
                )}

                {/* Additional Info */}
                <div className="space-y-2 mb-2">
                    {project.department && (
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                            <MapPin size={12} strokeWidth={1.5} />
                            <span>{project.department}</span>
                        </div>
                    )}
                    {dateRange && (
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                            <CalendarDays size={12} strokeWidth={1.5} />
                            <span>{dateRange}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-surface-hover/50 rounded-b-[10px]">
                {/* Budget on Left */}
                <div>
                    <div className="text-[9px] font-bold tracking-wider text-muted mb-0.5 uppercase">
                        Budget
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-heading">
                        <Wallet size={13} strokeWidth={2} className="text-warning" />
                        ৳{(project.budget || 0).toLocaleString()}
                    </div>
                </div>

                {/* Counts on Right */}
                <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
                    <span className="flex items-center gap-1.5 hover:text-heading transition-colors duration-200 cursor-default" title="URS Items">
                        <FileText size={14} strokeWidth={1.5} />
                        {ursCount} URS
                    </span>
                    <span className="flex items-center gap-1.5 hover:text-heading transition-colors duration-200 cursor-default" title="Quotations">
                        <Package size={14} strokeWidth={1.5} />
                        {quotationCount} Quotes
                    </span>
                </div>
            </div>

            <Link
                href={`/projects/${project.id}`}
                className={`absolute inset-0 z-0 ${isReorderMode ? 'pointer-events-none' : ''}`}
                aria-label={project.name}
            />

            {/* Reorder Controls */}
            {isReorderMode && isAdmin && (
                <div className="absolute bottom-14 right-2 z-30 flex flex-col gap-0.5">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onMoveUp?.(project.id);
                        }}
                        className="p-1 rounded bg-surface border border-border text-muted hover:text-primary hover:border-primary transition-all duration-200 cursor-pointer shadow-sm"
                        title="Move Up"
                    >
                        <ArrowUpRight size={12} className="-rotate-45" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onMoveDown?.(project.id);
                        }}
                        className="p-1 rounded bg-surface border border-border text-muted hover:text-primary hover:border-primary transition-all duration-200 cursor-pointer shadow-sm"
                        title="Move Down"
                    >
                        <ArrowUpRight size={12} className="rotate-135" />
                    </button>
                </div>
            )}
        </div>
    );
}

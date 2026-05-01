"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    FileSpreadsheet,
    Building2,
    Sparkles,
    FolderOpen,
    Maximize2,
    Minimize2,
} from "lucide-react";
import { Project } from "@/lib/types";
import UrsBuilder from "@/components/urs/UrsBuilder";
import VendorProfileManager from "@/components/vendors/VendorProfileManager";
import ComparisonView from "@/components/comparison/ComparisonView";

export default function ProjectDetailPage() {
    const params = useParams();
    const projectId = (params?.id as string) || "";
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"urs" | "vendors" | "comparison">("urs");
    const [isMaximized, setIsMaximized] = useState(false);

    const fetchProject = useCallback(async () => {
        if (!projectId) return;
        try {
            const res = await fetch(`/api/projects/${projectId}`);
            if (!res.ok) throw new Error("Not found");
            const data = await res.json();
            setProject(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchProject();
    }, [fetchProject]);

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-16 w-full animate-shimmer" />
                <div className="h-96 w-full animate-shimmer" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-muted card border-dashed border-2 rounded-[10px]">
                <FolderOpen size={56} className="mb-5 text-border" />
                <h3 className="mb-1 text-heading">Project not found</h3>
                <Link href="/" className="text-primary hover:underline font-semibold mt-2 inline-block">
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <>
            {/* Page Header */}
            {!isMaximized && (
                <div className="mb-5 no-print animate-fade-in">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary transition-all duration-150 mb-3 group"
                    >
                        <ArrowLeft size={14} strokeWidth={2} className="group-hover:-translate-x-1 transition-transform" />
                        Back to Dashboard
                    </Link>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`badge py-0.5 px-2 text-[10px] ${project.status === 'Active' ? 'badge-success' :
                                    project.status === 'Completed' ? 'badge-primary' :
                                        project.status === 'On Hold' ? 'badge-warning' : 'badge-danger'
                                    }`}>
                                    {project.status}
                                </span>
                                <span className={`badge py-0.5 px-2 text-[10px] ${project.priority === 'High' ? 'badge-danger' :
                                    project.priority === 'Medium' ? 'badge-warning' : 'badge-primary'
                                    }`}>
                                    {project.priority}
                                </span>
                                <span className="text-[10px] font-bold text-muted bg-surface-hover px-2 py-0.5 rounded-md border border-border">
                                    ID: {projectId?.slice(-6).toUpperCase() || "..."}
                                </span>
                            </div>
                            <h1 className="text-[20px] lg:text-[24px] font-extrabold mb-1 leading-tight tracking-tight">{project.name}</h1>
                            {project.description && (
                                <p className="max-w-3xl mb-1 text-[13px] text-muted">
                                    {project.description}
                                </p>
                            )}
                            <div className="flex items-center gap-3 text-[12px] font-medium text-muted mt-1">
                                <span>{project._count?.ursItems || 0} URS Items</span>
                                <span>•</span>
                                <span>{project._count?.vendorProfiles || 0} Vendors</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className={`card rounded-[10px] overflow-hidden flex flex-col min-h-[600px] transition-all duration-300 ${isMaximized ? 'h-[calc(100vh-140px)]' : 'h-[calc(100vh-260px)]'}`}>
                {/* Tabs */}
                <div className="shrink-0 flex items-center justify-between bg-surface-hover border-b border-border no-print">
                    <div className="flex items-center gap-1 px-2">
                        {[
                            { key: "urs", label: "URS Builder", icon: FileSpreadsheet },
                            { key: "vendors", label: "Vendor Profiles", icon: Building2 },
                            { key: "comparison", label: "AI Comparison", icon: Sparkles },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as "urs" | "vendors" | "comparison")}
                                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all duration-200 cursor-pointer relative
                    ${activeTab === tab.key
                                        ? "text-primary"
                                        : "text-muted hover:text-heading"
                                    }`}
                            >
                                <tab.icon size={17} strokeWidth={1.5} />
                                {tab.label}
                                {activeTab === tab.key && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* View Maximize Toggle */}
                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        className="p-2 mr-2 text-muted hover:text-primary hover:bg-surface rounded-lg transition-all"
                        title={isMaximized ? "Restore View" : "Maximize Table View"}
                    >
                        {isMaximized ? <Minimize2 size={18} strokeWidth={2} /> : <Maximize2 size={18} strokeWidth={2} />}
                    </button>
                </div>

                {/* Tab Content - Persistence via Visibility */}
                <div className="flex-1 overflow-hidden p-0 flex flex-col relative">
                    <div className={activeTab === "urs" ? "flex-1 flex flex-col h-full" : "hidden"}>
                        <UrsBuilder projectId={projectId} />
                    </div>
                    <div className={activeTab === "vendors" ? "flex-1 flex flex-col h-full" : "hidden"}>
                        <VendorProfileManager projectId={projectId} />
                    </div>
                    <div className={activeTab === "comparison" ? "flex-1 flex flex-col h-full" : "hidden"}>
                        <ComparisonView projectId={projectId} />
                    </div>
                </div>
            </div>
        </>
    );
}


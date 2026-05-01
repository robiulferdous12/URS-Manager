"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    Boxes,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

interface Props {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: Props) {
    const pathname = usePathname();
    const [projects, setProjects] = useState<any[]>([]);
    const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await fetch("/api/projects");
                const data = await res.json();
                if (Array.isArray(data)) {
                    setProjects(data);
                }
            } catch (error) {
                console.error("Sidebar: Error fetching projects:", error);
            }
        };
        fetchProjects();
        window.addEventListener('projects-updated', fetchProjects);
        return () => window.removeEventListener('projects-updated', fetchProjects);
    }, []);

    return (
        <aside className={`no-print h-screen bg-sidebar flex flex-col shrink-0 z-30 relative transition-all duration-500 overflow-hidden ${isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-[250px] opacity-100"}`}>
            {/* Brand */}
            <div className={`h-20 flex items-center border-b border-[var(--color-sidebar-border)] px-6 gap-3.5 whitespace-nowrap`}>
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-primary/20 shadow-lg shrink-0">
                    <Boxes className="text-white" size={22} strokeWidth={2} />
                </div>
                <div>
                    <h1 className="text-lg font-bold uppercase tracking-[0.2em] text-heading leading-tight">
                        URS
                    </h1>
                    <p className="text-lg font-bold uppercase tracking-[0.2em] text-primary -mt-2">
                        Manager
                    </p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto no-scrollbar scroll-smooth">
                <div className="text-[11px] font-semibold text-sidebar-text uppercase tracking-wider px-3 mb-3">
                    Management
                </div>

                {/* Projects Section */}
                <div>
                    <button
                        onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
                        className={`w-full group flex items-center gap-3 px-3 py-3 rounded-xl text-base font-semibold transition-all duration-150
                            ${pathname === "/" || pathname.startsWith("/projects/")
                                ? "text-primary"
                                : "text-sidebar-text hover:bg-sidebar-hover hover:text-heading"
                            }`}
                    >
                        <LayoutDashboard
                            className={`shrink-0 transition-colors duration-150 ${pathname === "/" || pathname.startsWith("/projects/") ? "text-primary" : "text-sidebar-text/60 group-hover:text-primary/80"}`}
                            size={20}
                            strokeWidth={2}
                        />
                        <span>Projects</span>
                        <div className="ml-auto flex items-center gap-2">
                            {isProjectsExpanded ? (
                                <ChevronDown size={16} className="opacity-40" />
                            ) : (
                                <ChevronRight size={16} className="opacity-40" />
                            )}
                        </div>
                    </button>

                    {/* Sub-menu: Project List */}
                    {isProjectsExpanded && (
                        <div className="mt-1 ml-4 pl-4 border-l border-[var(--color-sidebar-border)] space-y-1">
                            <Link
                                href="/"
                                className={`block px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150
                                    ${pathname === "/"
                                        ? "bg-primary/10 text-primary border-l-2 border-primary -ml-[17px] pl-[15px] rounded-l-none"
                                        : "text-sidebar-text hover:text-heading hover:bg-sidebar-hover"
                                    }`}
                            >
                                Dashboard
                            </Link>
                            {projects.map((project) => {
                                const isProjectActive = pathname === `/projects/${project.id}`;
                                return (
                                    <Link
                                        key={project.id}
                                        href={`/projects/${project.id}`}
                                        className={`block px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 truncate
                                            ${isProjectActive
                                                ? "bg-primary/10 text-primary border-l-2 border-primary -ml-[17px] pl-[15px] rounded-l-none"
                                                : "text-sidebar-text hover:text-heading hover:bg-sidebar-hover"
                                            }`}
                                        title={project.name}
                                    >
                                        {project.name}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>
            {/* Attribution & Version */}
            <div className="px-4 py-3 mt-auto border-t border-[var(--color-sidebar-border)] flex flex-col items-center gap-1">
                <p className="text-[9px] font-bold text-primary/60 normal-case tracking-[.1em] text-center">
                    Developed by <span className="text-primary font-bold opacity-100">Robiul Ferdous</span>
                </p>
                <p className="text-[9px] font-bold text-primary/80 normal-case tracking-[0.1em] text-center">
                    Version 1.0.0
                </p>
            </div>
        </aside>
    );
}

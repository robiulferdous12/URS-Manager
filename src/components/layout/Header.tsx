"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, LogOut, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function Header({ isCollapsed, onToggle }: Props) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();

    // Build breadcrumbs from pathname
    const breadcrumbs = React.useMemo(() => {
        const segments = pathname.split("/").filter(Boolean);
        const crumbs: { label: string; href: string }[] = [
            { label: "Projects", href: "/" },
        ];

        if (segments[0] === "projects" && segments[1]) {
            crumbs.push({
                label: "Project Details",
                href: `/projects/${segments[1]}`,
            });
        }

        if (segments[0] === "settings") {
            crumbs[0] = { label: "Settings", href: "/settings" };
        }

        return crumbs;
    }, [pathname]);

    return (
        <header className="h-14 border-b border-border bg-surface sticky top-0 z-20 flex items-center justify-between px-6 no-print">
            <div className="flex items-center gap-4">
                {/* Sidebar Toggle */}
                <button
                    onClick={onToggle}
                    className="p-2 text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-ring group"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    <Menu size={20} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
                </button>

                {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-base">
                {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.href}>
                        {i > 0 && (
                            <ChevronRight size={14} className="text-border" />
                        )}
                        {i === breadcrumbs.length - 1 ? (
                            <span className="font-semibold text-heading">
                                {crumb.label}
                            </span>
                        ) : (
                            <Link
                                href={crumb.href}
                                className="text-muted hover:text-primary transition-colors duration-200 font-medium"
                            >
                                {crumb.label}
                            </Link>
                        )}
                    </React.Fragment>
                ))}
            </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">


                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 text-muted hover:text-heading hover:bg-surface-hover rounded-lg transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-ring"
                    title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {isDark ? (
                        <Sun size={18} strokeWidth={1.8} className="text-warning" />
                    ) : (
                        <Moon size={18} strokeWidth={1.8} />
                    )}
                </button>

                {/* Vertical Divider */}
                <div className="w-px h-6 bg-border mx-2" />

                {/* User Profile & Sign Out */}
                <div className="flex items-center gap-4 pl-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shadow-sm shrink-0">
                            {user?.username?.[0].toUpperCase() || "R"}
                        </div>
                        <div className="hidden md:flex flex-col">
                            <p className="text-[13px] font-semibold text-heading leading-none mb-1">
                                {user?.username || "Guest"}
                            </p>
                            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.1em] opacity-70">
                                {user?.role || "USER"}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={logout}
                        title="Sign Out"
                        className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger-ring shrink-0"
                    >
                        <LogOut size={18} strokeWidth={2} />
                    </button>
                </div>
            </div>
        </header>
    );
}

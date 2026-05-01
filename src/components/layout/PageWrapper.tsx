"use client";

import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, useEffect } from "react";

export default function PageWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { loading, user } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Persist sidebar state
    useEffect(() => {
        const saved = localStorage.getItem("sidebar-collapsed");
        if (saved !== null) {
            setIsCollapsed(saved === "true");
        }
    }, []);

    const toggleSidebar = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem("sidebar-collapsed", newState.toString());
    };
    const isLoginPage = pathname === "/login";

    // Login page — render directly, no shell
    if (isLoginPage) {
        return <>{children}</>;
    }

    // Still checking auth — show a simple static background (no spinner to avoid flicker)
    if (loading || !user) {
        return <div className="min-h-screen bg-background" />;
    }

    // Authenticated — render dashboard shell
    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar isCollapsed={isCollapsed} onToggle={toggleSidebar} />
            <div className={`flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-500`}>
                <Header isCollapsed={isCollapsed} onToggle={toggleSidebar} />
                <main className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth relative bg-background">
                    <div className="w-full px-6 lg:px-8 py-6 animate-fade-in">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

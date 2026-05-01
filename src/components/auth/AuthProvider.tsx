"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    const didCheck = useRef(false);

    // Check session once on mount
    useEffect(() => {
        if (didCheck.current) return;
        didCheck.current = true;

        fetch("/api/auth/me")
            .then((res) => {
                if (!res.ok) throw new Error("No session");
                return res.json();
            })
            .then((data) => setUser(data.user))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    // Redirect logic — only runs after initial check is done
    useEffect(() => {
        if (loading) return;
        if (!user && pathname !== "/login") {
            router.replace("/login");
        }
    }, [user, loading, pathname, router]);

    const login = async (username: string, password: string) => {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (data.success) {
            setUser(data.user);
            // Don't push here — the useEffect redirect will handle it
            // or the login page component will navigate
        } else {
            throw new Error(data.error || "Login failed");
        }
    };

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        // The useEffect will redirect to /login
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

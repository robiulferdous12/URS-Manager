"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { HardHat, User, Lock, Loader2, UserPlus, BarChart3 } from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const resetForm = () => {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setError("");
        setSuccess("");
    };

    const toggleMode = () => {
        resetForm();
        setIsRegisterMode(!isRegisterMode);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setIsSubmitting(true);

        try {
            if (isRegisterMode) {
                if (password !== confirmPassword) {
                    setError("Passwords do not match");
                    setIsSubmitting(false);
                    return;
                }

                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                });

                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || "Registration failed");
                    setIsSubmitting(false);
                    return;
                }

                setSuccess("Account created! Signing you in...");
                await login(username, password);
                router.push("/");
            } else {
                await login(username, password);
                router.push("/");
            }
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-main p-4 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
                <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-purple-500/3 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2.5 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-blue-400 flex items-center justify-center shadow-lg shadow-accent/20">
                        <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold text-text-primary tracking-tight">URS Management</span>
                </div>

                {/* Card */}
                <div className="glass-card rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
                    <div className="p-8">
                        <div className="flex flex-col items-center mb-8">
                            <h1 className="text-xl font-bold text-text-primary mb-1">
                                {isRegisterMode ? "Create Account" : "Welcome Back"}
                            </h1>
                            <p className="text-text-muted text-sm">
                                {isRegisterMode
                                    ? "Register a new account"
                                    : "Sign in to continue"}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 ml-1">
                                    Username
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your username"
                                        className="w-full pl-11 pr-4 py-3 bg-bg-input border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 ml-1">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={isRegisterMode ? "Min 6 characters" : "Enter your password"}
                                        className="w-full pl-11 pr-4 py-3 bg-bg-input border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                                        required
                                    />
                                </div>
                            </div>

                            {isRegisterMode && (
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 ml-1">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Re-enter your password"
                                            className="w-full pl-11 pr-4 py-3 bg-bg-input border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-medium">
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-success text-xs font-medium">
                                    {success}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3.5 bg-gradient-to-r from-accent to-blue-500 hover:from-accent-hover hover:to-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : isRegisterMode ? (
                                    "Create Account"
                                ) : (
                                    "Sign In"
                                )}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <button
                                onClick={toggleMode}
                                className="text-xs text-accent hover:text-accent-hover font-semibold transition-colors cursor-pointer"
                            >
                                {isRegisterMode
                                    ? "Already have an account? Sign In"
                                    : "Don't have an account? Register"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-text-muted text-[10px] mt-6 uppercase tracking-widest font-medium">
                    Anti Gravity • URS Management
                </p>
            </div>
        </div>
    );
}

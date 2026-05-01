import { cookies } from "next/headers";

export interface UserSession {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
}

export async function getSession(): Promise<UserSession | null> {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");
    if (!session?.value) return null;

    try {
        return JSON.parse(session.value) as UserSession;
    } catch (e) {
        return null;
    }
}

export async function setSession(user: UserSession) {
    const cookieStore = await cookies();
    cookieStore.set("session", JSON.stringify(user), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
    });
}

export async function clearSession() {
    const cookieStore = await cookies();
    cookieStore.delete("session");
}

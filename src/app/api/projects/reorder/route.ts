import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { projectIds } = await req.json();

        if (!Array.isArray(projectIds)) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        // Update each project's order in a transaction
        await prisma.$transaction(
            projectIds.map((id, index) =>
                prisma.project.update({
                    where: { id },
                    data: { order: index },
                })
            )
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Reorder projects error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

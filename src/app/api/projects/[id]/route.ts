import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        ursItems: true,
                        quotations: true,
                        vendorProfiles: true,
                    },
                },
            },
        });
        if (!project) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(project);
    } catch (error) {
        console.error("Fetch project error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const project = await prisma.project.update({
        where: { id },
        data: {
            name: body.name,
            description: body.description ?? undefined,
            department: body.department ?? undefined,
            cep: body.cep ?? undefined,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
            budget: body.budget !== undefined ? parseFloat(body.budget) : undefined,
            status: body.status ?? undefined,
            priority: body.priority ?? undefined,
        },
    });
    return NextResponse.json(project);
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;
        await prisma.project.delete({
            where: { id },
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete project error:", error);
        return NextResponse.json({ error: "Failed to delete project." }, { status: 500 });
    }
}

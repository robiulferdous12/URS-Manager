import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            orderBy: [{ order: "asc" }, { createdAt: "desc" }],
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
        return NextResponse.json(projects);
    } catch (error) {
        console.error("Fetch projects error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // Get the highest order to set the new project at the end
    const lastProject = await prisma.project.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
    });
    const nextOrder = (lastProject?.order ?? -1) + 1;

    const project = await prisma.project.create({
        data: {
            name: body.name,
            description: body.description || null,
            department: body.department || null,
            cep: body.cep || null,
            startDate: body.startDate ? new Date(body.startDate) : null,
            endDate: body.endDate ? new Date(body.endDate) : null,
            budget: body.budget ? parseFloat(body.budget) : 0,
            status: body.status || "Active",
            priority: body.priority || "Medium",
            order: nextOrder,
        },
    });
    return NextResponse.json(project, { status: 201 });
}

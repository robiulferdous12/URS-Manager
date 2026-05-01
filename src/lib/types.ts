// Shared types for the URS Management application

export interface Project {
    id: string;
    name: string;
    description: string | null;
    department: string | null;
    cep: string | null;
    startDate: string | null;
    endDate: string | null;
    budget: number;
    status: string;
    priority: string;
    order: number;
    createdAt: string;
    updatedAt: string;
    ursItems?: UrsItem[];
    quotations?: Quotation[];
    vendorProfiles?: VendorProfile[];
    _count?: {
        ursItems: number;
        quotations: number;
        vendorProfiles: number;
    };
}

export interface UrsItem {
    id: string;
    projectId: string;
    section?: string | null;
    slNo: number;
    description: string;
    specifications?: string | null;
    unit: string | null;
    quantity: number;
    remarks: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Quotation {
    id: string;
    projectId: string;
    vendorName: string;
    uploadedAt: string;
    items: QuotationItem[];
}

export interface QuotationItem {
    id: string;
    quotationId: string;
    ursItemId: string | null;
    description: string;
    unit: string | null;
    quantity: number;
    unitRate: number;
    totalPrice: number;
    remarks: string | null;
}

// ──────────────────────────────────────────────
// Vendor Profiles & AI Comparison
// ──────────────────────────────────────────────

export interface VendorProfile {
    id: string;
    projectId: string;
    vendorName: string;
    combinedText: string | null;
    createdAt: string;
    updatedAt: string;
    documents?: VendorDocument[];
    results?: ComparisonResult[];
    _count?: {
        documents: number;
        results: number;
    };
}

export interface VendorDocument {
    id: string;
    vendorProfileId: string;
    fileName: string;
    fileType: string;
    fileUrl: string | null;
    extractedText: string | null;
    createdAt: string;
}

export interface ComparisonResult {
    id: string;
    projectId: string;
    vendorProfileId: string;
    ursItemId: string;
    vendorProposedSpec: string | null;
    status: "Meets" | "Does Not Meet" | "Not Mentioned" | "Partial";
    remarks: string | null;
    createdAt: string;
}


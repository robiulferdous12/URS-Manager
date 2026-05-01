"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, FolderOpen, BarChart3, Activity, FileText, Move, Check, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Project } from "@/lib/types";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectFormModal from "@/components/dashboard/ProjectFormModal";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/projects");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch projects");
      }
      const data = await res.json();
      setProjects(data);
    } catch (err: any) {
      console.error("Failed to fetch projects:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project and all associated data?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    fetchProjects();
    window.dispatchEvent(new Event('projects-updated'));
  };

  const handleEdit = (project: Project) => {
    setEditProject(project);
    setShowModal(true);
  };

  const handleMoveUp = (id: string) => {
    const idx = projects.findIndex(p => p.id === id);
    if (idx <= 0) return;
    const newProjects = [...projects];
    [newProjects[idx - 1], newProjects[idx]] = [newProjects[idx], newProjects[idx - 1]];
    setProjects(newProjects);
  };

  const handleMoveDown = (id: string) => {
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1 || idx >= projects.length - 1) return;
    const newProjects = [...projects];
    [newProjects[idx], newProjects[idx + 1]] = [newProjects[idx + 1], newProjects[idx]];
    setProjects(newProjects);
  };

  const handleSaveOrder = async () => {
    try {
      setSavingOrder(true);
      const projectIds = projects.map(p => p.id);
      const res = await fetch("/api/projects/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds }),
      });
      if (!res.ok) throw new Error("Failed to save reorder");
      setIsReorderMode(false);
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingOrder(false);
    }
  };

  const totalUrsItems = projects.reduce((s, p) => s + (p._count?.ursItems || 0), 0);
  const activeCount = projects.filter((p) => p.status === "Active").length;

  const stats = [
    {
      label: "Total Projects",
      value: projects.length,
      icon: BarChart3,
      accent: "border-l-blue-500",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      valueColor: "text-blue-600",
    },
    {
      label: "Active",
      value: activeCount,
      icon: Activity,
      accent: "border-l-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
      valueColor: "text-emerald-600",
    },
    {
      label: "Total URS Items",
      value: totalUrsItems,
      icon: FileText,
      accent: "border-l-amber-500",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      valueColor: "text-amber-600",
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1>URS Dashboard</h1>
          <p className="text-muted mt-1">
            Manage user requirement specifications and compare vendor quotations.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditProject(null);
              setShowModal(true);
            }}
            className="btn-primary shrink-0"
          >
            <Plus size={18} strokeWidth={2} />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`bg-surface border border-border ${stat.accent} border-l-[3px] rounded-xl shadow-sm p-5 relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
            style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                {stat.label}
              </p>
              <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon size={18} className={stat.iconColor} strokeWidth={1.8} />
              </div>
            </div>
            <h2 className={`text-[24px] font-bold ${stat.valueColor} leading-none`}>{stat.value}</h2>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} strokeWidth={1.5} />
          <input
            type="text"
            placeholder={isReorderMode ? "Search disabled during reordering..." : "Search by name or description..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={isReorderMode}
            className="input-field w-full pl-11 focus:shadow-md disabled:bg-surface-hover/50 disabled:cursor-not-allowed"
          />
        </div>

        {isAdmin && projects.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isReorderMode ? (
              <>
                <button
                  onClick={() => {
                    setIsReorderMode(false);
                    fetchProjects(); // Reset to original order
                  }}
                  className="btn-secondary p-2"
                  disabled={savingOrder}
                  title="Cancel Reorder"
                >
                  <X size={16} strokeWidth={2} />
                </button>
                <button
                  onClick={handleSaveOrder}
                  className="btn-primary p-2"
                  disabled={savingOrder}
                  title="Save Order"
                >
                  {savingOrder ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check size={16} strokeWidth={2} />
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setSearch(""); // Clear search to show all projects for reordering
                  setIsReorderMode(true);
                }}
                className="btn-secondary p-2"
                title="Reorder Projects"
              >
                <Move size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {error && (
        <div className="mb-6 p-4 bg-danger-light border border-danger/20 rounded-[10px] text-danger text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <Activity size={18} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 animate-shimmer rounded-[10px]" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted card border-dashed border-2">
          <FolderOpen size={56} className="mb-5 text-border" />
          <h3 className="mb-1 text-heading">No results found</h3>
          <p className="max-w-xs text-center text-muted">
            {search
              ? "We couldn't find any projects matching your search criteria."
              : "Your project list is currently empty. Get started by creating a new project."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={i}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isReorderMode={isReorderMode && !search}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ProjectFormModal
          project={editProject}
          onClose={() => {
            setShowModal(false);
            setEditProject(null);
          }}
          onSaved={() => {
            fetchProjects();
            window.dispatchEvent(new Event('projects-updated'));
          }}
        />
      )}
    </>
  );
}

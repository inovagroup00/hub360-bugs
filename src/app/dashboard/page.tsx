"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { BugDrawer } from "@/components/BugDrawer";
import { getSession, getUser, logout, authHeaders } from "@/lib/auth";
import { formatRelativeDate } from "@/lib/utils";
import {
  STATUS_CONFIG,
  SEVERITY_CONFIG,
  type Bug,
  type Project,
  type TeamMember,
  type BugStatus,
  type Severity,
} from "@/types";

export default function DashboardPage() {
  const router = useRouter();

  const [bugs, setBugs] = useState<Bug[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Filters
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  // Drawer
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push("/login");
    }
  }, [router]);

  // Load projects and team members
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    };

    fetch(`${supabaseUrl}/rest/v1/projects?select=*&order=name`, { headers })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setProjects(data); })
      .catch(() => {});

    fetch(
      `${supabaseUrl}/rest/v1/team_members?select=*&is_active=eq.true&order=name`,
      { headers }
    )
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTeamMembers(data); })
      .catch(() => {});
  }, []);

  const fetchBugs = useCallback(async () => {
    const session = getSession();
    if (!session) return;

    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("page_size", "30");
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    if (filterProject) params.set("project_id", filterProject);
    if (filterStatus) params.set("status", filterStatus);
    if (filterSeverity) params.set("severity", filterSeverity);
    if (filterAssigned) params.set("assigned_to", filterAssigned);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/bugs?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setBugs(data.bugs);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      }
    } catch {}

    setLoading(false);
  }, [
    page,
    sortBy,
    sortDir,
    filterProject,
    filterStatus,
    filterSeverity,
    filterAssigned,
    search,
  ]);

  useEffect(() => {
    fetchBugs();
  }, [fetchBugs]);

  // Search with debounce
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const user = getUser();

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  };

  const statusCounts = bugs.reduce(
    (acc, bug) => {
      acc[bug.status] = (acc[bug.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Hub 360</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Bug Tracker</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {user?.team_member?.name || user?.email}
            </span>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] || 0;
            const isActive = filterStatus === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setFilterStatus(isActive ? "" : key);
                  setPage(1);
                }}
                className={`text-left px-4 py-3 rounded-xl border transition-all ${
                  isActive
                    ? `${cfg.bgColor} ${cfg.color} border-current`
                    : "bg-white border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="text-2xl font-bold">{count}</div>
                <div className={`text-xs ${isActive ? cfg.color : "text-gray-500"}`}>
                  {cfg.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por titulo..."
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
            />
          </div>

          <select
            value={filterProject}
            onChange={(e) => {
              setFilterProject(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={filterSeverity}
            onChange={(e) => {
              setFilterSeverity(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todas as gravidades</option>
            {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>

          <select
            value={filterAssigned}
            onChange={(e) => {
              setFilterAssigned(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos os responsaveis</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {(filterProject ||
            filterStatus ||
            filterSeverity ||
            filterAssigned ||
            search) && (
            <button
              onClick={() => {
                setFilterProject("");
                setFilterStatus("");
                setFilterSeverity("");
                setFilterAssigned("");
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th
                    onClick={() => toggleSort("number")}
                    active={sortBy === "number"}
                    dir={sortDir}
                  >
                    #
                  </Th>
                  <Th
                    onClick={() => toggleSort("status")}
                    active={sortBy === "status"}
                    dir={sortDir}
                  >
                    Status
                  </Th>
                  <Th
                    onClick={() => toggleSort("severity")}
                    active={sortBy === "severity"}
                    dir={sortDir}
                  >
                    Gravidade
                  </Th>
                  <Th
                    onClick={() => toggleSort("title")}
                    active={sortBy === "title"}
                    dir={sortDir}
                    className="w-full"
                  >
                    Titulo
                  </Th>
                  <Th>Projeto</Th>
                  <Th>Responsavel</Th>
                  <Th
                    onClick={() => toggleSort("created_at")}
                    active={sortBy === "created_at"}
                    dir={sortDir}
                  >
                    Data
                  </Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : bugs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-16 text-center text-gray-400 text-sm"
                    >
                      {search || filterProject || filterStatus || filterSeverity
                        ? "Nenhum bug encontrado com esses filtros"
                        : "Nenhum bug reportado ainda"}
                    </td>
                  </tr>
                ) : (
                  bugs.map((bug) => (
                    <tr
                      key={bug.id}
                      onClick={() => setSelectedBugId(bug.id)}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-400 whitespace-nowrap">
                        {bug.number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={bug.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SeverityBadge severity={bug.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 font-medium line-clamp-1">
                          {bug.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                          {bug.project?.name || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {bug.assignee?.name || (
                            <span className="text-gray-300">-</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {formatRelativeDate(bug.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                {total} bug{total !== 1 ? "s" : ""} no total
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  Proximo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bug detail drawer */}
      <BugDrawer
        bugId={selectedBugId}
        teamMembers={teamMembers}
        onClose={() => setSelectedBugId(null)}
        onUpdate={fetchBugs}
      />
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: string;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${onClick ? "cursor-pointer hover:text-gray-700 select-none" : ""} ${className}`}
      onClick={onClick}
    >
      <span className="flex items-center gap-1">
        {children}
        {active && (
          <span className="text-gray-400">
            {dir === "asc" ? "\u2191" : "\u2193"}
          </span>
        )}
      </span>
    </th>
  );
}

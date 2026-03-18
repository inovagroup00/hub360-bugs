"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, getUser, logout, authHeaders } from "@/lib/auth";
import {
  STATUS_CONFIG,
  SEVERITY_CONFIG,
  type BugStatus,
  type Severity,
} from "@/types";

// ─── Types ───────────────────────────────────────────────────
interface ReportData {
  total_bugs: number;
  period_bugs: number;
  avg_resolution_hours: number;
  open_bugs: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_project: { name: string; count: number }[];
  weekly_trend: { week: string; created: number; resolved: number }[];
  resolved_bugs: ResolvedBug[];
  projects: { id: string; name: string }[];
  team_members: { id: string; name: string }[];
  date_from: string;
  date_to: string;
}

interface ResolvedBug {
  id: string;
  number: number;
  title: string;
  severity: string;
  project_name: string;
  assigned_to_name: string;
  created_at: string;
  resolved_at: string;
  resolution_hours: number;
}

// ─── Color helpers ───────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  analyzing: "#eab308",
  fixing: "#f97316",
  awaiting_validation: "#a855f7",
  resolved: "#22c55e",
  closed: "#6b7280",
  reopened: "#ef4444",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
};

const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f97316", "#a855f7",
  "#ef4444", "#06b6d4", "#eab308", "#ec4899",
  "#6b7280", "#14b8a6",
];

// ─── SVG Chart Components ────────────────────────────────────

function DonutChart({
  data,
  colorMap,
  labelMap,
}: {
  data: Record<string, number>;
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Nenhum dado
      </div>
    );
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {entries.map(([key, value]) => {
          const pct = value / total;
          const dashLen = pct * circumference;
          const dashOffset = -offset * circumference;
          offset += pct;
          return (
            <circle
              key={key}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={colorMap[key] || "#6b7280"}
              strokeWidth="24"
              strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text x="80" y="76" textAnchor="middle" className="text-2xl font-bold" fill="#111827" fontSize="24" fontWeight="700">
          {total}
        </text>
        <text x="80" y="96" textAnchor="middle" fill="#9ca3af" fontSize="11">
          total
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: colorMap[key] || "#6b7280" }}
            />
            {labelMap[key] || key} ({value})
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBarChart({
  data,
  colorMap,
  labelMap,
}: {
  data: Record<string, number> | { name: string; count: number }[];
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
}) {
  const entries: { key: string; label: string; value: number; color: string }[] = [];

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      entries.push({
        key: item.name,
        label: item.name,
        value: item.count,
        color: CHART_COLORS[i % CHART_COLORS.length],
      });
    });
  } else {
    Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .forEach(([key, value]) => {
        entries.push({
          key,
          label: labelMap?.[key] || key,
          value,
          color: colorMap?.[key] || "#6b7280",
        });
      });
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Nenhum dado
      </div>
    );
  }

  const maxVal = Math.max(...entries.map((e) => e.value));

  return (
    <div className="space-y-2.5">
      {entries.map((e) => (
        <div key={e.key} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 truncate text-right flex-shrink-0">
            {e.label}
          </span>
          <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden relative">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{
                width: `${maxVal > 0 ? (e.value / maxVal) * 100 : 0}%`,
                backgroundColor: e.color,
                minWidth: e.value > 0 ? "8px" : "0",
              }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8 text-right flex-shrink-0">
            {e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LineChart({
  data,
}: {
  data: { week: string; created: number; resolved: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Nenhum dado
      </div>
    );
  }

  const allVals = data.flatMap((d) => [d.created, d.resolved]);
  const maxVal = Math.max(...allVals, 1);

  const width = 480;
  const height = 200;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW / 2;

  const toX = (i: number) => padLeft + i * xStep;
  const toY = (v: number) => padTop + chartH - (v / maxVal) * chartH;

  const createdPoints = data.map((d, i) => `${toX(i)},${toY(d.created)}`).join(" ");
  const resolvedPoints = data.map((d, i) => `${toX(i)},${toY(d.resolved)}`).join(" ");

  // Grid lines
  const gridLines = 4;
  const gridStep = maxVal / gridLines;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Grid */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const val = Math.round(i * gridStep);
          const y = toY(val);
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#f3f4f6" strokeWidth="1" />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" fill="#9ca3af" fontSize="10">
                {val}
              </text>
            </g>
          );
        })}

        {/* Created line */}
        <polyline
          points={createdPoints}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle key={`c-${i}`} cx={toX(i)} cy={toY(d.created)} r="3.5" fill="#3b82f6" />
        ))}

        {/* Resolved line */}
        <polyline
          points={resolvedPoints}
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle key={`r-${i}`} cx={toX(i)} cy={toY(d.resolved)} r="3.5" fill="#22c55e" />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const label = formatWeekLabel(d.week);
          return (
            <text
              key={i}
              x={toX(i)}
              y={height - 8}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-6 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />
          Criados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-green-500 inline-block rounded" />
          Resolvidos
        </span>
      </div>
    </div>
  );
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTimeBR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

// ─── Loading skeleton ────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>
      <div className="px-6 py-6 space-y-6">
        <div className="h-10 w-96 bg-gray-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-72 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [preset, setPreset] = useState("90d");
  const [projectId, setProjectId] = useState("");
  const [teamMemberId, setTeamMemberId] = useState("");

  // Auth check
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push("/login");
    }
  }, [router]);

  const getDateRange = useCallback((): { from: string; to: string } => {
    const now = new Date();
    const to = now.toISOString().split("T")[0];
    let daysBack = 90;
    switch (preset) {
      case "7d": daysBack = 7; break;
      case "30d": daysBack = 30; break;
      case "90d": daysBack = 90; break;
      case "1y": daysBack = 365; break;
    }
    const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    return { from: fromDate.toISOString().split("T")[0], to };
  }, [preset]);

  const fetchReport = useCallback(async () => {
    const session = getSession();
    if (!session) return;

    setLoading(true);
    setError(null);

    const { from, to } = getDateRange();
    const params = new URLSearchParams();
    params.set("date_from", from);
    params.set("date_to", to);
    if (projectId) params.set("project_id", projectId);
    if (teamMemberId) params.set("team_member_id", teamMemberId);

    try {
      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        setError(err.error?.message || "Erro ao carregar relatorio");
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
    } catch {
      setError("Erro de conexao. Tente novamente.");
    }

    setLoading(false);
  }, [getDateRange, projectId, teamMemberId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const user = getUser();

  if (loading && !data) return <Skeleton />;

  const statusLabelMap: Record<string, string> = {};
  const severityLabelMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(STATUS_CONFIG)) statusLabelMap[k] = v.label;
  for (const [k, v] of Object.entries(SEVERITY_CONFIG)) severityLabelMap[k] = v.label;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Hub 360</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Relatorios</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {user?.team_member?.name || user?.email}
            </span>
            <a
              href="/dashboard"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Dashboard
            </a>
            <button
              onClick={() => window.print()}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Imprimir
            </button>
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
        {/* Page title for print */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold text-gray-900">Hub 360 - Relatorio Gerencial</h1>
          <p className="text-sm text-gray-500">
            Periodo: {data ? formatDateBR(data.date_from) : ""} a {data ? formatDateBR(data.date_to) : ""}
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <span className="text-sm font-medium text-gray-700">Periodo:</span>
          {[
            { key: "7d", label: "7 dias" },
            { key: "30d", label: "30 dias" },
            { key: "90d", label: "90 dias" },
            { key: "1y", label: "1 ano" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                preset === p.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}

          <span className="text-gray-300 mx-1">|</span>

          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos os projetos</option>
            {(data?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={teamMemberId}
            onChange={(e) => setTeamMemberId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos os membros</option>
            {(data?.team_members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {(projectId || teamMemberId || preset !== "90d") && (
            <button
              onClick={() => {
                setPreset("90d");
                setProjectId("");
                setTeamMemberId("");
              }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Limpar filtros
            </button>
          )}

          {loading && (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          )}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard
                label="Total de bugs"
                value={data.total_bugs.toString()}
                subtitle="todos os tempos"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                }
              />
              <MetricCard
                label="Bugs no periodo"
                value={data.period_bugs.toString()}
                subtitle={`${formatDateBR(data.date_from)} - ${formatDateBR(data.date_to)}`}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
              />
              <MetricCard
                label="Tempo medio resolucao"
                value={data.avg_resolution_hours > 0 ? formatHours(data.avg_resolution_hours) : "-"}
                subtitle={data.avg_resolution_hours > 0 ? `${Math.round(data.avg_resolution_hours * 10) / 10} horas` : "sem dados"}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <MetricCard
                label="Bugs abertos"
                value={data.open_bugs.toString()}
                subtitle="pendentes de resolucao"
                accent={data.open_bugs > 0}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <ChartCard title="Bugs por Status">
                <DonutChart
                  data={data.by_status}
                  colorMap={STATUS_COLORS}
                  labelMap={statusLabelMap}
                />
              </ChartCard>

              <ChartCard title="Bugs por Gravidade">
                <HorizontalBarChart
                  data={data.by_severity}
                  colorMap={SEVERITY_COLORS}
                  labelMap={severityLabelMap}
                />
              </ChartCard>

              <ChartCard title="Tendencia Semanal">
                <LineChart data={data.weekly_trend} />
              </ChartCard>

              <ChartCard title="Bugs por Projeto">
                <HorizontalBarChart data={data.by_project} />
              </ChartCard>
            </div>

            {/* Resolved bugs table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  Bugs Resolvidos no Periodo
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.resolved_bugs.length} bug{data.resolved_bugs.length !== 1 ? "s" : ""} resolvido{data.resolved_bugs.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-full">Titulo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projeto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gravidade</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resolvido por</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resolvido em</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.resolved_bugs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">
                          Nenhum bug resolvido neste periodo
                        </td>
                      </tr>
                    ) : (
                      data.resolved_bugs.map((bug) => (
                        <tr key={bug.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-gray-400 whitespace-nowrap">
                            {bug.number}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 font-medium line-clamp-1">
                              {bug.title}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                              {bug.project_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <SeverityInline severity={bug.severity} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {bug.assigned_to_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                            {formatDateTimeBR(bug.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                            {formatDateTimeBR(bug.resolved_at)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                            {formatHours(bug.resolution_hours)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small helper components ─────────────────────────────────

function MetricCard({
  label,
  value,
  subtitle,
  accent,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className={`px-5 py-4 rounded-xl border transition-all ${
      accent ? "bg-orange-50 border-orange-200" : "bg-white border-gray-100"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-3xl font-bold ${accent ? "text-orange-700" : "text-gray-900"}`}>
            {value}
          </div>
          <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
        </div>
        <div className={`p-2 rounded-lg ${accent ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-400"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function SeverityInline({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity as Severity];
  if (!cfg) return <span className="text-xs text-gray-400">{severity}</span>;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${cfg.bgColor} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

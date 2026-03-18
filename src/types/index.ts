export type Severity = "critical" | "high" | "medium" | "low";

export type BugStatus =
  | "new"
  | "analyzing"
  | "fixing"
  | "awaiting_validation"
  | "resolved"
  | "closed"
  | "reopened";

export type TeamRole = "dev" | "pm" | "admin" | "client";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TeamMember {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  avatar_url: string | null;
  role: TeamRole;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Bug {
  id: string;
  number: number;
  project_id: string;
  title: string;
  where_found: string;
  steps_taken: string;
  expected_behavior: string;
  actual_behavior: string;
  severity: Severity;
  device_info: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  status: BugStatus;
  assigned_to: string | null;
  duplicate_of: string | null;
  version: number;
  reporter_ip: string | null;
  reporter_user_agent: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  project?: Project;
  assignee?: TeamMember;
  attachments?: BugAttachment[];
}

export interface BugAttachment {
  id: string;
  bug_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

export interface BugNote {
  id: string;
  bug_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: TeamMember;
}

export interface AuditLogEntry {
  id: string;
  bug_id: string;
  actor_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor?: TeamMember;
}

// Report types
export interface ReportData {
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

export interface ResolvedBug {
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

export const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; color: string; bgColor: string; description: string }
> = {
  critical: {
    label: "Critica",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    description:
      "O app trava, perde dados, ou uma funcao essencial nao funciona",
  },
  high: {
    label: "Alta",
    color: "text-orange-700",
    bgColor: "bg-orange-50 border-orange-200",
    description: "Uma funcionalidade importante nao funciona corretamente",
  },
  medium: {
    label: "Media",
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200",
    description: "Algo nao funciona como deveria, mas tem como contornar",
  },
  low: {
    label: "Baixa",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    description: "Detalhe visual, texto errado, ou melhoria pequena",
  },
};

export const STATUS_CONFIG: Record<
  BugStatus,
  { label: string; color: string; bgColor: string }
> = {
  new: { label: "Novo", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200" },
  analyzing: {
    label: "Em analise",
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200",
  },
  fixing: {
    label: "Em correcao",
    color: "text-orange-700",
    bgColor: "bg-orange-50 border-orange-200",
  },
  awaiting_validation: {
    label: "Aguardando validacao",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
  },
  resolved: {
    label: "Resolvido",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
  },
  closed: {
    label: "Fechado",
    color: "text-gray-500",
    bgColor: "bg-gray-50 border-gray-200",
  },
  reopened: {
    label: "Reaberto",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
  },
};

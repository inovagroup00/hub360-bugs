import type { TeamMember } from "@/types";

export interface AuthUser {
  id: string;
  email: string;
  team_member: TeamMember | null;
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
  } catch {
    return null;
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isClient(): boolean {
  const user = getUser();
  return user?.team_member?.role === "client";
}

export function getClientProjectId(): string | null {
  const user = getUser();
  if (user?.team_member?.role === "client") {
    return user.team_member.project_id || null;
  }
  return null;
}

export function logout() {
  localStorage.removeItem("session");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

export function authHeaders(): Record<string, string> {
  const session = getSession();
  if (!session) return {};
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

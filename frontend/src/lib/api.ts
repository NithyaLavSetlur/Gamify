import type { DashboardState, DeploymentConfig } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
export const apiBaseUrl = API_BASE;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<DashboardState>("/dashboard"),
  deploymentConfig: () => request<DeploymentConfig>("/deployment-config"),
  health: () => request<Record<string, unknown>>("/health"),
  createQuest: (payload: Record<string, unknown>) =>
    request("/quests", { method: "POST", body: JSON.stringify(payload) }),
  completeQuest: (id: number) => request(`/quests/${id}/complete`, { method: "POST" }),
  createSession: (payload: Record<string, unknown>) =>
    request("/sessions", { method: "POST", body: JSON.stringify(payload) }),
  createBoss: (payload: Record<string, unknown>) =>
    request("/bosses", { method: "POST", body: JSON.stringify(payload) }),
  completeBoss: (id: number) => request(`/bosses/${id}/complete`, { method: "POST" }),
  createStudyBlock: (payload: Record<string, unknown>) =>
    request("/calendar/study-block", { method: "POST", body: JSON.stringify(payload) }),
  antiBoredom: () => request<{ type: string; prompt: string; xp_hint: number }>("/anti-boredom"),
  updateSettings: (payload: Record<string, unknown>) =>
    request("/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  syncTickTick: () => request("/integrations/ticktick/sync", { method: "POST" }),
  syncGoogle: () => request("/integrations/google/sync", { method: "POST" })
};

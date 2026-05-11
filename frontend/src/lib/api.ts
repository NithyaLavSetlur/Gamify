import type { AssistantReply, AssistantState, DashboardState, DeploymentConfig, IntegrationIntelligence } from "../types";

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
  integrationIntelligence: () => request<IntegrationIntelligence>("/integrations/intelligence"),
  assistantState: () => request<AssistantState>("/assistant"),
  sendAssistantMessage: (payload: Record<string, unknown>) =>
    request<AssistantReply>("/assistant/message", { method: "POST", body: JSON.stringify(payload) }),
  updateAssistantMemory: (memoryId: number, payload: Record<string, unknown>) =>
    request(`/assistant/memories/${memoryId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAssistantMemory: (memoryId: number) => request(`/assistant/memories/${memoryId}`, { method: "DELETE" }),
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
  pomodoroSettings: (payload: Record<string, unknown>) =>
    request("/pomodoro/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  createPomodoroTask: (payload: Record<string, unknown>) =>
    request("/pomodoro/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updatePomodoroTask: (taskId: number, payload: Record<string, unknown>) =>
    request(`/pomodoro/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePomodoroTask: (taskId: number) => request(`/pomodoro/tasks/${taskId}`, { method: "DELETE" }),
  advancePomodoroTask: (taskId: number, payload: Record<string, unknown> = {}) =>
    request(`/pomodoro/tasks/${taskId}/advance`, { method: "POST", body: JSON.stringify(payload) }),
  activatePomodoroTask: (taskId: number) =>
    request(`/pomodoro/tasks/${taskId}/activate`, { method: "POST" }),
  syncTickTick: () => request("/integrations/ticktick/sync", { method: "POST" }),
  updateTickTickTask: (projectId: string, taskId: string, payload: Record<string, unknown>) =>
    request(`/integrations/ticktick/tasks/${encodeURIComponent(projectId)}/${encodeURIComponent(taskId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  syncGoogle: () => request("/integrations/google/sync", { method: "POST" }),
  syncAll: () => request("/integrations/sync-all", { method: "POST" })
};

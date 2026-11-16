import { authEnabled, getIdToken, signOut } from "@/lib/auth"
import type {
  FrameworkId,
  FrameworkItem,
  Language,
  MemoryOverview,
  SessionAttachmentInput,
  SessionMode,
  SessionSummary,
  ThinkingSession,
  UserProfile,
} from "@/types"

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (response.status === 204) {
    return undefined as T
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && authEnabled()) {
      signOut()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sharp-auth-expired"))
      }
    }
    const detail =
      body && typeof body.detail === "string"
        ? body.detail
        : `Request failed with status ${response.status}`
    throw new ApiError(response.status, detail)
  }
  return body as T
}

export const api = {
  getMe: () => request<UserProfile>("/api/me"),
  getFrameworks: () => request<FrameworkItem[]>("/api/frameworks"),
  getMemory: () => request<MemoryOverview>("/api/memory"),
  listSessions: () => request<SessionSummary[]>("/api/sessions"),
  getSession: (id: string) => request<ThinkingSession>(`/api/sessions/${id}`),
  createSession: (payload: {
    problem: string
    framework_id?: FrameworkId
    language?: Language
    mode?: SessionMode
    attachments?: SessionAttachmentInput[]
  }) =>
    request<ThinkingSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteSession: (id: string) =>
    request<void>(`/api/sessions/${id}`, {
      method: "DELETE",
    }),
  answerTurn: (
    sessionId: string,
    payload: { answer_text: string; option_id?: string; turn_number?: number },
  ) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  switchFramework: (sessionId: string, framework_id: FrameworkId) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/framework`, {
      method: "POST",
      body: JSON.stringify({ framework_id }),
    }),
  generatePlan: (sessionId: string) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/plan`, {
      method: "POST",
    }),
  sendChatMessage: (
    sessionId: string,
    payload: { content: string; attachments?: SessionAttachmentInput[] },
  ) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  completeStep: (
    sessionId: string,
    stepId: string,
    payload: { elapsed_seconds: number; reflection_note?: string },
  ) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/steps/${stepId}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  markStepStuck: (sessionId: string, stepId: string) =>
    request<ThinkingSession>(`/api/sessions/${sessionId}/steps/${stepId}/stuck`, {
      method: "POST",
    }),
}

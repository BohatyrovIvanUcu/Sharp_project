export type Language = "uk" | "en"

export type BlockerType =
  "overwhelm" | "unclear_scope" | "perfectionism" | "missing_knowledge" | "fatigue"

export type FrameworkId =
  "socratic" | "five_whys" | "first_principles" | "inversion" | "two_min_rule" | "feynman"

export type SessionPhase = "socratic" | "chat" | "planning" | "executing" | "completed"
export type SessionMode = "task" | "chat"
export type StepStatus = "locked" | "active" | "completed" | "split"
export type TimerMode = "micro" | "sprint" | "pomodoro"

export interface LocalizedText {
  uk: string
  en: string
}

export interface FrameworkItem {
  id: FrameworkId
  name: LocalizedText
  tagline: LocalizedText
  when_to_use: LocalizedText
  cognitive_mechanism: LocalizedText
  anti_pattern: LocalizedText
  example_question: LocalizedText
  recommended_timer: TimerMode
  color_token: string
}

export interface QuestionOption {
  id: string
  label: string
  hint: string
}

export interface MemoryMatch {
  id: string
  summary_text: string
  blocker_type: string
  framework_id: string
  first_step_title: string | null
  similarity: number
  created_at: string
}

export interface SessionTurn {
  id: string
  turn_number: number
  framework_id: FrameworkId
  framework_reason: string
  question_text: string
  options: QuestionOption[]
  user_answer: string | null
  selected_option_id: string | null
  guardrail_triggered: boolean
  ai_source: string
  created_at: string
}

export interface ActionStep {
  id: string
  parent_step_id: string | null
  order_index: number
  title: string
  description: string
  duration_minutes: number
  timer_mode: TimerMode
  status: StepStatus
  pomodoro_seconds: number
  reflection_note: string | null
  completed_at: string | null
}

export interface SessionMessage {
  id: string
  role: "user" | "assistant"
  content: string
  ai_source: string
  conversation_complete?: boolean
  created_at: string
}

export interface SessionAttachmentInput {
  name: string
  mime_type: string
  size_bytes: number
  text_excerpt?: string
}

export interface SessionAttachment {
  name: string
  mime_type: string
  size_bytes: number
  has_text: boolean
}

export interface ThinkingSession {
  id: string
  title: string
  raw_problem: string
  language: Language
  framework_id: FrameworkId
  phase: SessionPhase
  detected_blocker: BlockerType | null
  memory_insight: MemoryMatch[]
  attachments?: SessionAttachment[]
  question_count: number
  max_questions: number
  summary: string | null
  turns: SessionTurn[]
  steps: ActionStep[]
  messages?: SessionMessage[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface SessionSummary {
  id: string
  title: string
  raw_problem: string
  language: Language
  framework_id: FrameworkId
  phase: SessionPhase
  detected_blocker: BlockerType | null
  attachments?: SessionAttachment[]
  question_count: number
  max_questions: number
  active_step: ActionStep | null
  created_at: string
  updated_at: string
}

export interface CognitiveProfile {
  blocker_counts: Record<string, number>
  effective_frameworks: Record<string, number>
  completed_steps: number
  completed_sessions: number
  total_focus_seconds: number
  current_streak: number
}

export type SubscriptionTier = "free" | "pro"

export interface SubscriptionStatus {
  tier: SubscriptionTier
  audio_coach_enabled: boolean
  video_explainer_enabled: boolean
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  cognitive_profile: CognitiveProfile
  subscription?: SubscriptionStatus
  auth_enabled: boolean
  created_at: string
}

export interface MemoryOverview {
  cognitive_profile: CognitiveProfile
  memories: MemoryMatch[]
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Database,
  FileText,
  Info,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { FrameworkDialog } from "@/components/FrameworkDialog"
import { FrameworkLibraryView } from "@/components/FrameworkLibraryView"
import { MemoryProfileView } from "@/components/MemoryProfileView"
import { MonetizationModal } from "@/components/MonetizationModal"
import { PomodoroStepRunner } from "@/components/PomodoroStepRunner"
import { SessionChatDrawer } from "@/components/SessionChatDrawer"
import { TaskComposer } from "@/components/TaskComposer"
import { TaskSearchDialog } from "@/components/TaskSearchDialog"
import { api } from "@/lib/api"
import { signOut } from "@/lib/auth"
import { BLOCKER_LABELS, COPY, useLanguage } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import { useVoiceInput } from "@/lib/voice"
import type {
  BlockerType,
  FrameworkId,
  QuestionOption,
  SessionAttachmentInput,
  SessionMode,
  SessionPhase,
  SessionTurn,
  SubscriptionTier,
  ThinkingSession,
} from "@/types"

type TabId = "workspace" | "library" | "memory"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function hasDistinctProblemDetail(title: string, rawProblem: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ")
  const normTitle = normalize(title)
  const normRaw = normalize(rawProblem)
  return Boolean(normRaw) && normTitle !== normRaw && !normTitle.startsWith(normRaw)
}

function isOptionChosenForTurn(turn: SessionTurn, option: QuestionOption): boolean {
  if (turn.user_answer === null) return false
  if (turn.selected_option_id) return turn.selected_option_id === option.id
  return turn.user_answer === option.label
}

function getCustomAnswerText(turn: SessionTurn): string {
  if (turn.user_answer === null) return ""
  const matchedOption = turn.options.some((opt) => isOptionChosenForTurn(turn, opt))
  return matchedOption ? "" : turn.user_answer
}

function SocraticOptionButton({
  option,
  index,
  disabled,
  isSelected = false,
  isReviewing = false,
  selectedLabel,
  onSelect,
}: {
  option: QuestionOption
  index: number
  disabled: boolean
  isSelected?: boolean
  isReviewing?: boolean
  selectedLabel?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isReviewing ? isSelected : undefined}
      onClick={onSelect}
      className={`group flex flex-col justify-between rounded-inner border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        isSelected
          ? "border-accent bg-accent-tint/50 hover:bg-accent-tint/70"
          : "border-rule bg-paper hover:border-accent hover:bg-paper-3"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2.5">
        <span className="text-sm font-medium text-ink group-hover:text-accent">{option.label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {isSelected && selectedLabel && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent">
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>{selectedLabel}</span>
            </span>
          )}
          <kbd className="rounded-md border border-rule bg-paper-2 px-1.5 py-0.5 text-xs font-medium text-muted tabular-nums">
            {index + 1}
          </kbd>
        </div>
      </div>
      <span className="mt-1 text-xs leading-snug text-ink-2">{option.hint}</span>
    </button>
  )
}

const DISMISSED_PROACTIVE_KEY = "sharp.dismissedProactive"
const SIDEBAR_COLLAPSED_KEY = "sharp.sidebarCollapsed"
const METHODS_ONBOARDING_KEY = "sharp.methodsOnboardingSeen"

function readMethodsOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(METHODS_ONBOARDING_KEY) === "true"
  } catch {
    return false
  }
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  } catch {
    return false
  }
}

function readDismissedProactive(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_PROACTIVE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function WorkspacePage() {
  const [lang, setLang] = useLanguage()
  const [theme, setTheme] = useTheme()
  const t = COPY[lang]
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<TabId>("workspace")
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [problemInput, setProblemInput] = useState("")
  const [composerMode, setComposerMode] = useState<SessionMode>("chat")
  const [attachments, setAttachments] = useState<SessionAttachmentInput[]>([])
  const [selectedFramework, setSelectedFramework] = useState<FrameworkId | "auto">("auto")
  const [customAnswer, setCustomAnswer] = useState("")
  const [viewingTurnNumber, setViewingTurnNumber] = useState<number | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatErrorMsg, setChatErrorMsg] = useState<string | null>(null)
  const [stuckLimitMsg, setStuckLimitMsg] = useState<string | null>(null)
  const [monetizationOpen, setMonetizationOpen] = useState(false)
  const [monetizationMedia, setMonetizationMedia] = useState<"audio" | "video">("audio")
  const [monetizationTopic, setMonetizationTopic] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const [searchOpen, setSearchOpen] = useState(false)
  const questionHeadingRef = useRef<HTMLParagraphElement | null>(null)
  const [landingTitleIdx, setLandingTitleIdx] = useState(() =>
    Math.floor(Math.random() * COPY.uk.phase1Titles.length),
  )
  const [dismissedProactiveIds, setDismissedProactiveIds] =
    useState<string[]>(readDismissedProactive)
  const [showMethodsOnboarding, setShowMethodsOnboarding] = useState(
    () => !readMethodsOnboardingSeen(),
  )

  const dismissMethodsOnboarding = () => {
    setShowMethodsOnboarding(false)
    try {
      localStorage.setItem(METHODS_ONBOARDING_KEY, "true")
    } catch {
      // ignore storage errors
    }
  }

  const toggleSidebarCollapsed = (next: boolean) => {
    setSidebarCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
    } catch {
      // ignore storage errors
    }
  }
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const {
    isListening: isCustomAnswerListening,
    toggleListening: toggleCustomAnswerVoice,
    stopListening: stopCustomAnswerVoice,
  } = useVoiceInput({
    lang,
    onChange: (nextValue) => {
      setErrorMsg(null)
      setCustomAnswer(nextValue)
    },
    onUnsupported: () => setErrorMsg(t.voiceNotSupported),
  })

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe })
  const frameworksQuery = useQuery({ queryKey: ["frameworks"], queryFn: api.getFrameworks })
  const sessionsQuery = useQuery({ queryKey: ["sessions"], queryFn: api.listSessions })
  const memoryQuery = useQuery({ queryKey: ["memory"], queryFn: api.getMemory })

  const activeSessionQuery = useQuery({
    queryKey: ["session", selectedSessionId],
    queryFn: () => api.getSession(selectedSessionId!),
    enabled: Boolean(selectedSessionId),
  })

  const frameworks = frameworksQuery.data ?? []
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const activeSession = activeSessionQuery.data ?? null

  const invalidateAll = useCallback(
    async (sessionId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["memory"] }),
        sessionId
          ? queryClient.invalidateQueries({ queryKey: ["session", sessionId] })
          : Promise.resolve(),
      ])
    },
    [queryClient],
  )

  const selectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId)
    setViewingTurnNumber(null)
    setCustomAnswer("")
    setChatOpen(false)
    setChatErrorMsg(null)
    setStuckLimitMsg(null)
  }, [])

  const createMutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (created) => {
      setErrorMsg(null)
      setProblemInput("")
      setAttachments([])
      selectSession(created.id)
      queryClient.setQueryData(["session", created.id], created)
      void invalidateAll(created.id)
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : "Failed to start session"),
  })

  const answerMutation = useMutation({
    mutationFn: ({
      sessionId,
      answerText,
      optionId,
      turnNumber,
    }: {
      sessionId: string
      answerText: string
      optionId?: string
      turnNumber?: number
    }) =>
      api.answerTurn(sessionId, {
        answer_text: answerText,
        option_id: optionId,
        ...(turnNumber !== undefined ? { turn_number: turnNumber } : {}),
      }),
    onSuccess: (updated) => {
      setErrorMsg(null)
      setViewingTurnNumber(null)
      setCustomAnswer("")
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : "Failed to submit answer"),
  })

  const switchFwMutation = useMutation({
    mutationFn: ({ sessionId, fwId }: { sessionId: string; fwId: FrameworkId }) =>
      api.switchFramework(sessionId, fwId),
    onSuccess: (updated) => {
      setErrorMsg(null)
      setViewingTurnNumber(null)
      setDialogOpen(false)
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
  })

  const planMutation = useMutation({
    mutationFn: (sessionId: string) => api.generatePlan(sessionId),
    onSuccess: (updated) => {
      setErrorMsg(null)
      setViewingTurnNumber(null)
      setCustomAnswer("")
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
  })

  const completeStepMutation = useMutation({
    mutationFn: ({
      sessionId,
      stepId,
      elapsedSeconds,
      reflectionNote,
    }: {
      sessionId: string
      stepId: string
      elapsedSeconds: number
      reflectionNote?: string
    }) =>
      api.completeStep(sessionId, stepId, {
        elapsed_seconds: elapsedSeconds,
        reflection_note: reflectionNote,
      }),
    onSuccess: (updated) => {
      setErrorMsg(null)
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
  })

  const stuckMutation = useMutation({
    mutationFn: ({ sessionId, stepId }: { sessionId: string; stepId: string }) =>
      api.markStepStuck(sessionId, stepId),
    onSuccess: (updated) => {
      setErrorMsg(null)
      setStuckLimitMsg(null)
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t.stepLimitReachedBody
      setStuckLimitMsg(msg)
    },
  })

  const subscriptionMutation = useMutation({
    mutationFn: (tier: SubscriptionTier) => api.updateSubscription(tier),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated)
      void queryClient.invalidateQueries({ queryKey: ["me"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => api.deleteSession(sessionId),
    onSuccess: (_void, deletedId) => {
      if (selectedSessionId === deletedId) {
        selectSession(null)
      }
      void invalidateAll()
    },
  })

  const chatMutation = useMutation({
    mutationFn: ({
      sessionId,
      content,
      attachments: attached,
    }: {
      sessionId: string
      content: string
      attachments?: SessionAttachmentInput[]
    }) =>
      api.sendChatMessage(sessionId, {
        content,
        ...(attached && attached.length > 0 ? { attachments: attached } : {}),
      }),
    onSuccess: (updated) => {
      setChatErrorMsg(null)
      queryClient.setQueryData(["session", updated.id], updated)
      void invalidateAll(updated.id)
    },
    onError: (err) =>
      setChatErrorMsg(err instanceof Error ? err.message : "Failed to send message"),
  })

  const sortedTurns = useMemo(() => {
    if (!activeSession) return []
    return [...activeSession.turns].sort((a, b) => a.turn_number - b.turn_number)
  }, [activeSession])

  const currentPendingTurn = useMemo(() => {
    if (!activeSession || activeSession.phase !== "socratic") return null
    return sortedTurns.find((turn) => turn.user_answer === null) ?? null
  }, [activeSession, sortedTurns])

  const canReturnToSocraticFromPlan = useMemo(() => {
    if (!activeSession || activeSession.phase !== "executing") return false
    if (sortedTurns.length === 0) return false
    return !activeSession.steps.some((step) => step.status === "completed")
  }, [activeSession, sortedTurns])

  const displayedTurn = useMemo(() => {
    if (!activeSession) return null
    if (viewingTurnNumber !== null) {
      const found = sortedTurns.find((turn) => turn.turn_number === viewingTurnNumber)
      if (found && (activeSession.phase === "socratic" || canReturnToSocraticFromPlan)) {
        return found
      }
    }
    if (activeSession.phase === "socratic") {
      return currentPendingTurn
    }
    return null
  }, [
    activeSession,
    viewingTurnNumber,
    sortedTurns,
    currentPendingTurn,
    canReturnToSocraticFromPlan,
  ])

  const answeredTurns = useMemo(() => {
    return sortedTurns.filter((turn) => turn.user_answer !== null)
  }, [sortedTurns])

  const displayedTurnIndex = displayedTurn
    ? sortedTurns.findIndex((turn) => turn.id === displayedTurn.id)
    : -1
  const previousTurn = displayedTurnIndex > 0 ? sortedTurns[displayedTurnIndex - 1] : null
  const nextTurn =
    displayedTurnIndex >= 0 && displayedTurnIndex < sortedTurns.length - 1
      ? sortedTurns[displayedTurnIndex + 1]
      : null
  const isReviewingAnsweredTurn = Boolean(displayedTurn && displayedTurn.user_answer !== null)

  const navigateToTurn = useCallback(
    (targetTurnNumber: number | null) => {
      setViewingTurnNumber(targetTurnNumber)
      setErrorMsg(null)
      if (targetTurnNumber === null || !activeSession) {
        setCustomAnswer("")
        return
      }
      const target = activeSession.turns.find((turn) => turn.turn_number === targetTurnNumber)
      setCustomAnswer(target ? getCustomAnswerText(target) : "")
      window.requestAnimationFrame(() => {
        questionHeadingRef.current?.focus()
      })
    },
    [activeSession],
  )

  const handleSelectOption = useCallback(
    (turn: SessionTurn, option: QuestionOption) => {
      if (!activeSession || answerMutation.isPending) return
      const alreadyChosen = isOptionChosenForTurn(turn, option)
      const hasNextInSession = sortedTurns.some((t) => t.turn_number > turn.turn_number)
      if (alreadyChosen && (hasNextInSession || activeSession.phase === "executing")) {
        const next = sortedTurns.find((t) => t.turn_number === turn.turn_number + 1)
        navigateToTurn(next && next.id !== currentPendingTurn?.id ? next.turn_number : null)
        return
      }
      answerMutation.mutate({
        sessionId: activeSession.id,
        answerText: option.label,
        optionId: option.id,
        turnNumber:
          turn.user_answer !== null || activeSession.phase === "executing"
            ? turn.turn_number
            : undefined,
      })
    },
    [activeSession, answerMutation, sortedTurns, currentPendingTurn, navigateToTurn],
  )

  const handleSubmitCustomAnswer = useCallback(
    (turn: SessionTurn) => {
      if (!activeSession || answerMutation.isPending) return
      stopCustomAnswerVoice()
      const trimmed = customAnswer.trim()
      if (!trimmed) return
      const isUnchangedCustom =
        turn.user_answer === trimmed &&
        !turn.selected_option_id &&
        (sortedTurns.some((t) => t.turn_number > turn.turn_number) ||
          activeSession.phase === "executing")
      if (isUnchangedCustom) {
        const next = sortedTurns.find((t) => t.turn_number === turn.turn_number + 1)
        navigateToTurn(next && next.id !== currentPendingTurn?.id ? next.turn_number : null)
        return
      }
      answerMutation.mutate({
        sessionId: activeSession.id,
        answerText: trimmed,
        turnNumber:
          turn.user_answer !== null || activeSession.phase === "executing"
            ? turn.turn_number
            : undefined,
      })
    },
    [
      activeSession,
      answerMutation,
      customAnswer,
      sortedTurns,
      currentPendingTurn,
      navigateToTurn,
      stopCustomAnswerVoice,
    ],
  )

  useEffect(() => {
    if (tab !== "workspace" || !activeSession || !displayedTurn || answerMutation.isPending) {
      return
    }
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      const num = Number(event.key)
      if (num >= 1 && num <= displayedTurn.options.length) {
        const option = displayedTurn.options[num - 1]
        if (option) {
          event.preventDefault()
          handleSelectOption(displayedTurn, option)
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [tab, activeSession, displayedTurn, answerMutation.isPending, handleSelectOption])

  const proactiveUnfinished = useMemo(
    () =>
      sessions.find(
        (s) =>
          s.phase === "executing" &&
          s.active_step &&
          s.id !== selectedSessionId &&
          !dismissedProactiveIds.includes(s.id),
      ) ?? null,
    [sessions, selectedSessionId, dismissedProactiveIds],
  )

  const dismissProactive = (sessionId: string) => {
    setDismissedProactiveIds((prev) => {
      if (prev.includes(sessionId)) return prev
      const next = [...prev, sessionId]
      try {
        sessionStorage.setItem(DISMISSED_PROACTIVE_KEY, JSON.stringify(next))
      } catch {
        // ignore session storage errors
      }
      return next
    })
  }

  const handleStartSession = (problemText: string, attached: SessionAttachmentInput[]) => {
    const trimmed = problemText.trim()
    if (trimmed.length < 3 && attached.length === 0) return
    createMutation.mutate({
      problem: trimmed,
      framework_id:
        composerMode === "task" && selectedFramework !== "auto" ? selectedFramework : undefined,
      language: lang,
      mode: composerMode,
      ...(attached.length > 0 ? { attachments: attached } : {}),
    })
  }

  const handleSignOut = () => {
    signOut()
    queryClient.clear()
    navigate("/login")
  }

  const handleResetToNewTask = () => {
    setTab("workspace")
    selectSession(null)
    setErrorMsg(null)
    setMobileHistoryOpen(false)
    setLandingTitleIdx((prev) => {
      const count = COPY.uk.phase1Titles.length
      if (count <= 1) return 0
      const offset = 1 + Math.floor(Math.random() * (count - 1))
      return (prev + offset) % count
    })
  }

  const resolveFrameworkName = (id: string) => frameworks.find((f) => f.id === id)?.name[lang] ?? id

  const resolvePhaseLabel = (phase: SessionPhase | string) => {
    if (phase === "chat") return t.phaseTagChat
    if (phase === "socratic") return t.phaseTagSocratic
    if (phase === "executing") return t.phaseTagExecuting
    if (phase === "completed") return t.phaseTagCompleted
    return phase
  }

  const isLandingState = tab === "workspace" && !activeSession

  const renderPhaseHeader = (session: ThinkingSession) => {
    const stepIndex = displayedTurn ? 2 : session.phase === "socratic" ? 2 : 3
    const blitzStepNumber = displayedTurn ? displayedTurn.turn_number : session.question_count
    const phases = [
      { idx: 1, label: t.phaseDiagnostic },
      {
        idx: 2,
        label: `${t.phaseBlitz} (${blitzStepNumber}/${session.max_questions})`,
      },
      { idx: 3, label: t.phaseExecution },
    ]
    return (
      <div className="flex flex-wrap items-center gap-6 border-y border-rule py-2">
        {phases.map((p) => {
          const isCurrent = p.idx === stepIndex
          const isDone = p.idx < stepIndex || session.phase === "completed"
          return (
            <div
              key={p.idx}
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                isCurrent ? "text-ink" : isDone ? "text-accent" : "text-muted"
              }`}
            >
              {isDone && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{p.label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen bg-paper text-ink">
      {/* Frosted Dusk mountain backdrop — pre-blurred photograph + slate radial veil (no nested backdrop-filter) */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <img
          src="/dusk-ridge.jpg"
          alt=""
          className="dusk-frosted-photo h-full w-full object-cover object-[50%_58%]"
        />
        <div className="dusk-frosted-veil absolute inset-0" />
      </div>

      {mobileHistoryOpen && (
        <div
          className="dusk-backdrop fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileHistoryOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`dusk-sidebar z-50 shrink-0 flex-col border-r border-rule ${
          mobileHistoryOpen
            ? "fixed inset-y-0 left-0 flex w-[276px]"
            : sidebarCollapsed
              ? "hidden"
              : "hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[16rem]"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={handleResetToNewTask}
            className="inline-flex items-center gap-2 rounded-inner px-1 py-1 text-left text-ink transition-colors hover:text-accent"
            aria-label="Sharp"
          >
            <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight">Sharp</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMobileHistoryOpen(false)
                setSearchOpen(true)
              }}
              aria-label={t.searchTasksLabel}
              title={t.searchTasksLabel}
              className="dusk-chip inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:text-ink"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => toggleSidebarCollapsed(true)}
              aria-label={t.collapseSidebar}
              title={t.collapseSidebar}
              className="dusk-chip hidden h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:text-ink lg:inline-flex"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setMobileHistoryOpen(false)}
              aria-label={t.closeDialog}
              className="dusk-hover-soft inline-flex h-8 w-8 items-center justify-center rounded-inner text-muted hover:text-ink lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 px-3 pb-3">
          <button
            type="button"
            onClick={handleResetToNewTask}
            className="dusk-chip-soft inline-flex w-full items-center gap-2.5 rounded-inner px-3 py-2 text-sm font-medium text-ink"
          >
            <Plus className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>{t.newTask}</span>
          </button>

          <nav aria-label="Primary" className="space-y-0.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setTab("workspace")
                setMobileHistoryOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 rounded-inner border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === "workspace"
                  ? "dusk-chip-active text-ink"
                  : "dusk-hover-soft text-ink-2 hover:text-ink"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{t.navWorkspace}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("library")
                setMobileHistoryOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 rounded-inner border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === "library"
                  ? "dusk-chip-active text-ink"
                  : "dusk-hover-soft text-ink-2 hover:text-ink"
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{t.navLibrary}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("memory")
                setMobileHistoryOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 rounded-inner border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === "memory"
                  ? "dusk-chip-active text-ink"
                  : "dusk-hover-soft text-ink-2 hover:text-ink"
              }`}
            >
              <Database className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{t.navMemory}</span>
            </button>
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-rule px-3 py-3">
          <div className="mb-2.5 flex items-center justify-between px-1 text-xs">
            <h2 className="font-medium text-muted">{t.sessionsHistory}</h2>
            <span className="inline-flex items-center gap-1 text-muted">
              <span>{t.streakLabel}:</span>
              <span className="font-medium text-accent-2 tabular-nums">
                {meQuery.data?.cognitive_profile.current_streak ?? 0}
              </span>
            </span>
          </div>

          {sessions.length === 0 ? (
            <p className="px-1 text-xs text-muted">{t.noSessionsYet}</p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((s) => {
                const isSelected = s.id === selectedSessionId
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        setTab("workspace")
                        selectSession(s.id)
                        setErrorMsg(null)
                        setMobileHistoryOpen(false)
                      }}
                      className={`w-full rounded-inner border-l-2 px-2.5 py-2 text-left transition-colors ${
                        isSelected
                          ? "dusk-chip-active border-accent text-ink"
                          : "dusk-hover-soft border-transparent text-ink-2 hover:text-ink"
                      }`}
                    >
                      <div className="line-clamp-1 pr-6 text-xs font-medium">{s.title}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>{resolvePhaseLabel(s.phase)}</span>
                        <span className="truncate">
                          {s.phase === "chat"
                            ? t.assistantChatBtn
                            : resolveFrameworkName(s.framework_id)}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`${t.deleteSession} ${s.title}`}
                      onClick={() => deleteMutation.mutate(s.id)}
                      className="dusk-hover-tint absolute top-1.5 right-1.5 rounded-inner p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-error focus-visible:opacity-100 [@media(hover:none)]:opacity-75"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2.5 border-t border-rule px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {meQuery.data ? (
              <div className="truncate text-xs text-muted">{meQuery.data.email}</div>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={() => {
                setMonetizationTopic(activeSession?.title ?? null)
                setMonetizationOpen(true)
              }}
              className="dusk-chip inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-medium text-accent hover:text-ink"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>
                {meQuery.data?.subscription?.tier === "pro" ? t.proBadge : t.unlockProBtn}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center gap-1" role="group" aria-label="Language">
                {(["uk", "en"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    className={`rounded-inner px-2 py-1 text-xs font-medium transition-colors ${
                      lang === code ? "dusk-chip-active text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    {code === "uk" ? "Укр" : "Eng"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? t.switchToLight : t.switchToDark}
                title={theme === "dark" ? t.switchToLight : t.switchToDark}
                className="dusk-chip inline-flex h-7 w-7 items-center justify-center rounded-inner text-ink-2 hover:text-ink"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="dusk-btn-ghost inline-flex items-center gap-1.5 px-3 py-1 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col">
        {sidebarCollapsed && (
          <div className="hidden flex-col items-center gap-2 lg:absolute lg:top-4 lg:left-6 lg:z-30 lg:flex">
            <button
              type="button"
              onClick={() => toggleSidebarCollapsed(false)}
              aria-label={t.expandSidebar}
              title={t.expandSidebar}
              className="dusk-chip inline-flex h-9 w-9 items-center justify-center rounded-pill text-ink-2 hover:text-ink"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t.searchTasksLabel}
              title={t.searchTasksLabel}
              className="dusk-chip inline-flex h-9 w-9 items-center justify-center rounded-pill text-ink-2 hover:text-ink"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-rule/70 bg-paper/75 px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={handleResetToNewTask}
            className="inline-flex items-center gap-2 text-left text-ink"
            aria-label="Sharp"
          >
            <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="font-display text-lg font-medium">Sharp</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? t.switchToLight : t.switchToDark}
              title={theme === "dark" ? t.switchToLight : t.switchToDark}
              className="dusk-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t.searchTasksLabel}
              title={t.searchTasksLabel}
              className="dusk-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setMobileHistoryOpen((prev) => !prev)}
              aria-expanded={mobileHistoryOpen}
              className="dusk-btn-ghost inline-flex items-center gap-2 px-3.5 py-1.5 text-xs"
            >
              <Menu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {mobileHistoryOpen ? t.historyToggleHide : t.historyToggleShow} (
                <span className="tabular-nums">{sessions.length}</span>)
              </span>
            </button>
          </div>
        </header>

        <main
          className={`relative mx-auto flex w-full flex-1 flex-col px-4 sm:px-6 ${
            isLandingState
              ? "max-w-[54rem] pt-[clamp(3rem,22vh,11rem)] pb-6 sm:pt-[clamp(4rem,31vh,18rem)]"
              : activeSession?.phase === "chat"
                ? "max-w-[50rem] pt-3 pb-2 sm:pt-5"
                : chatOpen && activeSession
                  ? "max-w-[82rem] py-3 sm:py-4"
                  : !displayedTurn &&
                      (activeSession?.phase === "executing" || activeSession?.phase === "completed")
                    ? "max-w-[72rem] py-3 sm:py-4"
                    : "max-w-[60rem] py-3 sm:py-4"
          }`}
        >
          <h1 className="sr-only">Sharp Interactive Socratic Workspace</h1>

          {proactiveUnfinished && proactiveUnfinished.active_step && (
            <div
              role="region"
              aria-label={t.proactiveBannerPrefix}
              className={`flex items-center justify-between gap-2 rounded-pill border border-accent-2/35 bg-apricot-tint py-1.5 pr-2 pl-3.5 ${
                isLandingState
                  ? "mx-auto mb-4 w-full max-w-[34rem] lg:absolute lg:top-4 lg:right-8 lg:z-20 lg:mx-0 lg:mb-0 lg:w-fit lg:max-w-[28rem]"
                  : "mb-2.5 ml-auto w-full max-w-full sm:w-fit sm:max-w-[36rem]"
              }`}
            >
              <div className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium text-accent-2">{t.proactiveBannerPrefix}: </span>
                <span className="text-ink">
                  {proactiveUnfinished.title}, {proactiveUnfinished.active_step.title}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTab("workspace")
                    selectSession(proactiveUnfinished.id)
                  }}
                  className="inline-flex items-center gap-1 rounded-pill border border-accent-2/60 px-2.5 py-1 text-xs font-medium text-accent-2 transition-colors hover:bg-accent-2 hover:text-accent-ink"
                >
                  <span>{t.proactiveResume}</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => dismissProactive(proactiveUnfinished.id)}
                  aria-label={t.dismissBanner}
                  title={t.dismissBanner}
                  className="dusk-hover-tint inline-flex h-7 w-7 items-center justify-center rounded-pill text-ink-2 hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className={`mb-5 rounded-inner border border-error bg-error-tint px-4 py-3 text-sm text-ink ${
                isLandingState ? "mx-auto w-full max-w-[34rem]" : ""
              }`}
            >
              {errorMsg}
            </div>
          )}

          {tab === "library" && (
            <FrameworkLibraryView
              frameworks={frameworks}
              lang={lang}
              onStartWithFramework={(fwId) => {
                setSelectedFramework(fwId)
                setComposerMode("task")
                selectSession(null)
                setTab("workspace")
              }}
            />
          )}

          {tab === "memory" && (
            <MemoryProfileView overview={memoryQuery.data} frameworks={frameworks} lang={lang} />
          )}

          {tab === "workspace" && !activeSession && (
            <section className="flex w-full flex-col items-center">
              <h2 className="text-balance text-center font-display text-3xl font-normal tracking-tight text-ink sm:text-4xl">
                {t.phase1Titles[landingTitleIdx] ?? t.phase1Title}
              </h2>

              <div data-testid="landing-composer-wrap" className="mt-10 w-full sm:mt-6">
                <TaskComposer
                  lang={lang}
                  mode={composerMode}
                  onChangeMode={setComposerMode}
                  problem={problemInput}
                  onChangeProblem={setProblemInput}
                  selectedFramework={selectedFramework}
                  onSelectFramework={setSelectedFramework}
                  frameworks={frameworks}
                  attachments={attachments}
                  onChangeAttachments={setAttachments}
                  isSubmitting={createMutation.isPending}
                  onSubmitSession={handleStartSession}
                  onOpenLibrary={() => {
                    dismissMethodsOnboarding()
                    setTab("library")
                  }}
                />
              </div>
            </section>
          )}

          {tab === "workspace" && activeSession && (
            <div
              className={
                activeSession.phase === "chat"
                  ? "flex min-h-0 flex-1 flex-col"
                  : "flex flex-col gap-4 xl:flex-row xl:items-start"
              }
            >
              <section
                className={
                  activeSession.phase === "chat"
                    ? "flex min-h-0 flex-1 flex-col"
                    : "dusk-surface min-w-0 flex-1 space-y-3.5 p-4 sm:p-5"
                }
              >
                <div
                  className={`flex flex-wrap items-start justify-between gap-3 ${
                    activeSession.phase === "chat" ? "border-b border-rule pb-3.5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-xl leading-snug font-medium text-ink">
                      {activeSession.title}
                    </h2>
                    {hasDistinctProblemDetail(activeSession.title, activeSession.raw_problem) && (
                      <p className="mt-1 max-w-[65ch] text-xs text-ink-2 sm:text-sm">
                        {activeSession.raw_problem}
                      </p>
                    )}

                    {activeSession.attachments && activeSession.attachments.length > 0 && (
                      <div aria-label={t.attachedFilesLabel} className="mt-2 flex flex-wrap gap-1.5">
                        {activeSession.attachments.map((att, idx) => (
                          <span
                            key={`${att.name}-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-pill border border-rule bg-paper px-2.5 py-0.5 text-xs text-ink-2"
                          >
                            <FileText className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            <span className="font-medium text-ink">{att.name}</span>
                            <span className="text-muted tabular-nums">
                              {formatFileSize(att.size_bytes)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeSession.phase === "chat" ? (
                      <button
                        type="button"
                        disabled={planMutation.isPending || chatMutation.isPending}
                        onClick={() => planMutation.mutate(activeSession.id)}
                        className="dusk-pill-primary inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-xs"
                      >
                        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {planMutation.isPending ? t.convertingToPlan : t.convertToPlanBtn}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-expanded={chatOpen}
                          onClick={() => setChatOpen((prev) => !prev)}
                          className={`dusk-btn-ghost inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs ${
                            chatOpen ? "border-accent bg-accent-tint/50 text-ink" : ""
                          }`}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                          <span>{t.assistantChatBtn}</span>
                          {(activeSession.messages?.length ?? 0) > 0 && (
                            <span className="rounded-pill bg-accent/20 px-1.5 py-0.2 text-[11px] font-medium text-accent tabular-nums">
                              {activeSession.messages?.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialogOpen(true)}
                          title={t.methodBadgeTip}
                          className="dusk-btn-ghost inline-flex shrink-0 items-center gap-2 px-3.5 py-1.5 text-xs"
                        >
                          <Brain className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                          <span>{resolveFrameworkName(activeSession.framework_id)}</span>
                          <Info className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {activeSession.phase !== "chat" && renderPhaseHeader(activeSession)}

              {activeSession.memory_insight.filter((mem) => mem.similarity >= 0.3).length > 0 && (
                <div
                  className={`border-l-2 border-accent pl-3.5 ${
                    activeSession.phase === "chat" ? "mt-3" : ""
                  }`}
                >
                  <div className="text-xs font-medium text-accent">{t.memoryInsightTitle}</div>
                  <p className="mt-0.5 text-xs text-muted">{t.memoryInsightSub}</p>
                  <ul className="mt-1.5 space-y-1">
                    {activeSession.memory_insight
                      .filter((mem) => mem.similarity >= 0.3)
                      .slice(0, 2)
                      .map((mem) => (
                        <li key={mem.id} className="text-xs text-ink-2 tabular-nums">
                          <span className="font-medium text-accent">
                            [{Math.round(mem.similarity * 100)}%]
                          </span>{" "}
                          {mem.summary_text}
                          {mem.first_step_title ? `, ${mem.first_step_title}` : ""}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {displayedTurn && (
                <div className="space-y-3.5">
                  {displayedTurn.guardrail_triggered && (
                    <div className="flex items-start gap-2.5 rounded-r-inner border-l-2 border-error bg-error-tint px-3.5 py-2.5 text-ink">
                      <ShieldAlert
                        className="mt-0.5 h-4 w-4 shrink-0 text-error"
                        aria-hidden="true"
                      />
                      <div>
                        <div className="text-xs font-medium text-error">{t.guardrailBadge}</div>
                        <p className="mt-0.5 text-xs text-ink sm:text-sm">{t.guardrailText}</p>
                      </div>
                    </div>
                  )}

                  <div className="dusk-surface-elevated p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-accent tabular-nums">
                          {t.questionProgress} {displayedTurn.turn_number} {t.of}{" "}
                          {activeSession.max_questions}
                        </span>
                        {isReviewingAnsweredTurn && (
                          <span className="rounded-pill bg-accent-tint px-2.5 py-0.5 text-[11px] font-medium text-accent">
                            {t.editingAnswerBadge}
                          </span>
                        )}
                      </div>
                      {(activeSession.detected_blocker ||
                        previousTurn ||
                        nextTurn ||
                        activeSession.phase === "executing") && (
                        <div className="flex flex-wrap items-center gap-2">
                          {activeSession.detected_blocker && (
                            <span className="rounded-pill bg-apricot-tint px-2.5 py-0.5 text-xs font-medium text-accent-2">
                              {BLOCKER_LABELS[activeSession.detected_blocker as BlockerType]?.[
                                lang
                              ] ?? activeSession.detected_blocker}
                            </span>
                          )}
                          {previousTurn && (
                            <button
                              type="button"
                              disabled={answerMutation.isPending}
                              onClick={() => navigateToTurn(previousTurn.turn_number)}
                              aria-label={`${t.previousQuestion} (${t.questionProgress.toLowerCase()} ${previousTurn.turn_number})`}
                              className="dusk-btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                            >
                              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t.previousQuestion}</span>
                            </button>
                          )}
                          {(nextTurn || activeSession.phase === "executing") && (
                            <button
                              type="button"
                              disabled={answerMutation.isPending}
                              onClick={() =>
                                navigateToTurn(
                                  nextTurn && nextTurn.id !== currentPendingTurn?.id
                                    ? nextTurn.turn_number
                                    : null,
                                )
                              }
                              aria-label={
                                nextTurn
                                  ? `${t.nextQuestion} (${t.questionProgress.toLowerCase()} ${nextTurn.turn_number})`
                                  : t.backToPlan
                              }
                              className="dusk-btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                            >
                              <span>{nextTurn ? t.nextQuestion : t.backToPlan}</span>
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <p
                      ref={questionHeadingRef}
                      tabIndex={-1}
                      className="mt-2 font-display text-lg leading-snug font-medium text-ink focus:outline-none"
                    >
                      {displayedTurn.question_text}
                    </p>
                    <p className="mt-1 max-w-[65ch] text-xs leading-relaxed text-ink-2">
                      {displayedTurn.framework_reason}
                    </p>
                    {isReviewingAnsweredTurn && (
                      <p className="mt-2 text-xs text-muted">{t.editingAnswerHint}</p>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-muted">{t.pickHypothesis}</div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {displayedTurn.options.map((opt, idx) => (
                        <SocraticOptionButton
                          key={opt.id}
                          option={opt}
                          index={idx}
                          disabled={answerMutation.isPending}
                          isSelected={isOptionChosenForTurn(displayedTurn, opt)}
                          isReviewing={isReviewingAnsweredTurn}
                          selectedLabel={t.selectedAnswerBadge}
                          onSelect={() => handleSelectOption(displayedTurn, opt)}
                        />
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSubmitCustomAnswer(displayedTurn)
                    }}
                    className="border-t border-rule pt-3"
                  >
                    <label
                      htmlFor="custom-answer"
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      {t.orCustomAnswer}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        id="custom-answer"
                        type="text"
                        value={customAnswer}
                        onChange={(e) => setCustomAnswer(e.target.value)}
                        placeholder={t.customPlaceholder}
                        className="dusk-field min-w-0 flex-1 px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={answerMutation.isPending}
                        onClick={() => toggleCustomAnswerVoice(customAnswer)}
                        aria-pressed={isCustomAnswerListening}
                        aria-label={isCustomAnswerListening ? t.voiceStop : t.voiceStart}
                        title={isCustomAnswerListening ? t.voiceStop : t.voiceStart}
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-inner transition-colors disabled:opacity-50 ${
                          isCustomAnswerListening
                            ? "border border-accent bg-accent-tint text-accent"
                            : "dusk-btn-ghost p-0 text-ink-2 hover:text-ink"
                        }`}
                      >
                        <Mic
                          className={`h-3.5 w-3.5 ${
                            isCustomAnswerListening ? "animate-pulse" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="submit"
                        disabled={answerMutation.isPending || !customAnswer.trim()}
                        className="dusk-pill-primary inline-flex items-center gap-1.5 px-4 py-1.5 text-xs sm:text-sm"
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.submitAnswer}</span>
                      </button>
                      {activeSession.phase === "socratic" && (
                        <button
                          type="button"
                          disabled={planMutation.isPending}
                          onClick={() => planMutation.mutate(activeSession.id)}
                          className="dusk-btn-ghost px-3.5 py-1.5 text-xs"
                        >
                          {t.skipToPlan}
                        </button>
                      )}
                    </div>
                  </form>

                  {answeredTurns.length > 0 && (
                    <div className="border-t border-rule pt-3">
                      <h3 className="mb-2 text-xs font-medium text-muted">{t.previousAnswers}</h3>
                      <ul className="divide-y divide-rule border-t border-rule">
                        {answeredTurns.map((turn) => {
                          const isEditingThis = displayedTurn.id === turn.id
                          return (
                            <li
                              key={turn.id}
                              className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-muted">
                                  Q{turn.turn_number}: {turn.question_text}
                                </div>
                                <div className="mt-0.5 font-medium text-ink">
                                  {turn.user_answer}
                                </div>
                              </div>
                              {isEditingThis ? (
                                <span className="shrink-0 rounded-pill bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">
                                  {t.editingNowBadge}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={answerMutation.isPending}
                                  onClick={() => navigateToTurn(turn.turn_number)}
                                  aria-label={`${t.editAnswerBtn} Q${turn.turn_number}`}
                                  className="dusk-btn-ghost shrink-0 px-2.5 py-1 text-xs"
                                >
                                  {t.editAnswerBtn}
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {activeSession.phase === "chat" && (
                <SessionChatDrawer
                  sessionId={activeSession.id}
                  messages={activeSession.messages ?? []}
                  lang={lang}
                  variant="inline"
                  isSending={chatMutation.isPending}
                  errorMsg={chatErrorMsg}
                  hasSteps={(activeSession.steps?.length ?? 0) > 0}
                  onConvertToPlan={() => planMutation.mutate(activeSession.id)}
                  onNewTask={handleResetToNewTask}
                  onSend={(content, attached) =>
                    chatMutation.mutate({
                      sessionId: activeSession.id,
                      content,
                      attachments: attached,
                    })
                  }
                />
              )}

              {!displayedTurn &&
                (activeSession.phase === "executing" || activeSession.phase === "completed") && (
                  <div className="space-y-3">
                    <PomodoroStepRunner
                      session={activeSession}
                      lang={lang}
                      isSubmitting={completeStepMutation.isPending || stuckMutation.isPending}
                      stuckLimitMessage={stuckLimitMsg}
                      onCompleteStep={(stepId, elapsedSeconds, reflectionNote) =>
                        completeStepMutation.mutate({
                          sessionId: activeSession.id,
                          stepId,
                          elapsedSeconds,
                          reflectionNote,
                        })
                      }
                      onMarkStuck={(stepId) =>
                        stuckMutation.mutate({
                          sessionId: activeSession.id,
                          stepId,
                        })
                      }
                      onNewTask={handleResetToNewTask}
                      onBackToQuestions={
                        canReturnToSocraticFromPlan
                          ? () => navigateToTurn(sortedTurns[sortedTurns.length - 1].turn_number)
                          : undefined
                      }
                      onOpenMediaCoach={(mediaType, stepTitle) => {
                        setMonetizationMedia(mediaType)
                        setMonetizationTopic(stepTitle)
                        setMonetizationOpen(true)
                      }}
                    />
                  </div>
                )}
              </section>

              {activeSession.phase !== "chat" && (
                <SessionChatDrawer
                  sessionId={activeSession.id}
                  messages={activeSession.messages ?? []}
                  lang={lang}
                  variant="drawer"
                  open={chatOpen}
                  dockMediaQuery={
                    activeSession.phase === "executing"
                      ? "(min-width: 1480px)"
                      : "(min-width: 1280px)"
                  }
                  isSending={chatMutation.isPending}
                  errorMsg={chatErrorMsg}
                  hasSteps={(activeSession.steps?.length ?? 0) > 0}
                  onConvertToPlan={() => planMutation.mutate(activeSession.id)}
                  onNewTask={handleResetToNewTask}
                  onSend={(content, attached) =>
                    chatMutation.mutate({
                      sessionId: activeSession.id,
                      content,
                      attachments: attached,
                    })
                  }
                  onClose={() => setChatOpen(false)}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {showMethodsOnboarding && isLandingState && (
        <div
          role="region"
          aria-label={t.methodsOnboardingTitle}
          className="dusk-surface-elevated fixed right-4 bottom-4 z-30 w-[calc(100vw-2rem)] max-w-sm border border-accent/35 p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-inner bg-accent-tint text-accent">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="font-display text-sm font-medium text-ink">
                {t.methodsOnboardingTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={dismissMethodsOnboarding}
              aria-label={t.closeDialog}
              className="dusk-hover-tint inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-inner text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">{t.methodsOnboardingBody}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismissMethodsOnboarding()
                setTab("library")
              }}
              className="dusk-pill-primary inline-flex items-center gap-1.5 rounded-inner! px-3 py-1.5 text-xs"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.methodsOnboardingOpenBtn}</span>
            </button>
            <button
              type="button"
              onClick={dismissMethodsOnboarding}
              className="dusk-btn-ghost rounded-inner! px-3 py-1.5 text-xs"
            >
              {t.methodsOnboardingDismissBtn}
            </button>
          </div>
        </div>
      )}

      <TaskSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={(sessionId) => {
          setTab("workspace")
          selectSession(sessionId)
          setErrorMsg(null)
          setMobileHistoryOpen(false)
        }}
        lang={lang}
      />

      {activeSession && (
        <FrameworkDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          frameworks={frameworks}
          activeFrameworkId={activeSession.framework_id}
          canSwitch={activeSession.phase === "socratic"}
          isSwitching={switchFwMutation.isPending}
          onSwitch={(fwId) => switchFwMutation.mutate({ sessionId: activeSession.id, fwId })}
          lang={lang}
        />
      )}

      <MonetizationModal
        open={monetizationOpen}
        onClose={() => setMonetizationOpen(false)}
        lang={lang}
        tier={meQuery.data?.subscription?.tier ?? "free"}
        isUpdating={subscriptionMutation.isPending}
        activeTopic={monetizationTopic}
        initialMediaType={monetizationMedia}
        onChangeTier={(nextTier) => subscriptionMutation.mutate(nextTier)}
      />
    </div>
  )
}

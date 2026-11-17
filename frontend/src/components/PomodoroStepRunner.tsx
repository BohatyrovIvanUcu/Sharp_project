import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Headphones,
  Info,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Timer,
  Video,
} from "lucide-react"
import { COPY } from "@/lib/i18n"
import type { ActionStep, Language, ThinkingSession, TimerMode } from "@/types"

export const MAX_STEPS_PER_SESSION = 15

interface PomodoroStepRunnerProps {
  session: ThinkingSession
  lang: Language
  isSubmitting: boolean
  stuckLimitMessage?: string | null
  onCompleteStep: (stepId: string, elapsedSeconds: number, reflectionNote?: string) => void
  onMarkStuck: (stepId: string) => void
  onNewTask: () => void
  onBackToQuestions?: () => void
  onOpenMediaCoach?: (mediaType: "audio" | "video", stepTitle: string) => void
}

const TIMER_PRESETS: Record<TimerMode, { minutes: number; uk: string; en: string }> = {
  micro: { minutes: 2, uk: "2 хв", en: "2m" },
  sprint: { minutes: 5, uk: "5 хв", en: "5m" },
  pomodoro: { minutes: 25, uk: "25 хв", en: "25m" },
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

export function PomodoroStepRunner({
  session,
  lang,
  isSubmitting,
  stuckLimitMessage,
  onCompleteStep,
  onMarkStuck,
  onNewTask,
  onBackToQuestions,
  onOpenMediaCoach,
}: PomodoroStepRunnerProps) {
  const t = COPY[lang]
  const activeStep = useMemo(
    () => session.steps.find((s) => s.status === "active") ?? null,
    [session.steps],
  )
  const isAtStepLimit = session.steps.length >= MAX_STEPS_PER_SESSION
  const [showLimitNotice, setShowLimitNotice] = useState(false)

  const activeStepId = activeStep?.id
  const activeStepMinutes = activeStep?.duration_minutes
  const defaultPresetSeconds = activeStepMinutes ? Math.max(1, activeStepMinutes) * 60 : 5 * 60

  const [presetSeconds, setPresetSeconds] = useState(defaultPresetSeconds)
  const [remainingSeconds, setRemainingSeconds] = useState(defaultPresetSeconds)
  const [running, setRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [reflection, setReflection] = useState("")

  useEffect(() => {
    const nextTotal = activeStepMinutes ? Math.max(1, activeStepMinutes) * 60 : 300
    setPresetSeconds(nextTotal)
    setRemainingSeconds(nextTotal)
    setRunning(false)
    setElapsedSeconds(0)
    setReflection("")
  }, [activeStepId, activeStepMinutes])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const selectPreset = (minutes: number) => {
    const total = minutes * 60
    setRunning(false)
    setPresetSeconds(total)
    setRemainingSeconds(total)
  }

  const progressRatio = presetSeconds > 0 ? (presetSeconds - remainingSeconds) / presetSeconds : 0
  const progressPercent = Math.min(100, Math.max(0, Math.round(progressRatio * 100)))

  const renderStepBadge = (step: ActionStep) => {
    if (step.status === "active") {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-apricot-tint px-2 py-0.5 text-[11px] font-medium text-accent-2">
          <Timer className="h-3 w-3" aria-hidden="true" />
          <span>{t.stepActive}</span>
        </span>
      )
    }
    if (step.status === "completed") {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          <span>{t.stepDone}</span>
        </span>
      )
    }
    if (step.status === "split") {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-apricot-tint px-2 py-0.5 text-[11px] font-medium text-accent-2">
          <GitBranch className="h-3 w-3" aria-hidden="true" />
          <span>{t.stepSplit}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-paper-3 px-2 py-0.5 text-[11px] font-medium text-muted">
        <Lock className="h-3 w-3" aria-hidden="true" />
        <span>{t.stepLocked}</span>
      </span>
    )
  }

  return (
    <div className="space-y-3.5">
      {(session.summary || onBackToQuestions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {session.summary ? (
            <div className="min-w-[min(100%,18rem)] flex-1 border-l-2 border-accent pl-3.5">
              <div className="text-xs font-medium text-muted">{t.planTitle}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-ink sm:text-sm">
                {session.summary}
              </p>
            </div>
          ) : (
            <div />
          )}
          {onBackToQuestions && (
            <button
              type="button"
              onClick={onBackToQuestions}
              className="dusk-btn-ghost inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.backToQuestions}</span>
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          {session.phase === "completed" || !activeStep ? (
            <div className="dusk-surface p-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-pill bg-accent-tint text-accent">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-medium text-ink">{t.sessionDoneTitle}</h3>
              <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-ink-2">
                {t.sessionDoneDesc}
              </p>
              <button
                type="button"
                onClick={onNewTask}
                className="dusk-pill-primary mt-4 inline-flex items-center gap-2 px-5 py-2 text-sm"
              >
                {t.newTask}
              </button>
            </div>
          ) : (
            <div className="dusk-surface space-y-3.5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renderStepBadge(activeStep)}
                <span className="text-xs font-medium text-muted tabular-nums">
                  {activeStep.duration_minutes} {lang === "uk" ? "хв" : "min"}
                </span>
              </div>

              <div>
                <h3 className="font-display text-lg leading-snug font-medium text-ink sm:text-xl">
                  {activeStep.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-2 sm:text-sm">
                  {activeStep.description}
                </p>
              </div>

              <div className="dusk-surface-elevated space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-xl font-medium text-ink tabular-nums">
                      {formatClock(remainingSeconds)}
                    </span>
                    <span className="text-xs font-medium text-accent tabular-nums">
                      +{formatClock(elapsedSeconds)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(Object.keys(TIMER_PRESETS) as TimerMode[]).map((mode) => {
                      const preset = TIMER_PRESETS[mode]
                      const selected = presetSeconds === preset.minutes * 60
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => selectPreset(preset.minutes)}
                          className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "bg-accent text-accent-ink"
                              : "bg-paper text-ink-2 hover:bg-paper-2 hover:text-ink"
                          }`}
                        >
                          {preset[lang]}
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => setRunning((prev) => !prev)}
                      className="dusk-btn-ghost inline-flex items-center gap-1.5 border-accent/60 bg-paper px-3 py-1 text-xs text-accent hover:border-accent"
                    >
                      {running ? (
                        <>
                          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.pauseTimer}</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.startTimer}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRunning(false)
                        setRemainingSeconds(presetSeconds)
                      }}
                      aria-label={t.resetTimer}
                      title={t.resetTimer}
                      className="dusk-btn-ghost inline-flex h-7 w-7 items-center justify-center p-0 text-ink-2"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="h-1 w-full overflow-hidden rounded-pill bg-rule">
                  <div
                    className="h-full w-full origin-left rounded-pill bg-accent transition-transform duration-300"
                    style={{ transform: `scaleX(${progressPercent / 100})` }}
                  />
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (isSubmitting) return
                  onCompleteStep(
                    activeStep.id,
                    Math.max(elapsedSeconds, 10),
                    reflection.trim() || undefined,
                  )
                }}
                className="space-y-3 border-t border-rule pt-3"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor={`reflection-${activeStep.id}`}
                    className="block text-xs font-medium text-muted"
                  >
                    {t.reflectionLabel}
                  </label>
                  <input
                    id={`reflection-${activeStep.id}`}
                    type="text"
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder={t.reflectionPlaceholder}
                    className="dusk-field w-full px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="dusk-pill-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium whitespace-nowrap sm:text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t.completeStep}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (isAtStepLimit) {
                        setShowLimitNotice(true)
                        return
                      }
                      onMarkStuck(activeStep.id)
                    }}
                    className="dusk-btn-ghost inline-flex items-center justify-center gap-1.5 border-accent-2/50 px-3.5 py-2 text-xs font-medium whitespace-nowrap text-accent-2 hover:border-accent-2 sm:text-sm"
                  >
                    <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.stuckStep}</span>
                  </button>
                  {onOpenMediaCoach && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenMediaCoach("audio", activeStep.title)}
                        className="dusk-btn-ghost inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-ink-2 hover:text-ink"
                      >
                        <Headphones className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                        <span>{t.audioCoachBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenMediaCoach("video", activeStep.title)}
                        className="dusk-btn-ghost inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-ink-2 hover:text-ink"
                      >
                        <Video className="h-3.5 w-3.5 shrink-0 text-accent-2" aria-hidden="true" />
                        <span>{t.videoExplainerBtn}</span>
                      </button>
                    </>
                  )}
                </div>

                {(isAtStepLimit || showLimitNotice || Boolean(stuckLimitMessage)) && (
                  <div
                    role="status"
                    className="rounded-inner border border-accent-2/45 bg-apricot-tint/55 p-3.5 text-xs leading-relaxed text-ink"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-accent-2">
                      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{t.stepLimitReachedTitle}</span>
                    </div>
                    <p className="mt-1 text-ink-2">
                      {stuckLimitMessage || t.stepLimitReachedBody}
                    </p>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>

        <aside
          aria-label={t.planTitle}
          className="dusk-surface p-3.5 sm:p-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto"
        >
          <div className="mb-2.5">
            <h4 className="font-display text-sm font-medium text-ink">{t.planTitle}</h4>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{t.planRuleHint}</p>
          </div>
          <ol className="divide-y divide-rule border-t border-rule">
            {session.steps.map((step, index) => {
              const isLocked = step.status === "locked"
              const isSplit = step.status === "split"
              return (
                <li
                  key={step.id}
                  className={`py-2.5 transition-colors ${
                    step.status === "active"
                      ? "-mx-2 rounded-inner bg-apricot-tint/45 px-2"
                      : isLocked || isSplit
                        ? "opacity-75"
                        : ""
                  } ${step.parent_step_id ? "ml-3 border-l-2 border-accent pl-2.5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[11px] font-medium text-muted tabular-nums">
                        {index + 1}
                      </span>
                      <span
                        className={`text-xs leading-snug font-medium ${
                          isSplit ? "line-through text-muted" : "text-ink"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 pl-4">
                    {renderStepBadge(step)}
                    <span className="text-[11px] text-muted tabular-nums">
                      {step.duration_minutes} {lang === "uk" ? "хв" : "m"}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
    </div>
  )
}

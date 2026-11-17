import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Brain,
  ChevronDown,
  FileText,
  Mic,
  Paperclip,
  Plus,
  Send,
  X,
  Zap,
} from "lucide-react"
import {
  ACCEPTED_FILE_TYPES,
  formatBytes,
  readAttachmentsFromFileList,
} from "@/lib/attachments"
import { COPY } from "@/lib/i18n"
import { useVoiceInput } from "@/lib/voice"
import type {
  FrameworkId,
  FrameworkItem,
  Language,
  SessionAttachmentInput,
  SessionMode,
} from "@/types"

interface TaskComposerProps {
  lang: Language
  mode: SessionMode
  onChangeMode: (mode: SessionMode) => void
  problem: string
  onChangeProblem: (value: string) => void
  selectedFramework: FrameworkId | "auto"
  onSelectFramework: (value: FrameworkId | "auto") => void
  frameworks: FrameworkItem[]
  attachments: SessionAttachmentInput[]
  onChangeAttachments: (next: SessionAttachmentInput[]) => void
  isSubmitting: boolean
  onSubmitSession: (problemText: string, attached: SessionAttachmentInput[]) => void
  onOpenLibrary?: () => void
}

export function TaskComposer({
  lang,
  mode,
  onChangeMode,
  problem,
  onChangeProblem,
  selectedFramework,
  onSelectFramework,
  frameworks,
  attachments,
  onChangeAttachments,
  isSubmitting,
  onSubmitSession,
  onOpenLibrary,
}: TaskComposerProps) {
  const t = COPY[lang]
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeMethodBtnRef = useRef<HTMLButtonElement>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [methodsHighlighted, setMethodsHighlighted] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const { isListening, toggleListening, stopListening } = useVoiceInput({
    lang,
    onChange: (nextValue) => {
      setLocalError(null)
      onChangeProblem(nextValue)
    },
    onUnsupported: () => setLocalError(t.voiceNotSupported),
  })

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  const isExpanded = focused || isListening || problem.trim().length > 0 || attachments.length > 0

  const selectedMethodLabel =
    selectedFramework === "auto"
      ? `${t.methodChipPrefix}: ${t.autoSelectMethod}`
      : (frameworks.find((fw) => fw.id === selectedFramework)?.name[lang] ?? selectedFramework)

  const focusInput = () => {
    setFocused(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
    focusInput()
  }

  const highlightMethodsSection = () => {
    setFocused(true)
    setMethodsHighlighted(true)
    textareaRef.current?.focus({ preventScroll: true })
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current)
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setMethodsHighlighted(false)
    }, 2600)
    requestAnimationFrame(() => {
      activeMethodBtnRef.current?.focus({ preventScroll: true })
    })
  }

  const chooseFramework = (nextId: FrameworkId | "auto") => {
    onSelectFramework(nextId)
    setMethodsHighlighted(false)
    focusInput()
  }

  const handleBlurCapture = () => {
    requestAnimationFrame(() => {
      const el = wrapperRef.current
      if (!el) return
      if (!el.contains(document.activeElement)) {
        setMethodsHighlighted(false)
        setFocused(false)
      }
    })
  }

  const appendFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const { next, error } = await readAttachmentsFromFileList(
      fileList,
      attachments,
      t.attachmentTooLarge,
    )
    setLocalError(error)
    onChangeAttachments(next)
    focusInput()
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    stopListening()
    const trimmed = problem.trim()
    if (trimmed.length < 3 && attachments.length === 0) {
      setLocalError(t.attachmentNeedInput)
      focusInput()
      return
    }
    setLocalError(null)
    setMethodsHighlighted(false)
    onSubmitSession(trimmed, attachments)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.currentTarget.form?.requestSubmit()
    } else if (e.key === "Escape") {
      setMethodsHighlighted(false)
      if (!problem.trim() && attachments.length === 0) {
        setFocused(false)
        e.currentTarget.blur()
      }
    }
  }

  const activePlaceholder = mode === "chat" ? t.chatStarterPlaceholder : t.problemPlaceholder
  const submitLabel =
    mode === "chat"
      ? isSubmitting
        ? t.chatStarting
        : t.chatStartAction
      : isSubmitting
        ? t.analyzing
        : t.startDiagnosis

  return (
    <div
      ref={wrapperRef}
      onBlurCapture={handleBlurCapture}
      className="mx-auto flex w-full flex-col items-center"
    >
      <form
        onSubmit={handleFormSubmit}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void appendFiles(e.dataTransfer.files)
        }}
        data-expanded={isExpanded ? "true" : "false"}
        className={`dusk-glass-pane dusk-composer-shell relative w-full ${
          dragging ? "ring-2 ring-accent" : ""
        }`}
      >
        <input
          ref={fileInputRef}
          id="task-attachments"
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="visually-hidden"
          onChange={(e) => {
            void appendFiles(e.target.files)
            e.target.value = ""
          }}
        />

        {dragging && (
          <div className="mb-2 rounded-inner border border-dashed border-accent bg-accent-tint/70 px-3 py-2 text-center text-xs font-medium text-accent">
            {t.dropFilesHint}
          </div>
        )}

        {localError && (
          <div
            role="alert"
            className="mb-2 rounded-inner border border-error bg-error-tint px-3 py-1.5 text-xs text-ink"
          >
            {localError}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {attachments.map((file, idx) => (
              <span
                key={`${file.name}-${idx}`}
                className="dusk-pill-tag inline-flex max-w-full items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs text-ink"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate font-medium">{file.name}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {formatBytes(file.size_bytes)}
                </span>
                <button
                  type="button"
                  aria-label={`${t.removeAttachment} ${file.name}`}
                  onClick={() =>
                    onChangeAttachments(attachments.filter((_, itemIdx) => itemIdx !== idx))
                  }
                  className="rounded-pill p-0.5 text-muted transition-colors hover:text-ink"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!isExpanded && (
            <button
              type="button"
              onClick={openFilePicker}
              aria-label={t.attachFile}
              title={t.attachFile}
              className="dusk-hover-tint inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-inner text-ink-2 hover:text-ink"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <div key="problem-field" className="min-w-0 flex-1">
            <label htmlFor="problem-input" className="visually-hidden">
              {t.problemLabel}
            </label>
            <textarea
              ref={textareaRef}
              id="problem-input"
              name="problem"
              rows={1}
              data-expanded={isExpanded ? "true" : "false"}
              value={problem}
              onFocus={() => setFocused(true)}
              onChange={(e) => {
                setLocalError(null)
                setMethodsHighlighted(false)
                onChangeProblem(e.target.value)
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder={activePlaceholder}
              className={`dusk-composer-input block w-full resize-none border-0 bg-transparent text-ink placeholder:text-muted ${
                isExpanded
                  ? "px-1 py-1.5 leading-relaxed"
                  : "overflow-hidden py-2 leading-normal whitespace-nowrap"
              }`}
            />
          </div>

          {!isExpanded && (
            <div className="flex shrink-0 items-center gap-1.5">
              {mode === "task" && (
                <button
                  type="button"
                  onClick={highlightMethodsSection}
                  aria-label={selectedMethodLabel}
                  title={t.autoMethodHint}
                  className="dusk-chip inline-flex min-h-9 items-center gap-1.5 rounded-inner px-2.5 py-1 text-xs font-medium text-ink"
                >
                  <Brain className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="hidden sm:inline">{selectedMethodLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-ink-2" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  focusInput()
                  toggleListening(problem)
                }}
                aria-label={isListening ? t.voiceStop : t.voiceStart}
                title={isListening ? t.voiceStop : t.voiceStart}
                className="dusk-hover-tint inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-inner text-ink-2 hover:text-ink"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                aria-label={submitLabel}
                className="dusk-pill-primary inline-flex h-10 w-10 items-center justify-center rounded-inner! p-0"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <div
          data-open={isExpanded ? "true" : "false"}
          aria-hidden={!isExpanded}
          className="dusk-composer-subgrid"
        >
          <div>
            <div className="dusk-glass-row-rule mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="dusk-chip inline-flex min-h-9 items-center gap-1.5 rounded-inner px-3 py-1.5 text-xs font-medium text-ink"
                >
                  <Paperclip className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{t.attachFile}</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    focusInput()
                    toggleListening(problem)
                  }}
                  aria-pressed={isListening}
                  aria-label={isListening ? t.voiceStop : t.voiceStart}
                  title={isListening ? t.voiceStop : t.voiceStart}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-inner border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isListening
                      ? "border-accent bg-accent-tint text-accent"
                      : "dusk-chip text-ink"
                  }`}
                >
                  <Mic
                    className={`h-3.5 w-3.5 ${
                      isListening ? "animate-pulse text-accent" : "text-accent"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{isListening ? t.voiceListening : t.voiceStart}</span>
                </button>

                {mode === "task" && (
                  <button
                    type="button"
                    onClick={highlightMethodsSection}
                    title={t.autoMethodHint}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-inner border px-3 py-1.5 text-xs font-medium transition-colors ${
                      methodsHighlighted
                        ? "border-accent bg-accent-tint text-ink"
                        : "dusk-chip text-ink"
                    }`}
                  >
                    <Brain className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>{selectedMethodLabel}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-ink-2 transition-transform ${
                        methodsHighlighted ? "rotate-180 text-accent" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="dusk-pill-primary inline-flex min-h-9 items-center gap-1.5 rounded-inner! px-4 py-1.5 text-xs sm:text-sm"
              >
                {mode === "chat" ? (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{submitLabel}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      <div
        role="radiogroup"
        aria-label={t.composerModeLabel}
        className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5"
      >
        {(["chat", "task"] as const).map((item) => {
          const isActive = mode === item
          const label = item === "chat" ? t.composerModeChat : t.composerModeTask
          return (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => {
                onChangeMode(item)
                setMethodsHighlighted(false)
              }}
              className={`min-h-9 rounded-pill px-4 py-1 text-xs font-medium transition-colors sm:text-sm ${
                isActive
                  ? "dusk-chip-active text-ink shadow-xs"
                  : "dusk-hover-soft border border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div
        data-open={isExpanded && mode === "task" ? "true" : "false"}
        aria-hidden={!isExpanded || mode !== "task"}
        className="dusk-composer-drawer mt-2.5 w-full max-w-[40rem]"
      >
        <div>
          <div className="dusk-surface p-2.5">
            <div
              data-highlighted={methodsHighlighted ? "true" : "false"}
              className={`rounded-inner border p-2 transition-colors ${
                methodsHighlighted
                  ? "border-accent/80 bg-accent-tint/45"
                  : "border-transparent bg-transparent"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-xs font-medium transition-colors ${
                    methodsHighlighted ? "text-accent" : "text-muted"
                  }`}
                >
                  {t.chooseInitialMethod}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {methodsHighlighted && (
                    <span className="rounded-pill bg-accent/18 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {t.methodHighlightPrompt}
                    </span>
                  )}
                  {onOpenLibrary && (
                    <button
                      type="button"
                      onClick={onOpenLibrary}
                      className="dusk-hover-tint inline-flex items-center gap-1 rounded-inner px-1.5 py-0.5 text-[11px] font-medium text-accent hover:text-ink"
                    >
                      <BookOpen className="h-3 w-3" aria-hidden="true" />
                      <span>{t.openMethodLibraryLink}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <p className="mb-2 text-[11px] text-ink-2">{t.autoMethodHint}</p>
              <div
                role="radiogroup"
                aria-label={t.chooseInitialMethod}
                className="flex flex-wrap gap-1.5"
              >
                <button
                  ref={selectedFramework === "auto" ? activeMethodBtnRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={selectedFramework === "auto"}
                  onClick={() => chooseFramework("auto")}
                  className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedFramework === "auto"
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-rule bg-paper text-ink-2 hover:border-muted hover:text-ink"
                  }`}
                >
                  {t.autoSelectMethod}
                </button>
                {frameworks.map((fw) => {
                  const isSelected = selectedFramework === fw.id
                  return (
                    <button
                      key={fw.id}
                      ref={isSelected ? activeMethodBtnRef : undefined}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => chooseFramework(fw.id)}
                      className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-rule bg-paper text-ink-2 hover:border-muted hover:text-ink"
                      }`}
                    >
                      {fw.name[lang]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

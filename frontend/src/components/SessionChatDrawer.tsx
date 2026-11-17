import { Fragment, useEffect, useId, useRef, useState } from "react"
import { CheckCircle2, FileText, MessageSquare, Mic, Plus, Send, Sparkles, X, Zap } from "lucide-react"
import {
  ACCEPTED_FILE_TYPES,
  formatBytes,
  readAttachmentsFromFileList,
} from "@/lib/attachments"
import { COPY } from "@/lib/i18n"
import { useVoiceInput } from "@/lib/voice"
import type { Language, SessionAttachmentInput, SessionMessage } from "@/types"

function renderFormattedText(content: string) {
  const parts = content.split(/(\*\*[^*\n]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={idx}>{part}</Fragment>
  })
}

interface SessionChatDrawerProps {
  sessionId: string
  messages: SessionMessage[]
  lang: Language
  variant: "inline" | "drawer"
  open?: boolean
  dockMediaQuery?: string
  isSending: boolean
  errorMsg?: string | null
  hasSteps?: boolean
  onSend: (content: string, attachments?: SessionAttachmentInput[]) => void
  onConvertToPlan?: () => void
  onNewTask?: () => void
  onClose?: () => void
}

function useIsWideViewport(query = "(min-width: 1280px)"): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])

  return matches
}

export function SessionChatDrawer({
  sessionId,
  messages,
  lang,
  variant,
  open = true,
  dockMediaQuery = "(min-width: 1280px)",
  isSending,
  errorMsg,
  hasSteps = false,
  onSend,
  onConvertToPlan,
  onNewTask,
  onClose,
}: SessionChatDrawerProps) {
  const t = COPY[lang]
  const inputId = useId()
  const isWideViewport = useIsWideViewport(dockMediaQuery)
  const [draft, setDraft] = useState("")
  const [pendingAttachments, setPendingAttachments] = useState<SessionAttachmentInput[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { isListening, toggleListening, stopListening } = useVoiceInput({
    lang,
    onChange: (nextValue) => {
      setFileError(null)
      setDraft(nextValue)
    },
    onUnsupported: () => setFileError(t.voiceNotSupported),
  })

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const lastMessageKey = lastMessage ? `${lastMessage.id}:${lastMessage.content.length}` : ""
  const isConversationComplete = Boolean(
    lastMessage && lastMessage.role === "assistant" && lastMessage.conversation_complete,
  )

  useEffect(() => {
    setDraft("")
    setPendingAttachments([])
    setFileError(null)
  }, [sessionId])

  useEffect(() => {
    if (variant === "drawer" && !open) return
    const scrollToBottom = () => {
      const el = listRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
      if (variant === "inline") {
        if (typeof bottomAnchorRef.current?.scrollIntoView === "function") {
          bottomAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
        }
        if (typeof document !== "undefined" && document.documentElement) {
          document.documentElement.scrollTop = document.documentElement.scrollHeight
        }
      }
    }
    scrollToBottom()
    const frame =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(scrollToBottom)
        : null
    return () => {
      if (frame !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [messages.length, lastMessageKey, isSending, open, variant, sessionId])

  useEffect(() => {
    if (variant !== "drawer" || !open) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [variant, open, onClose])

  if (variant === "drawer" && !open) {
    return null
  }

  const appendFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const { next, error } = await readAttachmentsFromFileList(
      fileList,
      pendingAttachments,
      t.attachmentTooLarge,
    )
    setFileError(error)
    setPendingAttachments(next)
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isSending) return
    stopListening()
    const trimmed = draft.trim()
    if (!trimmed && pendingAttachments.length === 0) return
    const attached = pendingAttachments.length > 0 ? pendingAttachments : undefined
    setDraft("")
    setPendingAttachments([])
    setFileError(null)
    onSend(trimmed, attached)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      event.currentTarget.form?.requestSubmit()
    }
  }

  const isOverlayDrawer = variant === "drawer" && !isWideViewport
  const isInline = variant === "inline"

  const threadContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "drawer" && (
        <div className="flex items-start justify-between gap-2 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <h3 className="font-display text-sm font-medium text-ink">{t.assistantChatTitle}</h3>
            </div>
            <p className="mt-0.5 text-xs text-muted">{t.assistantChatSubtitle}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeDialog}
              className="dusk-hover-tint inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-inner text-muted hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className={
          isInline
            ? "flex-1 space-y-5 py-4"
            : "min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3"
        }
      >
        {messages.length === 0 ? (
          <div
            className={
              isInline
                ? "max-w-[60ch] text-sm leading-relaxed text-ink-2"
                : "rounded-inner border border-rule/80 bg-paper-2/60 p-3.5 text-xs leading-relaxed text-ink-2"
            }
          >
            <div className="mb-1 flex items-center gap-1.5 font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.assistantChatTitle}</span>
            </div>
            <p>{t.assistantChatEmpty}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user"
            if (isInline) {
              return isUser ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="dusk-chip-active max-w-[82%] rounded-inner px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
                    {renderFormattedText(msg.content)}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="max-w-[68ch]">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.assistantRoleLabel}</span>
                  </div>
                  <div className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink sm:text-[15px]">
                    {renderFormattedText(msg.content)}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <span className="mb-1 px-1 text-[11px] font-medium text-muted">
                  {isUser ? t.assistantYouLabel : t.assistantRoleLabel}
                </span>
                <div
                  className={`max-w-[90%] rounded-inner px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                    isUser
                      ? "border border-accent/35 bg-accent-tint/65 text-ink"
                      : "border border-rule bg-paper-2/95 text-ink"
                  }`}
                >
                  {renderFormattedText(msg.content)}
                </div>
              </div>
            )
          })
        )}

        {isSending && (
          <div className="flex items-center gap-2 px-1 text-xs text-accent">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
            <span>{t.assistantChatSending}</span>
          </div>
        )}

        {isConversationComplete && !isSending && (
          <div
            role="status"
            className="rounded-inner border border-accent/40 bg-accent-tint/50 p-3.5 text-xs leading-relaxed text-ink"
          >
            <div className="flex items-center gap-1.5 font-medium text-accent">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.chatCompleteTitle}</span>
            </div>
            <p className="mt-1 text-ink-2">{t.chatCompleteDesc}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {hasSteps && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="dusk-pill-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.chatCompleteToSteps}</span>
                </button>
              ) : onConvertToPlan ? (
                <button
                  type="button"
                  onClick={onConvertToPlan}
                  className="dusk-pill-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.convertToPlanBtn}</span>
                </button>
              ) : null}
              {onNewTask && (
                <button
                  type="button"
                  onClick={onNewTask}
                  className="dusk-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.newTask}</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={bottomAnchorRef} aria-hidden="true" />
      </div>

      {(errorMsg || fileError) && (
        <div
          role="alert"
          className={`mb-2 rounded-inner border border-error bg-error-tint px-3 py-2 text-xs text-ink ${
            isInline ? "" : "mx-3.5"
          }`}
        >
          {fileError || errorMsg}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
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
        className={
          isInline
            ? "sticky bottom-0 z-20 mt-auto pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
            : isOverlayDrawer
              ? "border-t border-rule px-3.5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
              : "border-t border-rule px-3.5 pt-3 pb-3.5"
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          aria-label={t.attachFile}
          className="visually-hidden"
          onChange={(e) => {
            void appendFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <label htmlFor={inputId} className="visually-hidden">
          {t.assistantChatTitle}
        </label>
        <div
          className={
            isInline
              ? `dusk-glass-pane flex flex-col gap-2 rounded-inner! p-2.5 ${
                  dragging ? "ring-2 ring-accent" : ""
                }`
              : `flex flex-col gap-2 ${dragging ? "rounded-inner ring-2 ring-accent" : ""}`
          }
        >
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {pendingAttachments.map((file, idx) => (
                <span
                  key={`${file.name}-${idx}`}
                  className="dusk-pill-tag inline-flex max-w-full items-center gap-1.5 rounded-inner px-2.5 py-1 text-xs text-ink"
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
                      setPendingAttachments((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                    }
                    className="rounded-inner p-0.5 text-muted transition-colors hover:text-ink"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={isSending}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.attachFile}
              title={t.attachFile}
              className="dusk-hover-tint inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-inner text-ink-2 hover:text-ink disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <textarea
              ref={inputRef}
              id={inputId}
              rows={isInline ? 1 : 2}
              value={draft}
              disabled={isSending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.assistantChatPlaceholder}
              className={
                isInline
                  ? "dusk-composer-input min-h-[2.5rem] min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-snug text-ink placeholder:text-muted focus-visible:outline-none"
                  : "dusk-field min-h-[2.75rem] min-w-0 flex-1 resize-none px-3 py-2 text-sm leading-snug"
              }
            />
            <button
              type="button"
              disabled={isSending}
              onClick={() => {
                inputRef.current?.focus({ preventScroll: true })
                toggleListening(draft)
              }}
              aria-pressed={isListening}
              aria-label={isListening ? t.voiceStop : t.voiceStart}
              title={isListening ? t.voiceStop : t.voiceStart}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-inner transition-colors disabled:opacity-50 ${
                isListening
                  ? "border border-accent bg-accent-tint text-accent"
                  : "dusk-hover-tint text-ink-2 hover:text-ink"
              }`}
            >
              <Mic className={`h-4 w-4 ${isListening ? "animate-pulse" : ""}`} aria-hidden="true" />
            </button>
            <button
              type="submit"
              disabled={isSending || (!draft.trim() && pendingAttachments.length === 0)}
              aria-label={t.assistantChatSend}
              title={t.assistantChatSend}
              className={
                variant === "drawer"
                  ? "dusk-pill-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-inner! p-0"
                  : "dusk-pill-primary inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-inner! px-3.5 py-2 text-xs font-medium sm:text-sm"
              }
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {variant !== "drawer" && <span>{t.assistantChatSend}</span>}
            </button>
          </div>
        </div>
      </form>
    </div>
  )

  if (variant === "inline") {
    return <div className="flex min-h-0 flex-1 flex-col">{threadContent}</div>
  }

  if (isOverlayDrawer) {
    return (
      <>
        <div
          className="dusk-backdrop fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t.assistantChatTitle}
          className="dusk-sidebar fixed inset-y-0 right-0 z-50 flex h-[100svh] w-full max-w-[26rem] flex-col border-l border-rule shadow-2xl"
        >
          {threadContent}
        </aside>
      </>
    )
  }

  return (
    <aside
      aria-label={t.assistantChatTitle}
      className="dusk-surface sticky top-4 flex h-[calc(100vh-3rem)] min-h-[28rem] w-[360px] shrink-0 flex-col overflow-hidden xl:w-[390px]"
    >
      {threadContent}
    </aside>
  )
}

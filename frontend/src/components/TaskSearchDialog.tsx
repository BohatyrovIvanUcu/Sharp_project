import { useEffect, useId, useRef, useState } from "react"
import { MessageCircle, X } from "lucide-react"
import { COPY } from "@/lib/i18n"
import type { Language, SessionSummary } from "@/types"

interface TaskSearchDialogProps {
  open: boolean
  onClose: () => void
  sessions: SessionSummary[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  lang: Language
}

/**
 * Clean ChatGPT-style modal for searching sessions by task title or description.
 */
export function TaskSearchDialog({
  open,
  onClose,
  sessions,
  selectedSessionId,
  onSelectSession,
  lang,
}: TaskSearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [query, setQuery] = useState("")
  const t = COPY[lang]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setQuery("")
      dialog.showModal()
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => {
      dialog.returnValue = ""
      onClose()
    }

    let pressedOutside = false
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect()
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
    }
    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e)
    }
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close()
      }
      pressedOutside = false
    }

    dialog.addEventListener("close", handleClose)
    dialog.addEventListener("pointerdown", handlePointerDown)
    dialog.addEventListener("pointerup", handlePointerUp)
    return () => {
      dialog.removeEventListener("close", handleClose)
      dialog.removeEventListener("pointerdown", handlePointerDown)
      dialog.removeEventListener("pointerup", handlePointerUp)
    }
  }, [onClose])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredSessions = normalizedQuery
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(normalizedQuery) ||
          s.raw_problem.toLowerCase().includes(normalizedQuery),
      )
    : sessions

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(92vw,36rem)] overflow-hidden rounded-card border border-rule bg-paper-2 p-0 text-ink shadow-[var(--shadow-card)]"
    >
      <h2 id={titleId} className="sr-only">
        {t.searchTasksLabel}
      </h2>

      <div className="flex items-center gap-2 border-b border-rule px-5 py-3.5">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchTasksPlaceholder}
          aria-label={t.searchTasksLabel}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t.closeDialog}
          className="dusk-hover-tint inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[22rem] overflow-y-auto px-3 py-3">
        {open && (
          <>
            <div className="px-3 pb-2 text-xs font-medium text-muted">
              {normalizedQuery ? t.searchResultsHeading : t.recentTasksHeading}
            </div>

            {sessions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">{t.noSessionsYet}</p>
            ) : filteredSessions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">{t.noMatchingSessions}</p>
            ) : (
              <ul className="space-y-0.5">
                {filteredSessions.map((s) => {
                  const isSelected = s.id === selectedSessionId
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSession(s.id)
                          dialogRef.current?.close()
                        }}
                        className={`flex w-full items-center gap-3 rounded-inner px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? "dusk-chip-active text-ink"
                            : "dusk-hover-soft text-ink-2 hover:text-ink"
                        }`}
                      >
                        <MessageCircle className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}

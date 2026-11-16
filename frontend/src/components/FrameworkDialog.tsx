import { useEffect, useId, useRef } from "react"
import { ArrowRightLeft, ShieldAlert, Sparkles, X } from "lucide-react"
import { COPY } from "@/lib/i18n"
import type { FrameworkId, FrameworkItem, Language } from "@/types"

interface FrameworkDialogProps {
  open: boolean
  onClose: () => void
  frameworks: FrameworkItem[]
  activeFrameworkId: FrameworkId
  canSwitch: boolean
  isSwitching: boolean
  onSwitch: (frameworkId: FrameworkId) => void
  lang: Language
}

export function FrameworkDialog({
  open,
  onClose,
  frameworks,
  activeFrameworkId,
  canSwitch,
  isSwitching,
  onSwitch,
  lang,
}: FrameworkDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = COPY[lang]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
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

  const activeItem = frameworks.find((f) => f.id === activeFrameworkId) ?? frameworks[0]

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[86vh] w-[min(92vw,48rem)] overflow-y-auto rounded-card bg-paper-2 p-0 text-ink shadow-[var(--shadow-card)]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper-2 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-pill bg-accent" aria-hidden="true" />
          <h2 id={titleId} className="font-display text-lg font-medium text-ink">
            {activeItem ? activeItem.name[lang] : t.libraryTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t.closeDialog}
          className="dusk-btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-6 p-6">
        {activeItem && (
          <div className="dusk-surface-elevated space-y-4 rounded-inner border border-rule p-5">
            <p className="text-sm font-medium text-ink">{activeItem.tagline[lang]}</p>
            <dl className="divide-y divide-rule border-t border-rule text-sm">
              <div className="py-3">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{t.howItWorks}</span>
                </dt>
                <dd className="mt-1 text-ink-2">{activeItem.cognitive_mechanism[lang]}</dd>
              </div>
              <div className="py-3">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <ShieldAlert className="h-3.5 w-3.5 text-error" aria-hidden="true" />
                  <span>{t.antiPattern}</span>
                </dt>
                <dd className="mt-1 text-ink-2">{activeItem.anti_pattern[lang]}</dd>
              </div>
            </dl>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-medium text-muted">{t.libraryTitle}</h3>
          <div className="divide-y divide-rule border-t border-b border-rule">
            {frameworks.map((fw) => {
              const isCurrent = fw.id === activeFrameworkId
              return (
                <div
                  key={fw.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-pill ${
                          isCurrent ? "bg-accent" : "bg-rule"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-ink">{fw.name[lang]}</span>
                      {isCurrent && (
                        <span className="text-xs font-medium text-accent">{t.activeMethodTag}</span>
                      )}
                    </div>
                    <p className="mt-1 pl-4 text-xs text-muted">{fw.when_to_use[lang]}</p>
                  </div>
                  {canSwitch && !isCurrent && (
                    <button
                      type="button"
                      disabled={isSwitching}
                      onClick={() => onSwitch(fw.id)}
                      className="dusk-btn-ghost inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.switchToMethodBtn}</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </dialog>
  )
}

import { useState } from "react"
import { CheckCircle2, Headphones, Lock, Play, Sparkles, Video, X } from "lucide-react"
import { COPY } from "@/lib/i18n"
import type { Language, SubscriptionTier } from "@/types"

interface MonetizationModalProps {
  open: boolean
  onClose: () => void
  lang: Language
  tier: SubscriptionTier
  isUpdating: boolean
  activeTopic?: string | null
  initialMediaType?: "audio" | "video"
  onChangeTier: (tier: SubscriptionTier) => void
}

export function MonetizationModal({
  open,
  onClose,
  lang,
  tier,
  isUpdating,
  activeTopic,
  initialMediaType = "audio",
  onChangeTier,
}: MonetizationModalProps) {
  const t = COPY[lang]
  const [selectedMedia, setSelectedMedia] = useState<"audio" | "video">(initialMediaType)
  const [playingPreview, setPlayingPreview] = useState(false)

  if (!open) return null

  const isPro = tier === "pro"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="dusk-backdrop fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.monetizationTitle}
        className="dusk-surface-elevated relative z-10 w-full max-w-lg space-y-4 p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-pill bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isPro ? t.proBadge : t.freeBadge}</span>
            </div>
            <h2 className="mt-2 font-display text-lg leading-snug font-medium text-ink sm:text-xl">
              {t.monetizationTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-2 sm:text-sm">
              {t.monetizationSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeDialog}
            className="dusk-hover-tint inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-inner text-muted hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelectedMedia("audio")
              setPlayingPreview(false)
            }}
            className={`rounded-inner border p-3.5 text-left transition-colors ${
              selectedMedia === "audio"
                ? "border-accent bg-accent-tint/50"
                : "border-rule bg-paper hover:border-accent/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Headphones className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{t.audioCoachBtn}</span>
              </span>
              {!isPro && <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{t.audioCoachDesc}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedMedia("video")
              setPlayingPreview(false)
            }}
            className={`rounded-inner border p-3.5 text-left transition-colors ${
              selectedMedia === "video"
                ? "border-accent bg-accent-tint/50"
                : "border-rule bg-paper hover:border-accent/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Video className="h-4 w-4 text-accent-2" aria-hidden="true" />
                <span>{t.videoExplainerBtn}</span>
              </span>
              {!isPro && <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{t.videoExplainerDesc}</p>
          </button>
        </div>

        {isPro ? (
          <div className="rounded-inner border border-accent/35 bg-paper p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-ink">
                {selectedMedia === "audio" ? t.audioCoachTitle : t.videoExplainerTitle}
                {activeTopic ? ` — «${activeTopic}»` : ""}
              </div>
              <button
                type="button"
                onClick={() => setPlayingPreview((prev) => !prev)}
                className="dusk-pill-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{playingPreview ? t.pauseTimer : t.startTimer}</span>
              </button>
            </div>
            {playingPreview && (
              <p className="mt-2 flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.mediaReadyHint}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-inner border border-rule bg-paper-2/70 p-3.5 text-xs text-ink-2">
            {t.proRequiredHint}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
          {isPro ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onChangeTier("free")}
              className="dusk-btn-ghost px-3.5 py-2 text-xs"
            >
              {t.switchToFreeBtn}
            </button>
          ) : (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onChangeTier("pro")}
              className="dusk-pill-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{t.unlockProBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="dusk-btn-ghost px-3.5 py-2 text-xs"
          >
            {t.closeDialog}
          </button>
        </div>
      </div>
    </div>
  )
}

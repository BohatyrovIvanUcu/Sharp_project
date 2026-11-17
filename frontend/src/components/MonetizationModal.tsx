import { Check, CheckCircle2, Minus, Sparkles, X } from "lucide-react"
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
  onChangeTier,
}: MonetizationModalProps) {
  const t = COPY[lang]

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
        className="dusk-surface-elevated relative z-10 max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto p-5 shadow-2xl sm:p-6"
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

        {/* Two-column plan comparison: Left = Free Tier, Right = Paid Tier (Sharp Pro) */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Left Column: Free Tier */}
          <div
            className={`flex flex-col justify-between rounded-inner border p-4 ${
              !isPro ? "border-ink/25 bg-paper" : "border-rule bg-paper-2/60"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-medium text-ink">
                  {t.freeTierTitle}
                </h3>
                <span className="rounded-pill bg-paper-3 px-2.5 py-0.5 text-xs font-medium text-ink-2">
                  {t.freeTierPrice}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t.freeTierSub}
              </p>

              <ul className="mt-3.5 space-y-2 text-xs leading-relaxed text-ink-2">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                  <span>{t.freeFeature1}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                  <span>{t.freeFeature2}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                  <span>{t.freeFeature3}</span>
                </li>
                <li className="flex items-start gap-2 text-muted">
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span>{t.freeFeature4}</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 border-t border-rule pt-3">
              {!isPro ? (
                <div className="inline-flex w-full items-center justify-center rounded-pill border border-rule bg-paper-2 py-2 text-xs font-medium text-muted">
                  {t.currentPlanBadge}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onChangeTier("free")}
                  className="dusk-btn-ghost w-full px-3.5 py-2 text-xs"
                >
                  {t.switchToFreeBtn}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Paid Tier (Sharp Pro) */}
          <div
            className={`flex flex-col justify-between rounded-inner border p-4 ${
              isPro
                ? "border-accent bg-accent-tint/25"
                : "border-accent/50 bg-paper shadow-sm"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 font-display text-base font-medium text-ink">
                  <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                  <span>{t.proTierTitle}</span>
                </h3>
                <span className="rounded-pill bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent">
                  {t.proTierPrice}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {t.proTierSub}
              </p>

              <ul className="mt-3.5 space-y-2 text-xs leading-relaxed text-ink">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{t.proFeature1}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{t.proFeature2}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{t.proFeature3}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{t.proFeature4}</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 border-t border-rule pt-3">
              {isPro ? (
                <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-pill bg-accent-tint py-2 text-xs font-medium text-accent">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.currentPlanBadge}</span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onChangeTier("pro")}
                  className="dusk-pill-primary inline-flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>{t.unlockProBtn}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

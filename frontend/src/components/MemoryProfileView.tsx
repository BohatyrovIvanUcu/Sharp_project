import { useState } from "react"
import { ChevronDown, Info } from "lucide-react"
import { BLOCKER_LABELS, COPY } from "@/lib/i18n"
import type { BlockerType, FrameworkItem, Language, MemoryOverview } from "@/types"

interface MemoryProfileViewProps {
  overview: MemoryOverview | undefined
  frameworks: FrameworkItem[]
  lang: Language
}

export function MemoryProfileView({ overview, frameworks, lang }: MemoryProfileViewProps) {
  const t = COPY[lang]
  const [showBlockerHelp, setShowBlockerHelp] = useState(false)
  const profile = overview?.cognitive_profile
  const memories = overview?.memories ?? []

  const blockerEntries = Object.entries(profile?.blocker_counts ?? {}).sort((a, b) => b[1] - a[1])
  const maxBlockerCount = blockerEntries[0]?.[1] ?? 1

  const frameworkEntries = Object.entries(profile?.effective_frameworks ?? {}).sort(
    (a, b) => b[1] - a[1],
  )
  const maxFwCount = frameworkEntries[0]?.[1] ?? 1

  const focusMinutes = Math.round((profile?.total_focus_seconds ?? 0) / 60)

  const resolveFrameworkName = (id: string) => {
    const found = frameworks.find((f) => f.id === id)
    return found ? found.name[lang] : id
  }

  return (
    <section className="space-y-8">
      <div className="border-b border-rule pb-5">
        <h2 className="font-display text-2xl font-medium text-ink">{t.memoryTitle}</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-2">{t.memorySubtitle}</p>
      </div>

      <dl className="dusk-surface grid divide-y divide-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <dt className="text-xs font-medium text-muted">{t.statSteps}</dt>
          <dd className="mt-2 font-display text-3xl font-medium text-accent tabular-nums">
            {profile?.completed_steps ?? 0}
          </dd>
        </div>
        <div className="p-5">
          <dt className="text-xs font-medium text-muted">{t.statSessions}</dt>
          <dd className="mt-2 font-display text-3xl font-medium text-ink tabular-nums">
            {profile?.completed_sessions ?? 0}
          </dd>
        </div>
        <div className="p-5">
          <dt className="text-xs font-medium text-muted">{t.statFocus}</dt>
          <dd className="mt-2 font-display text-3xl font-medium text-accent-2 tabular-nums">
            {focusMinutes} {lang === "uk" ? "хв" : "min"}
          </dd>
        </div>
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="dusk-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-medium text-ink">{t.statBlockers}</h3>
            <button
              type="button"
              aria-expanded={showBlockerHelp}
              onClick={() => setShowBlockerHelp((prev) => !prev)}
              className="dusk-btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
            >
              <Info className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{t.blockerHelpToggle}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showBlockerHelp ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {showBlockerHelp && (
            <div
              role="region"
              aria-label={t.blockerHelpTitle}
              className="mt-3 space-y-2 rounded-inner border border-rule bg-paper-2/70 p-3.5 text-xs leading-relaxed text-ink-2"
            >
              <p className="font-medium text-ink">{t.blockerHelpTitle}</p>
              <p>{t.blockerHelpIntro}</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>{t.blockerHelpDescOverwhelm}</li>
                <li>{t.blockerHelpDescUnclear}</li>
                <li>{t.blockerHelpDescPerfectionism}</li>
                <li>{t.blockerHelpDescKnowledge}</li>
                <li>{t.blockerHelpDescFatigue}</li>
              </ul>
              <p className="text-muted">{t.blockerHelpHowAi}</p>
            </div>
          )}

          {blockerEntries.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t.noMemoriesYet}</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {blockerEntries.map(([blocker, count]) => {
                const label = BLOCKER_LABELS[blocker as BlockerType]?.[lang] ?? blocker
                const width = Math.max(12, Math.round((count / maxBlockerCount) * 100))
                return (
                  <div key={blocker}>
                    <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-2">
                      <span>{label}</span>
                      <span className="text-accent-2 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-pill bg-paper">
                      <div
                        className="h-full rounded-pill bg-accent-2"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="dusk-surface p-6">
          <h3 className="font-display text-base font-medium text-ink">{t.statMethods}</h3>
          {frameworkEntries.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t.noMemoriesYet}</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {frameworkEntries.map(([fwId, count]) => {
                const width = Math.max(12, Math.round((count / maxFwCount) * 100))
                return (
                  <div key={fwId}>
                    <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-2">
                      <span>{resolveFrameworkName(fwId)}</span>
                      <span className="text-accent tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-pill bg-paper">
                      <div
                        className="h-full rounded-pill bg-accent"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="dusk-surface p-6">
        <h3 className="font-display text-base font-medium text-ink">{t.memoryFeedTitle}</h3>

        {memories.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.noMemoriesYet}</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-t border-rule">
            {memories.map((mem) => (
              <li key={mem.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    <span className="rounded-pill bg-apricot-tint px-2.5 py-0.5 text-accent-2">
                      {BLOCKER_LABELS[mem.blocker_type as BlockerType]?.[lang] ?? mem.blocker_type}
                    </span>
                    <span className="rounded-pill bg-accent-tint px-2.5 py-0.5 text-accent">
                      {resolveFrameworkName(mem.framework_id)}
                    </span>
                  </div>
                  <span className="text-xs text-muted tabular-nums">
                    {new Date(mem.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{mem.summary_text}</p>
                {mem.first_step_title && (
                  <p className="mt-1.5 text-xs font-medium text-success">{mem.first_step_title}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

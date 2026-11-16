import { ArrowRight, ShieldAlert, Sparkles, Timer } from "lucide-react"
import { COPY } from "@/lib/i18n"
import type { FrameworkId, FrameworkItem, Language } from "@/types"

interface FrameworkLibraryViewProps {
  frameworks: FrameworkItem[]
  lang: Language
  onStartWithFramework: (frameworkId: FrameworkId) => void
}

export function FrameworkLibraryView({
  frameworks,
  lang,
  onStartWithFramework,
}: FrameworkLibraryViewProps) {
  const t = COPY[lang]

  return (
    <section className="space-y-8">
      <div className="border-b border-rule pb-5">
        <h2 className="font-display text-2xl font-medium text-ink">{t.libraryTitle}</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-2">{t.librarySubtitle}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {frameworks.map((fw) => (
          <article key={fw.id} className="dusk-surface flex flex-col justify-between p-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-medium text-ink">{fw.name[lang]}</h3>
                  <p className="mt-1 text-sm text-accent">{fw.tagline[lang]}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted tabular-nums">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{fw.recommended_timer}</span>
                </span>
              </div>

              <dl className="mt-5 divide-y divide-rule border-t border-rule text-sm">
                <div className="py-3">
                  <dt className="text-xs font-medium text-muted">{t.whenToUse}</dt>
                  <dd className="mt-1 leading-relaxed text-ink-2">{fw.when_to_use[lang]}</dd>
                </div>

                <div className="py-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-accent">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.howItWorks}</span>
                  </dt>
                  <dd className="mt-1 leading-relaxed text-ink-2">
                    {fw.cognitive_mechanism[lang]}
                  </dd>
                </div>

                <div className="py-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-accent-2">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.antiPattern}</span>
                  </dt>
                  <dd className="mt-1 leading-relaxed text-ink-2">{fw.anti_pattern[lang]}</dd>
                </div>

                <div className="py-3">
                  <dt className="text-xs font-medium text-muted">{t.exampleQ}</dt>
                  <dd className="mt-1 italic leading-relaxed text-ink">
                    «{fw.example_question[lang]}»
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 border-t border-rule pt-4">
              <button
                type="button"
                onClick={() => onStartWithFramework(fw.id)}
                className="dusk-btn-ghost inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
              >
                <span>{t.applyMethodBtn}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

"use client"

import { IconStar } from "@tabler/icons-react"
import type { CompetencyLevelView } from "@/lib/api"

interface Props {
  level: CompetencyLevelView | undefined
  currentLevel: number
  isTarget: boolean
}

/**
 * Main detail card for the selected level.
 *
 *   [LEVEL N eyebrow]  [Headline = descriptor or first indicator]   [★ Role target]
 *   ── Behavioural anchors (paper-2 chips, staggered slide-in) ────────────────
 *   [Example behaviour] — italic Instrument Serif on a paper-2 card with a
 *   clay (persimmon) left accent, matching the "researcher voice" pattern from
 *   the design system README.
 */
export default function LevelDetailCard({ level, currentLevel, isTarget }: Props) {
  if (!level) {
    return (
      <div
        className="mx-card p-8 text-center"
        style={{
          fontFamily: "var(--mx-font-display)",
          fontSize: 16,
          fontStyle: "italic",
          color: "var(--mx-ink-3)",
        }}
      >
        No content for L{currentLevel}.
      </div>
    )
  }

  const indicators = level.behavioral_indicators
  const headline = level.descriptor?.trim() || indicators[0] || `Level ${currentLevel}`
  const exampleText = level.example_behaviors[0]?.trim()

  return (
    <div className="mx-card" style={{ padding: 22 }}>
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mx-eyebrow mb-1.5">Level {currentLevel}</div>
          <div
            className="mx-h3"
            style={{ fontSize: 22, lineHeight: 1.2 }}
          >
            {headline}
          </div>
        </div>
        {isTarget && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-[999px] px-2.5 py-1"
            style={{
              background: "rgba(226,177,70,0.16)",
              color: "var(--mx-ink)",
              border: "1px solid rgba(226,177,70,0.4)",
              fontFamily: "var(--mx-font-sans)",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <IconStar size={11} stroke={1.8} style={{ color: "var(--mx-butter)" }} />
            Role target
          </span>
        )}
      </div>

      {/* Behavioural anchors */}
      {indicators.length > 0 && (
        <div className="mb-5">
          <div className="mx-eyebrow mb-2.5">Behavioural anchors</div>
          <div className="space-y-1.5">
            {indicators.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2.5"
                style={{
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  borderRadius: "var(--mx-r-md)",
                  color: "var(--mx-ink)",
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  animation: `mx-anchor-up var(--mx-dur-slow) var(--mx-ease) ${i * 0.08}s both`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    color: "var(--mx-forest)",
                    fontFamily: "var(--mx-font-mono)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    flexShrink: 0,
                  }}
                >
                  ·
                </span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Example behaviour — italic serif on a paper-2 card with clay accent */}
      {exampleText && (
        <div
          style={{
            background: "var(--mx-paper-2)",
            borderLeft: "3px solid var(--mx-clay)",
            borderRadius: "var(--mx-r-sm)",
            padding: "12px 16px",
          }}
        >
          <div className="mx-eyebrow mb-1.5" style={{ color: "var(--mx-clay)" }}>
            Example behaviour
          </div>
          <div
            style={{
              fontFamily: "var(--mx-font-display)",
              fontSize: 16,
              fontStyle: "italic",
              lineHeight: 1.45,
              color: "var(--mx-ink)",
              letterSpacing: "-0.005em",
            }}
          >
            {exampleText}
          </div>
        </div>
      )}

      <style>{`
        @keyframes mx-anchor-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

"use client"

import type { CompetencyLevelView } from "@/lib/api"

interface Props {
  levels: CompetencyLevelView[]
  targetLevel: number | null
}

/**
 * Compare view — five columns side-by-side.
 *
 * Per data-mapping.md decision 8: slice indicators at 3 per column.
 * Re-skinned: columns ride a navy intensity ramp (mx-paper → mx-paper-2 with
 * cobalt tint at L5), target column gets a 2 px navy border and a TARGET pip.
 */
export default function CompareGrid({ levels, targetLevel }: Props) {
  const byLevel = new Map(levels.map(lv => [lv.level, lv]))

  return (
    <div className="mx-card" style={{ padding: 22 }}>
      <div className="mx-title mb-1" style={{ fontSize: 18 }}>
        All five levels side by side
      </div>
      <div className="mx-caption mb-5">
        Behavioural anchors compared across the rubric
      </div>
      <div className="grid grid-cols-5 gap-2.5">
        {[1, 2, 3, 4, 5].map(lv => {
          const data = byLevel.get(lv)
          const isTarget = lv === targetLevel
          // Navy intensity ramp via opacity on a fixed cobalt tint
          const intensity = 0.04 + (lv / 5) * 0.09  // 5.8% → 13%
          const headline =
            data?.descriptor?.trim() || data?.behavioral_indicators[0] || `Level ${lv}`
          const anchors = (data?.behavioral_indicators ?? []).slice(0, 3)

          return (
            <div
              key={lv}
              className="relative"
              style={{
                background: `rgba(42, 91, 168, ${intensity})`,
                border: isTarget
                  ? "2px solid var(--mx-forest)"
                  : "1px solid var(--mx-line)",
                borderRadius: "var(--mx-r-md)",
                padding: 12,
                animation: `mx-anchor-up var(--mx-dur-slow) var(--mx-ease) ${lv * 0.06}s both`,
              }}
            >
              {isTarget && (
                <div
                  className="absolute -top-2 right-2 px-1.5 py-0.5"
                  style={{
                    background: "var(--mx-forest)",
                    color: "var(--mx-paper)",
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    borderRadius: "var(--mx-r-xs)",
                  }}
                >
                  Target
                </div>
              )}
              <div className="mx-eyebrow mb-1">Level {lv}</div>
              <div
                className="mb-2"
                style={{
                  fontFamily: "var(--mx-font-display)",
                  fontSize: 14,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.25,
                  color: "var(--mx-ink)",
                  minHeight: 36,
                }}
              >
                {headline}
              </div>
              <div
                className="space-y-1"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "var(--mx-ink-2)",
                }}
              >
                {anchors.map((a, i) => (
                  <div key={i} className="flex gap-1.5">
                    <span
                      aria-hidden
                      style={{ color: "var(--mx-forest)", flexShrink: 0 }}
                    >
                      ·
                    </span>
                    <span>{a}</span>
                  </div>
                ))}
                {!data && (
                  <div
                    style={{
                      fontStyle: "italic",
                      color: "var(--mx-ink-3)",
                      fontFamily: "var(--mx-font-display)",
                    }}
                  >
                    No content for this level.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes mx-anchor-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

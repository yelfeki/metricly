"use client"

import type { CompetencyLevelView } from "@/lib/api"

interface Props {
  levels: CompetencyLevelView[]
  currentLevel: number
  targetLevel: number | null
  onSelect: (level: number) => void
}

/**
 * Horizontal 5-dot progress visual on a cream surface card.
 *
 *   ○ ── ○ ── ● ── ○ ── ○
 *   L1   L2   L3   L4   L5
 *
 * Dot state colours:
 *   reached  = navy fill, navy border
 *   current  = paper fill, navy border, butter ring (box-shadow)
 *   unreached = paper fill, line border
 * Target marker = butter ★ next to the level label.
 */
export default function DotLadder({ levels, currentLevel, targetLevel, onSelect }: Props) {
  // 12% inset for visual breathing room (dot centres sit at 6% / 28% / 50% / 72% / 94%)
  const fillPct = ((currentLevel - 1) / 4) * (100 - 12)

  return (
    <div className="mx-card" style={{ padding: 20 }}>
      <div className="relative h-[60px]">
        {/* Track */}
        <div
          className="absolute"
          style={{
            top: 28,
            left: "6%",
            right: "6%",
            height: 3,
            background: "var(--mx-line)",
            borderRadius: 2,
          }}
        />
        {/* Fill */}
        <div
          className="absolute"
          style={{
            top: 28,
            left: "6%",
            height: 3,
            background: "var(--mx-forest)",
            borderRadius: 2,
            width: `${fillPct}%`,
            transition: `width var(--mx-dur-slow) var(--mx-ease)`,
          }}
        />
        {/* Dots */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-around px-[4%]">
          {[1, 2, 3, 4, 5].map(lv => {
            const reached = lv < currentLevel
            const current = lv === currentLevel
            const isTarget = lv === targetLevel
            const dotStyle: React.CSSProperties = current
              ? {
                  background: "var(--mx-paper)",
                  border: "2.5px solid var(--mx-forest)",
                  boxShadow: "0 0 0 4px rgba(226,177,70,0.32)",
                  transform: "scale(1.15)",
                }
              : reached
              ? { background: "var(--mx-forest)", border: "2.5px solid var(--mx-forest)" }
              : { background: "var(--mx-surface)", border: "2.5px solid var(--mx-line)" }

            return (
              <button
                key={lv}
                onClick={() => onSelect(lv)}
                aria-label={`Jump to level ${lv}`}
                className="flex cursor-pointer flex-col items-center bg-transparent"
              >
                <div
                  className="relative z-10 mt-[21px] h-3.5 w-3.5 rounded-full"
                  style={{ ...dotStyle, transition: `all var(--mx-dur-slow) var(--mx-ease)` }}
                />
                <div
                  className="mt-2 mx-tnum"
                  style={{
                    fontSize: 10,
                    color: current ? "var(--mx-forest)" : "var(--mx-ink-3)",
                    fontWeight: current ? 500 : 400,
                    transition: `color var(--mx-dur-base) var(--mx-ease)`,
                  }}
                >
                  L{lv}
                  {isTarget && (
                    <span
                      aria-hidden
                      style={{ color: "var(--mx-butter)", marginLeft: 4 }}
                    >
                      ★
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

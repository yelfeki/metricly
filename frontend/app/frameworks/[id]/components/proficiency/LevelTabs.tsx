"use client"

import type { CompetencyLevelView } from "@/lib/api"

interface Props {
  levels: CompetencyLevelView[]
  currentLevel: number
  onSelect: (level: number) => void
}

/**
 * Five level tabs (L1..L5). Mx pattern:
 *   - default = surface + hairline border + ink-2 text
 *   - active  = navy gradient + paper text
 *   - L# numeral in mx-num (Instrument Serif tabular); label in DM Sans
 */
export default function LevelTabs({ levels, currentLevel, onSelect }: Props) {
  const byLevel = new Map(levels.map(lv => [lv.level, lv]))
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map(lv => {
        const data = byLevel.get(lv)
        const label = data?.label ?? "—"
        const active = lv === currentLevel
        const disabled = data === undefined
        return (
          <button
            key={lv}
            onClick={() => !disabled && onSelect(lv)}
            disabled={disabled}
            className="flex flex-col items-center gap-0.5 px-2 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={
              active
                ? {
                    background: "var(--mx-grad-cool)",
                    color: "var(--mx-paper)",
                    border: "1px solid transparent",
                    borderRadius: "var(--mx-r-md)",
                    boxShadow: "var(--mx-shadow-hover)",
                    transition: `all var(--mx-dur-base) var(--mx-ease)`,
                  }
                : {
                    background: "var(--mx-surface)",
                    color: "var(--mx-ink)",
                    border: "1px solid var(--mx-line)",
                    borderRadius: "var(--mx-r-md)",
                    transition: `all var(--mx-dur-base) var(--mx-ease)`,
                  }
            }
          >
            <span
              className="mx-num"
              style={{ fontSize: 22, color: active ? "var(--mx-paper)" : "var(--mx-ink)" }}
            >
              L{lv}
            </span>
            <span
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: active ? "rgba(250,247,242,0.85)" : "var(--mx-ink-3)",
              }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

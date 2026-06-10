"use client"

import { useState } from "react"
import type { CompetencyLevelView } from "@/lib/api"

interface Props {
  levels: CompetencyLevelView[]
  /** The framework's benchmark target for this competency, or null if not set. */
  targetLevel: number | null
}

/**
 * Vertical stack of proficiency bands.
 *   - Hover one band: siblings dim to 50% opacity (150ms)
 *   - Click one band: it expands to reveal behavioural indicators + examples
 *     (200ms via the grid-rows 0fr→1fr trick — clean height-auto, no max-height)
 *   - Only one expanded at a time; clicking the open band closes it
 *   - Target band has a 3px left accent border + filled background tint
 */
export default function ProficiencyLadder({ levels, targetLevel }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-2">
      {levels.map(lv => {
        const isExpanded = expanded === lv.level
        const isTarget = targetLevel === lv.level
        const dim = hovered !== null && hovered !== lv.level

        return (
          <div
            key={lv.level}
            onMouseEnter={() => setHovered(lv.level)}
            onMouseLeave={() => setHovered(null)}
            className="overflow-hidden rounded-xl transition-opacity duration-150"
            style={{
              opacity: dim ? 0.5 : 1,
              background: isTarget
                ? "linear-gradient(135deg, rgba(15,40,65,0.08), rgba(55,119,168,0.06))"
                : "rgba(255,255,255,0.55)",
              border: "0.5px solid rgba(255,255,255,0.8)",
              borderLeft: isTarget
                ? "3px solid #0F2841"
                : "0.5px solid rgba(255,255,255,0.8)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Always-visible header */}
            <button
              onClick={() => setExpanded(isExpanded ? null : lv.level)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
              aria-expanded={isExpanded}
            >
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: isTarget
                    ? "linear-gradient(135deg, #0F2841, #2A5BA8)"
                    : "rgba(15,40,65,0.1)",
                  color: isTarget ? "#fff" : "#0F2841",
                }}
              >
                L{lv.level}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "#0A1E33" }}
                  >
                    {lv.label}
                  </span>
                  {isTarget && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: "#0F2841" }}
                    >
                      · Target
                    </span>
                  )}
                </div>
                {lv.descriptor && (
                  <p
                    className="mt-0.5 text-xs leading-relaxed"
                    style={{ color: "rgba(10,30,51,0.7)" }}
                  >
                    {lv.descriptor}
                  </p>
                )}
              </div>
              <svg
                className="mt-1 h-3 w-3 shrink-0 transition-transform duration-200"
                style={{
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  color: "rgba(15,40,65,0.5)",
                }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanding section — grid-rows 0fr→1fr trick (clean height-auto) */}
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className="border-t px-4 py-3"
                  style={{ borderColor: "rgba(15,40,65,0.1)" }}
                >
                  {lv.behavioral_indicators.length > 0 && (
                    <div>
                      <div className="label-caps mb-1.5">Behavioural indicators</div>
                      <ul
                        className="space-y-1.5 text-xs leading-relaxed"
                        style={{ color: "rgba(10,30,51,0.75)" }}
                      >
                        {lv.behavioral_indicators.map((ind, i) => (
                          <li key={i} className="flex gap-2">
                            <span style={{ color: "#0F2841" }}>•</span>
                            <span>{ind}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lv.example_behaviors.length > 0 && (
                    <div className={lv.behavioral_indicators.length > 0 ? "mt-3" : ""}>
                      <div className="label-caps mb-1.5">Example behaviours</div>
                      <ul
                        className="space-y-1.5 text-xs italic leading-relaxed"
                        style={{ color: "rgba(10,30,51,0.6)" }}
                      >
                        {lv.example_behaviors.map((ex, i) => (
                          <li key={i} className="flex gap-2">
                            <span>—</span>
                            <span>{ex}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lv.behavioral_indicators.length === 0 &&
                    lv.example_behaviors.length === 0 && (
                      <p
                        className="text-xs italic"
                        style={{ color: "rgba(10,30,51,0.5)" }}
                      >
                        No level-specific content for this competency.
                      </p>
                    )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

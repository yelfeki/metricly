"use client"

import type { CompetencyOut, FrameworkOut } from "@/lib/types"
import { iconForCluster } from "../../lib/cluster-icon-hash"

interface Props {
  competency: CompetencyOut
  framework: FrameworkOut
  targetLevel: number | null
}

/**
 * Selected-competency header card.
 *   [icon tile (butter glow + navy icon)]  [name + subtitle]  [TARGET / L#]
 *
 * Name in DM Sans semibold; target numeral in Instrument Serif (mx-num),
 * gradient-cool for prominence.
 */
export default function CompetencyHeaderCard({ competency, framework, targetLevel }: Props) {
  const Icon = iconForCluster(competency.cluster)
  const roleQualifier = framework.role_title ? `for ${framework.role_title}` : "for this role"

  return (
    <div className="mx-card" style={{ padding: "18px 20px" }}>
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center"
          style={{
            background: "var(--mx-grad-butter-glow)",
            borderRadius: "var(--mx-r-md)",
            color: "var(--mx-forest)",
          }}
        >
          <Icon size={22} stroke={1.6} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mx-title" style={{ fontSize: 18 }}>
            {competency.name}
          </div>
          <div className="mx-caption mt-1">
            Five behavioural levels · target {roleQualifier}
            {targetLevel !== null && (
              <>
                {" "}
                <span className="mx-tnum" style={{ color: "var(--mx-forest)", fontWeight: 500 }}>
                  L{targetLevel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="mx-eyebrow mb-1">Target</div>
          <div
            className="mx-num mx-text-grad-cool"
            style={{ fontSize: 28, lineHeight: 1 }}
          >
            {targetLevel !== null ? `L${targetLevel}` : "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

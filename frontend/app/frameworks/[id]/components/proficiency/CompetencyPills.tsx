"use client"

import type { CompetencyOut } from "@/lib/types"
import { iconForCluster } from "../../lib/cluster-icon-hash"

interface Props {
  competencies: CompetencyOut[]
  currentId: string
  onSelect: (id: string) => void
}

/**
 * Pill row for picking which competency to inspect.
 *   - Mx surface card with hairline border
 *   - Eyebrow label above the pill row
 *   - Active pill: navy gradient + paper text
 *   - Default pill: ink-2 text on transparent
 */
export default function CompetencyPills({ competencies, currentId, onSelect }: Props) {
  return (
    <div className="mx-card" style={{ padding: "14px 16px" }}>
      <div className="mx-eyebrow mb-2.5">Select competency</div>
      <div className="flex flex-wrap gap-1.5">
        {competencies.map(c => {
          const Icon = iconForCluster(c.cluster)
          const active = c.id === currentId
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="mx-pill"
              data-active={active}
              style={{ fontFamily: "var(--mx-font-sans)", fontSize: 12 }}
            >
              <Icon size={13} stroke={1.6} />
              {c.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

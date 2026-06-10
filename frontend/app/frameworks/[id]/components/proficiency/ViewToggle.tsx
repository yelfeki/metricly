"use client"

import { IconLayoutColumns, IconStairs } from "@tabler/icons-react"

export type ProficiencyView = "ladder" | "compare"

interface Props {
  view: ProficiencyView
  onChange: (view: ProficiencyView) => void
}

/**
 * Two-button toggle (Ladder / Compare). Mx pill style:
 *   - default = hairline border + ink-2 text
 *   - active  = navy gradient + paper text
 */
export default function ViewToggle({ view, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="mx-eyebrow" style={{ letterSpacing: "0.22em" }}>View</span>
      <Button active={view === "ladder"} onClick={() => onChange("ladder")} label="Ladder" Icon={IconStairs} />
      <Button active={view === "compare"} onClick={() => onChange("compare")} label="Compare" Icon={IconLayoutColumns} />
    </div>
  )
}

function Button({
  active, onClick, label, Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  Icon: typeof IconStairs
}) {
  return (
    <button
      onClick={onClick}
      className="mx-pill"
      data-active={active}
      style={{ fontFamily: "var(--mx-font-sans)" }}
    >
      <Icon size={14} stroke={1.6} />
      {label}
    </button>
  )
}

"use client"

interface Props {
  targetLevel: number | null
  currentLevel: number
}

/**
 * Single-card footer (data-mapping.md decision 5 — progression-time hidden).
 *
 * Gap semantics from the design system pigment ladder:
 *   - At target (gap = 0):     navy
 *   - Below target (gap > 0):  clay/persimmon (the product's "beauty mark"
 *                              colour; also bucket-1 = bottom of percentile)
 *   - Above target (gap < 0):  sage/olive (the calm non-blue neutral)
 */
export default function TargetGapFooter({ targetLevel, currentLevel }: Props) {
  if (targetLevel === null) {
    return (
      <div className="mx-card" style={{ padding: "14px 18px" }}>
        <div className="mx-eyebrow mb-1">Target for role</div>
        <div className="mx-title" style={{ color: "var(--mx-ink-3)" }}>
          Not set
        </div>
      </div>
    )
  }

  const gap = targetLevel - currentLevel
  const gapText =
    gap > 0
      ? `${gap} level${gap > 1 ? "s" : ""} below target`
      : gap < 0
      ? `${Math.abs(gap)} above target`
      : "At target"
  const gapColour =
    gap > 0
      ? "var(--mx-clay)"
      : gap < 0
      ? "var(--mx-sage)"
      : "var(--mx-forest)"

  return (
    <div className="mx-card" style={{ padding: "14px 18px" }}>
      <div className="mx-eyebrow mb-1.5">Target for role</div>
      <div className="flex items-baseline gap-3">
        <span
          className="mx-num"
          style={{ fontSize: 32, color: "var(--mx-ink)" }}
        >
          L{targetLevel}
        </span>
        <span
          className="mx-tnum"
          style={{ fontSize: 12, color: gapColour, fontWeight: 500 }}
        >
          {gapText}
        </span>
      </div>
    </div>
  )
}

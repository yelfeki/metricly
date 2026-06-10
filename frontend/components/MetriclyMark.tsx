/**
 * Metricly brand mark — two Gaussian bell curves forming a custom "M".
 *
 * Path + gradient + baseline taken VERBATIM from
 *   design/mockups/metricly bundle / assets/metricly-mark.svg
 * so the on-screen mark matches the design package exactly.
 *
 * Per design-system README §"Brand mark":
 *   "Two Gaussian bell curves forming a custom 'M'. Default stroke is
 *    currentColor; gradient variant uses --mx-grad-mark (navy → wine →
 *    persimmon). Always paired with the wordmark in product chrome."
 */

interface Props {
  /** Pixel height; the SVG scales proportionally. Default 22 — pairs with
   *  Instrument Serif wordmark at ~22 px in product chrome. */
  size?: number
  /** "gradient" applies the official diagonal navy → wine → persimmon brand
   *  gradient. "solid" inherits currentColor. */
  variant?: "gradient" | "solid"
  /** Optional stroke width override; default 3 matches the source SVG. */
  strokeWidth?: number
  /** Show the subtle baseline line under the mark (35% navy). Default true —
   *  it's part of the official mark per the source SVG. */
  baseline?: boolean
  className?: string
  title?: string
}

// Unique gradient id per instance so multiple marks on the same page don't
// collide. Built once at module-load using a counter.
let nextId = 0
function makeId(): string {
  nextId += 1
  return `mx-mark-grad-${nextId}`
}

export default function MetriclyMark({
  size = 22,
  variant = "gradient",
  strokeWidth = 3,
  baseline = true,
  className,
  title = "Metricly",
}: Props) {
  const gradId = makeId()
  const stroke = variant === "gradient" ? `url(#${gradId})` : "currentColor"
  // Source SVG viewBox is 50 × 36 — preserve aspect ratio when scaling.
  return (
    <svg
      viewBox="0 0 50 36"
      width={(size * 50) / 36}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      {variant === "gradient" && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0F2841" />
            <stop offset="55%" stopColor="#8C4D5B" />
            <stop offset="100%" stopColor="#DD6334" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M 2 30 C 6 30, 8 6, 14 6 C 20 6, 22 30, 25 30 C 28 30, 30 6, 36 6 C 42 6, 44 30, 48 30"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {baseline && (
        <line
          x1="2"
          y1="32.5"
          x2="48"
          y2="32.5"
          stroke="#0A1E33"
          strokeWidth="1"
          opacity="0.35"
        />
      )}
    </svg>
  )
}

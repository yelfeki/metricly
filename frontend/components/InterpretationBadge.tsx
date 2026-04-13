import type { Interpretation } from "@/lib/types"

const styles: Record<Interpretation, string> = {
  poor:       "bg-red-50 text-red-700 ring-1 ring-red-200",
  acceptable: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  good:       "bg-green-50 text-green-700 ring-1 ring-green-200",
  excellent:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
}

const dots: Record<Interpretation, string> = {
  poor:       "bg-red-400",
  acceptable: "bg-amber-400",
  good:       "bg-green-400",
  excellent:  "bg-emerald-400",
}

interface Props {
  value: Interpretation
  size?: "sm" | "md" | "lg"
}

export default function InterpretationBadge({ value, size = "md" }: Props) {
  const sizeClass =
    size === "lg"
      ? "px-4 py-1.5 text-sm font-semibold"
      : size === "sm"
      ? "px-2 py-0.5 text-xs"
      : "px-3 py-1 text-xs font-medium"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full capitalize ${sizeClass} ${styles[value]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[value]}`} />
      {value}
    </span>
  )
}

import Link from "next/link"
import type { Module, ModuleColor } from "@/lib/types"

const colorMap: Record<
  ModuleColor,
  { border: string; icon: string; badge: string; button: string; symbol: string }
> = {
  indigo: {
    border: "border-t-indigo-600",
    icon: "bg-indigo-50 text-indigo-600",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    button: "bg-indigo-600 hover:bg-indigo-700 text-white",
    symbol: "α",
  },
  violet: {
    border: "border-t-violet-600",
    icon: "bg-violet-50 text-violet-600",
    badge: "bg-violet-50 text-violet-700 ring-violet-100",
    button: "bg-violet-600 hover:bg-violet-700 text-white",
    symbol: "ω",
  },
  emerald: {
    border: "border-t-emerald-600",
    icon: "bg-emerald-50 text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    button: "bg-emerald-600 hover:bg-emerald-700 text-white",
    symbol: "λ",
  },
  amber: {
    border: "border-t-amber-500",
    icon: "bg-amber-50 text-amber-600",
    badge: "bg-amber-50 text-amber-700 ring-amber-100",
    button: "bg-amber-500 hover:bg-amber-600 text-white",
    symbol: "Δ",
  },
}

export default function ModuleCard({ module }: { module: Module }) {
  const c = colorMap[module.color]

  const cardBody = (
    <div
      className={`group flex h-full flex-col rounded-xl border border-slate-200 border-t-4 ${c.border} bg-white p-6 shadow-sm transition-shadow hover:shadow-md`}
    >
      {/* Top row: symbol + category badge */}
      <div className="mb-4 flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl font-bold ${c.icon}`}
        >
          {c.symbol}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.badge}`}
        >
          {module.category}
        </span>
      </div>

      {/* Title + description */}
      <h3 className="mb-2 text-base font-semibold text-slate-900">{module.name}</h3>
      <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-500">
        {module.description}
      </p>

      {/* Endpoint pill */}
      <div className="mb-4 rounded-md bg-slate-50 px-3 py-2">
        <code className="font-mono text-[11px] text-slate-500">{module.endpoint}</code>
      </div>

      {/* CTA */}
      {module.available ? (
        <div
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${c.button}`}
        >
          Open Module
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
          </svg>
        </div>
      ) : (
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          Coming soon
        </div>
      )}
    </div>
  )

  if (module.available && module.href) {
    return (
      <Link href={module.href} className="block h-full">
        {cardBody}
      </Link>
    )
  }

  return <div className="h-full opacity-80">{cardBody}</div>
}

import Link from "next/link"
import type { Module, ModuleColor } from "@/lib/types"

const colorMap: Record<
  ModuleColor,
  { accent: string; symbol: string; category: string }
> = {
  indigo: {
    accent: "rgba(99,102,241,0.75)",
    symbol: "α",
    category: "rgba(99,102,241,0.12)",
  },
  violet: {
    accent: "rgba(139,92,246,0.75)",
    symbol: "ω",
    category: "rgba(139,92,246,0.12)",
  },
  emerald: {
    accent: "rgba(16,185,129,0.75)",
    symbol: "λ",
    category: "rgba(16,185,129,0.12)",
  },
  amber: {
    accent: "rgba(245,158,11,0.75)",
    symbol: "Δ",
    category: "rgba(245,158,11,0.12)",
  },
}

export default function ModuleCard({ module }: { module: Module }) {
  const c = colorMap[module.color]

  const cardBody = (
    <div className="card group flex h-full flex-col p-6 transition-all hover:shadow-[0_4px_30px_rgba(15,40,65,0.12)]">
      {/* Top row */}
      <div className="mb-4 flex items-center justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold"
          style={{ background: c.category, color: c.accent }}
        >
          {c.symbol}
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
          style={{ background: c.category, color: c.accent }}
        >
          {module.category}
        </span>
      </div>

      {/* Title + description */}
      <h3 className="section-heading mb-2">{module.name}</h3>
      <p className="mb-4 flex-1 text-sm leading-relaxed" style={{ color: "rgba(10,30,51,0.55)" }}>
        {module.description}
      </p>

      {/* Endpoint pill */}
      <div
        className="mb-4 rounded-lg px-3 py-2"
        style={{ background: "rgba(10,30,51,0.04)", border: "0.5px solid rgba(10,30,51,0.08)" }}
      >
        <code className="font-mono text-[11px]" style={{ color: "rgba(10,30,51,0.45)" }}>
          {module.endpoint}
        </code>
      </div>

      {/* CTA */}
      {module.available ? (
        <div
          className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold text-white transition-all"
          style={{
            background: `linear-gradient(135deg, ${c.accent}, ${c.accent.replace("0.75", "0.9")})`,
            boxShadow: `0 2px 10px ${c.accent.replace("0.75", "0.3")}`,
          }}
        >
          Open Module
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
          </svg>
        </div>
      ) : (
        <div
          className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold"
          style={{
            background: "rgba(10,30,51,0.05)",
            border: "0.5px solid rgba(10,30,51,0.1)",
            color: "rgba(10,30,51,0.35)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(10,30,51,0.2)" }} />
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

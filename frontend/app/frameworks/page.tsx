"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  IconBuildingCommunity,
  IconPlus,
  IconSparkles,
} from "@tabler/icons-react"
import Header from "@/components/Header"
import { listFrameworks, deleteFramework } from "@/lib/api"
import type { FrameworkListItem } from "@/lib/types"

export default function FrameworksPage() {
  const [frameworks, setFrameworks] = useState<FrameworkListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setFrameworks(await listFrameworks())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await deleteFramework(id)
      setFrameworks(prev => prev.filter(f => f.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          {/* Hero / welcome card — same treatment as the home-page greeting.
              Lightened from the original navy radial to a layered warm/cool
              wash on cream (atelier pattern). Eyebrow is muted ink; title is
              ink with the italic accent in warm gradient (persimmon → butter);
              CTAs flip to solid-navy primary + ghost secondary (the dark-hero
              butter/paper combo doesn't translate to the cream surface). */}
          <section className="mx-hero mb-8" style={{ padding: "40px 44px" }}>
            <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="mx-eyebrow mb-2">Workforce development</p>
                <h1
                  className="mx-h2"
                  style={{ fontSize: 44, color: "var(--mx-ink)" }}
                >
                  Competency <em className="mx-text-grad-warm">frameworks.</em>
                </h1>
                <p
                  className="mt-2 max-w-xl"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--mx-ink-2)",
                  }}
                >
                  Define skills, set proficiency targets, and track team readiness.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/frameworks/new/guided"
                  className="inline-flex items-center gap-1.5 rounded-[999px] px-4 py-2 transition-all"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    background: "var(--mx-forest)",
                    color: "var(--mx-paper)",
                    boxShadow: "var(--mx-shadow-card)",
                  }}
                >
                  <IconSparkles size={14} stroke={1.8} />
                  Create with guided flow
                </Link>
                <Link
                  href="/frameworks/new"
                  className="inline-flex items-center gap-1.5 rounded-[999px] px-4 py-2 transition-all"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    background: "var(--mx-paper)",
                    border: "1px solid var(--mx-line)",
                    color: "var(--mx-ink)",
                  }}
                >
                  <IconPlus size={13} stroke={1.6} />
                  Manual setup
                </Link>
              </div>
            </div>
          </section>

          {loading && (
            <div
              className="py-20 text-center"
              style={{
                fontFamily: "var(--mx-font-display)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--mx-ink-3)",
              }}
            >
              Loading…
            </div>
          )}

          {error && (
            <div
              className="mb-4 rounded-[14px] px-4 py-3"
              style={{
                background: "rgba(194,78,78,0.06)",
                border: "1px solid rgba(194,78,78,0.25)",
                color: "var(--mx-rose)",
                fontFamily: "var(--mx-font-sans)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {!loading && frameworks.length === 0 && (
            <div
              className="px-8 py-16 text-center"
              style={{
                background: "var(--mx-paper-2)",
                border: "1.5px dashed var(--mx-line-2)",
                borderRadius: "var(--mx-r-xl)",
              }}
            >
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center"
                style={{
                  background: "var(--mx-grad-butter-glow)",
                  color: "var(--mx-forest)",
                  borderRadius: "50%",
                }}
              >
                <IconBuildingCommunity size={22} stroke={1.6} />
              </div>
              <p
                className="mb-1"
                style={{
                  fontFamily: "var(--mx-font-display)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  color: "var(--mx-ink)",
                }}
              >
                No frameworks yet
              </p>
              <p
                className="mb-5"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  color: "var(--mx-ink-2)",
                }}
              >
                Build your first competency framework to start tracking skill gaps.
              </p>
              <Link
                href="/frameworks/new/guided"
                className="inline-flex items-center gap-1.5 rounded-[999px] px-4 py-2"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--mx-grad-cool)",
                  color: "var(--mx-paper)",
                  boxShadow: "var(--mx-shadow-card)",
                }}
              >
                <IconSparkles size={14} stroke={1.6} />
                Create with guided flow
              </Link>
              <p
                className="mt-3"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  color: "var(--mx-ink-3)",
                }}
              >
                or{" "}
                <Link
                  href="/frameworks/new"
                  style={{
                    color: "var(--mx-cobalt)",
                    fontWeight: 500,
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  build manually
                </Link>
              </p>
            </div>
          )}

          {!loading && frameworks.length > 0 && (
            <div className="mx-card overflow-hidden">
              <table className="w-full" style={{ fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--mx-line)" }}>
                    {["Framework", "Role", "Competencies", "Created", ""].map((h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left"
                        style={{
                          fontSize: 10.5,
                          fontWeight: 500,
                          letterSpacing: "0.22em",
                          textTransform: "uppercase",
                          color: "var(--mx-ink-3)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frameworks.map((fw, idx) => (
                    <tr
                      key={fw.id}
                      style={{
                        borderBottom:
                          idx < frameworks.length - 1
                            ? "1px solid var(--mx-line)"
                            : "none",
                        transition: "background var(--mx-dur-fast) var(--mx-ease)",
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = "var(--mx-paper-2)")
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td className="px-4 py-3.5">
                        <p style={{ fontWeight: 500, color: "var(--mx-ink)" }}>{fw.title}</p>
                        {fw.description && (
                          <p
                            className="mt-0.5 truncate"
                            style={{
                              maxWidth: 260,
                              fontSize: 11,
                              color: "var(--mx-ink-3)",
                            }}
                          >
                            {fw.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {fw.role_title ? (
                          <span style={{ fontSize: 12, color: "var(--mx-ink-2)" }}>
                            {fw.role_title}
                          </span>
                        ) : (
                          <span style={{ color: "var(--mx-ink-3)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="mx-tnum"
                          style={{
                            display: "inline-block",
                            background: "var(--mx-paper-2)",
                            border: "1px solid var(--mx-line)",
                            color: "var(--mx-ink)",
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {fw.competency_count}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="mx-tnum" style={{ fontSize: 11, color: "var(--mx-ink-3)" }}>
                          {new Date(fw.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Link href={`/frameworks/${fw.id}`} className="mx-pill" style={{ fontSize: 11 }}>
                            Open
                          </Link>
                          <Link
                            href={`/frameworks/${fw.id}/gap-report`}
                            className="mx-pill"
                            style={{ fontSize: 11 }}
                          >
                            Gap
                          </Link>
                          <Link
                            href={`/frameworks/${fw.id}/team-report`}
                            className="mx-pill"
                            style={{ fontSize: 11 }}
                          >
                            Team
                          </Link>
                          <button
                            onClick={() => handleDelete(fw.id, fw.title)}
                            disabled={deleting === fw.id}
                            className="inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1 transition-all disabled:opacity-50"
                            style={{
                              fontFamily: "var(--mx-font-sans)",
                              fontSize: 11,
                              fontWeight: 500,
                              border: "1px solid rgba(194,78,78,0.3)",
                              color: "var(--mx-rose)",
                              background: "transparent",
                            }}
                          >
                            {deleting === fw.id ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

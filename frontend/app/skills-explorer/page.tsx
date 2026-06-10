"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import { chatSkillsExplorer } from "@/lib/api"
import type { SkillsChatMessage, SkillsProfile } from "@/lib/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string
  role: "user" | "assistant"
  content: string       // visible text (SKILLS_PROFILE line stripped)
  hasProfile?: boolean  // assistant message that contained the profile
}

const OPENING_MESSAGE: Message = {
  id: "init",
  role: "assistant",
  content:
    "Hello! I'm here to help you identify the right skills and psychological constructs to measure in your organization. To get started — could you tell me a bit about your organization? What industry are you in, and roughly how large is your team?",
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
      >
        M
      </div>
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-none px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.65)",
          border: "0.5px solid rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "rgba(15,40,65,0.5)",
              animation: `typing-bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
      style={{ animation: "msg-fadein 0.3s ease-out forwards" }}
    >
      {/* Avatar */}
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
        >
          M
        </div>
      )}

      {/* Bubble */}
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={isUser ? {
          background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
          color: "#fff",
          borderBottomRightRadius: "4px",
        } : {
          background: "rgba(255,255,255,0.65)",
          border: "0.5px solid rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          color: "#0A1E33",
          borderBottomLeftRadius: "4px",
        }}
      >
        {message.content}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsExplorerPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([OPENING_MESSAGE])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<SkillsProfile | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const exchangeCount = messages.filter(m => m.role === "user").length

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    setInput("")

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setLoading(true)

    try {
      // Build conversation history for the API (exclude the hidden profile data)
      const history: SkillsChatMessage[] = nextMessages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      const { content: raw } = await chatSkillsExplorer(history)

      // Parse out SKILLS_PROFILE: block if present
      const profileMatch = raw.match(/SKILLS_PROFILE:(\{[\s\S]*\})/)
      let visible = raw
      let parsedProfile: SkillsProfile | null = null

      if (profileMatch) {
        visible = raw.slice(0, raw.indexOf("SKILLS_PROFILE:")).trimEnd()
        try {
          parsedProfile = JSON.parse(profileMatch[1]) as SkillsProfile
          setProfile(parsedProfile)
        } catch {
          /* malformed JSON — ignore profile, still show message */
        }
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: visible,
        hasProfile: !!parsedProfile,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again in a moment.",
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleViewMap() {
    if (!profile) return
    sessionStorage.setItem("skills_profile", JSON.stringify(profile))
    setTransitioning(true)
    setTimeout(() => router.push("/skills-explorer/map"), 500)
  }

  const showMapButton = profile !== null || exchangeCount >= 4

  return (
    <>
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes msg-fadein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 2px 12px rgba(15,40,65,0.3); }
          50%       { box-shadow: 0 4px 28px rgba(15,40,65,0.55), 0 0 48px rgba(15,40,65,0.18); }
        }
      `}</style>

      <div
        className="flex min-h-screen flex-col transition-all duration-500"
        style={{ opacity: transitioning ? 0 : 1, transform: transitioning ? "scale(0.97)" : "scale(1)" }}
      >
        <Header />

        {/* Progress bar */}
        <div
          className="border-b px-6 py-2"
          style={{
            background: "rgba(240,238,255,0.6)",
            borderColor: "rgba(255,255,255,0.4)",
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center gap-1.5">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                    style={step === 1 ? {
                      background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
                      color: "#fff",
                    } : {
                      background: "rgba(15,40,65,0.08)",
                      color: "rgba(10,30,51,0.3)",
                      border: "0.5px solid rgba(15,40,65,0.15)",
                    }}
                  >
                    {step}
                  </div>
                  {step < 3 && (
                    <div
                      className="h-px w-8"
                      style={{ background: "rgba(15,40,65,0.15)" }}
                    />
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs font-semibold" style={{ color: "#0F2841" }}>
              Step 1 of 3 — Understanding your needs
            </span>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">

            {/* Intro header */}
            <div className="mb-6 text-center">
              <div
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "linear-gradient(135deg, rgba(15,40,65,0.12), rgba(37,99,235,0.1))" }}
              >
                <svg className="h-6 w-6" style={{ color: "#0F2841" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h1 className="page-title text-xl">Skills Diagnostic</h1>
              <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.45)" }}>
                Answer a few questions and I'll recommend the right instruments for your organization
              </p>
            </div>

            {/* Message list */}
            <div className="flex flex-1 flex-col gap-4">
              {messages.map(m => <Bubble key={m.id} message={m} />)}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            {/* View Skills Map button */}
            {showMapButton && (
              <div
                className="mt-6 flex justify-center"
                style={{ animation: "msg-fadein 0.4s ease-out forwards" }}
              >
                <button
                  onClick={handleViewMap}
                  className="btn-primary gap-2"
                  style={profile ? { animation: "pulse-glow 2s ease-in-out infinite" } : {}}
                >
                  View Skills Map
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="mt-4">
              <div
                className="flex items-end gap-3 rounded-2xl p-2"
                style={{
                  background: "rgba(255,255,255,0.55)",
                  border: "0.5px solid rgba(255,255,255,0.8)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your reply…"
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
                  style={{ color: "#0A1E33", minHeight: "36px", maxHeight: "120px" }}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = "auto"
                    el.style.height = Math.min(el.scrollHeight, 120) + "px"
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px]" style={{ color: "rgba(10,30,51,0.3)" }}>
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

"use client"

import { ReactNode } from "react"

interface Props {
  role: "user" | "assistant"
  children: ReactNode
}

/**
 * Single message bubble. User bubbles are right-aligned with the purple-to-blue
 * gradient; assistant bubbles are left-aligned frosted glass with the "M" avatar.
 *
 * Extracted from frontend/app/skills-explorer/page.tsx (Bubble function).
 */
export default function MessageBubble({ role, children }: Props) {
  const isUser = role === "user"
  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
      style={{ animation: "msg-fadein 0.3s ease-out forwards" }}
    >
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
        >
          M
        </div>
      )}
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={
          isUser
            ? {
                background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
                color: "#fff",
                borderBottomRightRadius: "4px",
              }
            : {
                background: "rgba(255,255,255,0.65)",
                border: "0.5px solid rgba(255,255,255,0.85)",
                backdropFilter: "blur(12px)",
                color: "#0A1E33",
                borderBottomLeftRadius: "4px",
              }
        }
      >
        {children}
      </div>
    </div>
  )
}

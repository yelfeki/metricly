"use client"

/**
 * 3-dot bouncing typing indicator. Use while awaiting an async response.
 * Requires the `typing-bounce` keyframe to be in scope (see ChatShell).
 *
 * Extracted from frontend/app/skills-explorer/page.tsx.
 */
export default function TypingIndicator() {
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

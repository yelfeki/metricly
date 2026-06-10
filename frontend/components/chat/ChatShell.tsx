"use client"

import { ReactNode, useEffect, useRef } from "react"
import TypingIndicator from "./TypingIndicator"

interface Props {
  /** The header area above the message list — title, subtitle, etc. Optional. */
  header?: ReactNode
  /** Message list. Caller is responsible for rendering MessageBubble + AnswerChips. */
  children: ReactNode
  /** When true, a TypingIndicator is shown at the bottom of the list. */
  isTyping?: boolean
  /** Optional input area shown below the messages (textarea + send, custom CTA, etc.). */
  footer?: ReactNode
  /**
   * Dependency list that triggers a scroll-to-bottom when changed. Pass the
   * message array (or its length) so new messages auto-scroll into view.
   */
  scrollOn?: unknown
}

/**
 * Layout wrapper for chat-style flows. Provides:
 *   - centered max-width column
 *   - scroll-to-bottom on `scrollOn` change
 *   - keyframes (typing-bounce, msg-fadein) needed by MessageBubble + TypingIndicator
 *
 * Pure presentational — does not own message state. Each page that uses
 * ChatShell brings its own state machine (see frameworks/new/guided/page.tsx).
 */
export default function ChatShell({ header, children, isTyping, footer, scrollOn }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [scrollOn, isTyping])

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
      `}</style>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
        {header}

        <div className="flex flex-1 flex-col gap-4">
          {children}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </>
  )
}

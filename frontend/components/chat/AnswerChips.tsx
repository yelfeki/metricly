"use client"

interface Option {
  value: string
  label: string
  description?: string
}

interface SingleProps {
  options: Option[]
  multi?: false
  value?: string
  onSelect: (value: string) => void
  disabled?: boolean
  maxSelect?: never
}

interface MultiProps {
  options: Option[]
  multi: true
  value: string[]
  onSelect: (value: string[]) => void
  disabled?: boolean
  maxSelect?: number
}

type Props = SingleProps | MultiProps

/**
 * Inline answer chips below an assistant message. Supports single-select
 * (auto-advance on click) and multi-select (toggle, with optional max cap).
 * Uses the same frosted-glass styling as the rest of the design system.
 */
export default function AnswerChips(props: Props) {
  const { options, disabled } = props

  function isSelected(value: string): boolean {
    if (props.multi) return props.value.includes(value)
    return props.value === value
  }

  function handleClick(value: string) {
    if (disabled) return
    if (props.multi) {
      const already = props.value.includes(value)
      if (already) {
        props.onSelect(props.value.filter(v => v !== value))
      } else {
        if (props.maxSelect && props.value.length >= props.maxSelect) return
        props.onSelect([...props.value, value])
      }
    } else {
      props.onSelect(value)
    }
  }

  return (
    <div className="ml-10 flex flex-wrap gap-2">
      {options.map(opt => {
        const selected = isSelected(opt.value)
        return (
          <button
            key={opt.value}
            onClick={() => handleClick(opt.value)}
            disabled={disabled}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
            style={
              selected
                ? {
                    background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(15,40,65,0.25)",
                  }
                : {
                    background: "rgba(255,255,255,0.55)",
                    border: "0.5px solid rgba(255,255,255,0.8)",
                    color: "#0A1E33",
                    backdropFilter: "blur(8px)",
                  }
            }
            title={opt.description}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

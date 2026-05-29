import type { Severity } from '../types'

const CONFIG: Record<Severity, { label: string; bg: string; text: string; dot: string }> = {
  informational: { label: 'INFORMATIONAL', bg: '#052e16', text: '#22c55e', dot: '#22c55e' },
  moderate:      { label: 'MODERATE',      bg: '#451a03', text: '#f59e0b', dot: '#f59e0b' },
  severe:        { label: 'SEVERE',         bg: '#450a0a', text: '#ef4444', dot: '#ef4444' },
}

interface Props {
  severity: Severity
  size?: 'sm' | 'lg'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const c = CONFIG[severity]
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono font-bold rounded px-2 py-1"
      style={{
        background: c.bg,
        color: c.text,
        fontSize: size === 'lg' ? '1rem' : '0.75rem',
      }}
    >
      <span
        className="rounded-full"
        style={{ width: size === 'lg' ? 10 : 7, height: size === 'lg' ? 10 : 7, background: c.dot }}
      />
      {c.label}
    </span>
  )
}

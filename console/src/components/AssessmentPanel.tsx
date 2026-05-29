import { useState } from 'react'
import type { AssessResult, Severity } from '../types'

const SEV_COLOR: Record<Severity, string> = {
  informational: '#22c55e',
  moderate:      '#f59e0b',
  severe:        '#ef4444',
}
const SEV_BG: Record<Severity, string> = {
  informational: '#052e16',
  moderate:      '#3d2a00',
  severe:        '#3d0a0a',
}
const PRIORITY_COLOR: Record<string, { bg: string; text: string }> = {
  immediate: { bg: '#3d0a0a', text: '#ef4444' },
  staged:    { bg: '#3d2a00', text: '#f59e0b' },
}

interface Props {
  result: AssessResult | null
  loading: boolean
  onApprove: () => void
  onEdit: () => void
  onDismiss: () => void
  actionDone: boolean
  actionNote: string
  onNoteChange: (v: string) => void
}

export function AssessmentPanel({
  result,
  loading,
  onApprove,
  onEdit,
  onDismiss,
  actionDone,
  actionNote,
  onNoteChange,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const assessment = result?.assessment
  const plan = result?.plan
  const packet = result?.packet
  const sev = assessment?.severity ?? 'informational'
  const color = SEV_COLOR[sev]
  const bg = SEV_BG[sev]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>

      {/* Severity + confidence */}
      <div style={{ background: '#12122a', border: `1px solid ${assessment ? color + '55' : '#1e1e3a'}`, borderRadius: 8, padding: 14 }}>
        {assessment ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15,
                background: bg, color, padding: '5px 12px', borderRadius: 5,
                border: `1px solid ${color}44`,
                ...(sev === 'severe' ? { animation: 'sevpulse 1.2s ease-in-out infinite' } : {}),
              }}>
                {sev.toUpperCase()}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', marginBottom: 3 }}>
                  CONFIDENCE
                </div>
                <div style={{ height: 4, background: '#1e1e3a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.round(assessment.confidence * 100)}%`,
                    background: color, borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ fontSize: 9, color, fontFamily: 'monospace', marginTop: 2 }}>
                  {Math.round(assessment.confidence * 100)}%
                </div>
              </div>
            </div>
            <div style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', marginBottom: 4 }}>
              PRIMARY SIGNAL: <span style={{ color: '#94a3b8' }}>{assessment.primary_signal}</span>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              {assessment.rationale}
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid #4a9eff', borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>Analyzing…</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: '#2a2a4a', fontFamily: 'monospace' }}>
                — No assessment —
              </span>
            )}
          </div>
        )}
      </div>

      {/* Response plan */}
      <div style={{ background: '#12122a', border: '1px solid #1e1e3a', borderRadius: 8, padding: 14, flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Response Plan
        </div>
        {plan ? (
          <>
            {/* Escalate banner */}
            {plan.escalate_immediately && (
              <div style={{
                background: '#3d0a0a', border: '1px solid #ef4444',
                borderRadius: 4, padding: '5px 10px', marginBottom: 8,
                fontSize: 10, color: '#ef4444', fontFamily: 'monospace', fontWeight: 'bold',
                animation: 'sevpulse 1s ease-in-out infinite',
              }}>
                ⚠ ESCALATE — {plan.escalation_reason ?? 'Immediate action required'}
              </div>
            )}
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(expanded ? plan.actions : plan.actions.slice(0, 3)).map((a) => {
                const pc = PRIORITY_COLOR[a.priority] ?? PRIORITY_COLOR.staged
                return (
                  <li key={a.step} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                      background: '#1e1e3a', color: '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold', marginTop: 1,
                    }}>
                      {a.step}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold',
                        background: pc.bg, color: pc.text,
                        padding: '1px 5px', borderRadius: 3, marginRight: 5,
                      }}>
                        {a.priority.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>{a.description}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
            {plan.actions.length > 3 && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  marginTop: 8, fontSize: 10, color: '#4a9eff', fontFamily: 'monospace',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {expanded ? '↑ Show less' : `↓ View all ${plan.actions.length} actions`}
              </button>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#2a2a4a', fontFamily: 'monospace' }}>
            {loading ? 'Generating plan…' : '— No plan yet —'}
          </div>
        )}
      </div>

      {/* Action bar */}
      {packet && (
        <div style={{ background: '#12122a', border: '1px solid #1e1e3a', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Operator Action
          </div>
          {actionDone ? (
            <div style={{
              background: '#052e16', border: '1px solid #22c55e44',
              borderRadius: 5, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16, color: '#22c55e' }}>✓</span>
              <span style={{ fontSize: 11, color: '#22c55e', fontFamily: 'monospace' }}>
                Action recorded · {new Date().toLocaleTimeString()}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={actionNote}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Operator note (optional)..."
                style={{
                  width: '100%', fontSize: 11, fontFamily: 'monospace',
                  background: '#0a0a1a', color: '#e2e8f0',
                  border: '1px solid #1e1e3a', borderRadius: 4,
                  padding: '5px 8px', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={onApprove}
                style={{
                  width: '100%', padding: '8px', fontSize: 12,
                  fontFamily: 'monospace', fontWeight: 'bold',
                  background: '#052e16', color: '#22c55e',
                  border: '1px solid #22c55e55', borderRadius: 5, cursor: 'pointer',
                }}
              >
                ✓ APPROVE
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={onEdit}
                  style={{
                    flex: 1, padding: '6px', fontSize: 11,
                    fontFamily: 'monospace',
                    background: 'transparent', color: '#4a9eff',
                    border: '1px solid #4a9eff55', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={onDismiss}
                  style={{
                    flex: 1, padding: '6px', fontSize: 11,
                    fontFamily: 'monospace',
                    background: 'transparent', color: '#475569',
                    border: '1px solid #1e1e3a', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

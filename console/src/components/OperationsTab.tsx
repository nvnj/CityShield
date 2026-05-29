import React, { useState, useEffect, useCallback } from 'react'
import type { AssessResult, Severity } from '../types'
import { runAssessment, approve } from '../api'
import { SeverityBadge } from './SeverityBadge'

const ZONES = ['All zones', 'gate_a', 'gate_b', 'gate_c', 'concourse_main', 'transit_hub']

const formatZone = (z: string) =>
  z.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  immediate: { background: '#450a0a', color: '#ef4444' },
  staged:    { background: '#451a03', color: '#f59e0b' },
}

function card(children: React.ReactNode, className = '') {
  return (
    <div
      className={`rounded-lg p-4 ${className}`}
      style={{ background: '#111827', border: '1px solid #1f2937' }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#475569' }}>
      {children}
    </div>
  )
}

// Countdown timer for reassess
function ReassessTimer({ minutes }: { minutes: number }) {
  const [remaining, setRemaining] = useState(minutes * 60)
  useEffect(() => {
    setRemaining(minutes * 60)
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [minutes])
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return (
    <span className="font-mono text-sm" style={{ color: '#94a3b8' }}>
      {m}:{s.toString().padStart(2, '0')}
    </span>
  )
}

export function OperationsTab() {
  const [zone, setZone] = useState('All zones')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AssessResult | null>(null)
  const [actionDone, setActionDone] = useState(false)
  const [actionNote, setActionNote] = useState('')

  const handleAssess = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionDone(false)
    try {
      const r = await runAssessment(zone === 'All zones' ? null : zone)
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [zone])

  const handleAction = useCallback(
    async (action: 'approve' | 'dismiss' | 'edit') => {
      if (!result) return
      try {
        await approve(result.incident_id, action, actionNote)
        setActionDone(true)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [result, actionNote],
  )

  const assessment = result?.assessment
  const plan = result?.plan
  const packet = result?.packet

  return (
    <div className="space-y-4">
      {/* Zone 1 — Situational header */}
      {card(
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              {assessment ? (
                <SeverityBadge severity={assessment.severity as Severity} size="lg" />
              ) : (
                <span
                  className="text-sm font-mono px-3 py-1 rounded"
                  style={{ background: '#1f2937', color: '#64748b' }}
                >
                  NO ASSESSMENT
                </span>
              )}
              {assessment && (
                <span className="text-xs" style={{ color: '#475569' }}>
                  confidence {Math.round(assessment.confidence * 100)}% · primary: {assessment.primary_signal}
                </span>
              )}
            </div>
            {assessment ? (
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                {assessment.rationale}
              </p>
            ) : (
              <p className="text-sm" style={{ color: '#475569' }}>
                Select a zone and run an assessment to begin.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="text-sm rounded px-3 py-2"
              style={{ background: '#1f2937', color: '#e2e8f0', border: '1px solid #374151' }}
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>{z === 'All zones' ? 'All Zones' : formatZone(z)}</option>
              ))}
            </select>
            <button
              onClick={handleAssess}
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold rounded transition-colors disabled:opacity-50"
              style={{ background: loading ? '#374151' : '#1d4ed8', color: '#fff' }}
            >
              {loading ? 'Analyzing...' : 'Run Assessment'}
            </button>
          </div>
        </div>,
      )}

      {/* Error banner */}
      {error && (
        <div
          className="rounded px-4 py-3 text-sm"
          style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}
        >
          {error}
        </div>
      )}

      {/* Escalate banner */}
      {plan?.escalate_immediately && (
        <div
          className="rounded px-4 py-3 font-bold text-sm flex items-center gap-2 animate-pulse"
          style={{ background: '#450a0a', color: '#ef4444', border: '1px solid #ef4444' }}
        >
          <span>⚠</span>
          ESCALATE IMMEDIATELY — {plan.escalation_reason ?? 'Immediate supervisor notification required'}
        </div>
      )}

      {/* Zones 2 + 3 */}
      <div className="flex gap-4">
        {/* Zone 2 — Response plan (40%) */}
        <div className="w-2/5 space-y-3">
          {card(
            <>
              <SectionLabel>Response Plan</SectionLabel>
              {loading && !plan && (
                <p className="text-sm" style={{ color: '#475569' }}>
                  Generating response plan...
                </p>
              )}
              {plan ? (
                <>
                  <ol className="space-y-2">
                    {plan.actions.map((a) => (
                      <li key={a.step} className="flex gap-3 items-start">
                        <span
                          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                          style={{ background: '#1f2937', color: '#94a3b8' }}
                        >
                          {a.step}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span
                            className="inline-block text-xs font-semibold rounded px-1.5 py-0.5 mb-1"
                            style={PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.staged}
                          >
                            {a.priority.toUpperCase()}
                          </span>
                          <p className="text-sm leading-snug" style={{ color: '#cbd5e1' }}>
                            {a.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div
                    className="mt-3 pt-3 flex items-center justify-between text-xs"
                    style={{ borderTop: '1px solid #1f2937', color: '#475569' }}
                  >
                    <span>Reassess in</span>
                    <ReassessTimer minutes={plan.reassess_in_minutes} />
                  </div>
                </>
              ) : (
                !loading && (
                  <p className="text-sm" style={{ color: '#475569' }}>
                    No plan yet. Run an assessment.
                  </p>
                )
              )}
            </>,
          )}
        </div>

        {/* Zone 3 — Incident packet (60%) */}
        <div className="flex-1 space-y-3">
          {card(
            <>
              <SectionLabel>Incident Packet</SectionLabel>

              {loading && !packet && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: '#1d4ed8', borderTopColor: 'transparent' }}
                  />
                  <p className="text-sm" style={{ color: '#475569' }}>Analyzing signals...</p>
                </div>
              )}

              {packet && (
                <>
                  <h2 className="text-base font-semibold leading-snug mb-3" style={{ color: '#e2e8f0' }}>
                    {packet.headline}
                  </h2>

                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#94a3b8' }}>
                    {packet.summary}
                  </p>

                  {packet.evidence.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
                        Evidence
                      </div>
                      <ul className="space-y-1">
                        {packet.evidence.map((e, i) => (
                          <li key={i} className="text-sm flex gap-2" style={{ color: '#cbd5e1' }}>
                            <span style={{ color: '#1d4ed8' }}>›</span>
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {packet.recommended_actions.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
                        Recommended Actions
                      </div>
                      <ul className="space-y-1">
                        {packet.recommended_actions.map((a, i) => (
                          <li key={i} className="text-sm flex gap-2" style={{ color: '#cbd5e1' }}>
                            <span style={{ color: '#22c55e' }}>✓</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action bar — human gate (invariant #3) */}
                  <div
                    className="pt-3 mt-2"
                    style={{ borderTop: '1px solid #1f2937' }}
                  >
                    {actionDone ? (
                      <div
                        className="text-sm font-semibold px-3 py-2 rounded"
                        style={{ background: '#052e16', color: '#22c55e' }}
                      >
                        Action recorded — operator decision logged.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={actionNote}
                          onChange={(e) => setActionNote(e.target.value)}
                          placeholder="Optional operator note..."
                          className="w-full text-sm rounded px-3 py-2"
                          style={{ background: '#1f2937', color: '#e2e8f0', border: '1px solid #374151' }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction('approve')}
                            className="flex-1 py-2 text-sm font-semibold rounded transition-colors"
                            style={{ background: '#14532d', color: '#22c55e' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction('edit')}
                            className="flex-1 py-2 text-sm font-semibold rounded transition-colors"
                            style={{ background: '#1e3a5f', color: '#60a5fa' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleAction('dismiss')}
                            className="flex-1 py-2 text-sm font-semibold rounded transition-colors"
                            style={{ background: '#1f2937', color: '#64748b' }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!packet && !loading && (
                <p className="text-sm" style={{ color: '#475569' }}>
                  No incident packet yet. Run an assessment.
                </p>
              )}
            </>,
          )}

          {/* Metadata row */}
          {result && (
            <div
              className="flex flex-wrap gap-4 text-xs px-1"
              style={{ color: '#475569' }}
            >
              <span>incident: <span style={{ color: '#64748b' }}>{result.incident_id.slice(0, 8)}...</span></span>
              <span>zone: <span style={{ color: '#64748b' }}>{result.zone ? formatZone(result.zone) : 'All Zones'}</span></span>
              <span>window: <span style={{ color: '#64748b' }}>{result.window_minutes}m</span></span>
              <span>completed: <span style={{ color: '#64748b' }}>{new Date(result.pipeline_completed_at).toLocaleTimeString()}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

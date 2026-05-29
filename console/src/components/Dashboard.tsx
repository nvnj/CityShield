import { useState, useEffect, useCallback, useRef } from 'react'
import type { AssessResult, LatestSignals, Severity } from '../types'
import { runAssessment, approve, getLatestSignals } from '../api'
import { StadiumMap, STADIUM_ZONES } from './StadiumMap'
import { CameraFeed } from './CameraFeed'
import { SignalGauges } from './SignalGauges'
import { AssessmentPanel } from './AssessmentPanel'

const formatZone = (z: string) =>
  z.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

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

function useCountdown(targetSeconds: number, running: boolean) {
  const [remaining, setRemaining] = useState(targetSeconds)
  useEffect(() => {
    if (!running) { setRemaining(targetSeconds); return }
    setRemaining(targetSeconds)
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [targetSeconds, running])
  return remaining
}

export function Dashboard() {
  const [selectedZone, setSelectedZone] = useState<string>('gate_a')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AssessResult | null>(null)
  const [actionDone, setActionDone] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [signals, setSignals] = useState<LatestSignals | null>(null)
  const [sigLoading, setSigLoading] = useState(false)
  const autoRefreshRef = useRef(autoRefresh)
  autoRefreshRef.current = autoRefresh

  const countdown = useCountdown(30, autoRefresh)

  const fetchSignals = useCallback(async (zone: string) => {
    setSigLoading(true)
    try {
      const s = await getLatestSignals(zone)
      setSignals(s)
    } catch {
      // keep stale on error
    } finally {
      setSigLoading(false)
    }
  }, [])

  // Fetch signals whenever zone changes
  useEffect(() => {
    fetchSignals(selectedZone)
  }, [selectedZone, fetchSignals])

  // Auto-refresh signals every 30s
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => fetchSignals(selectedZone), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, selectedZone, fetchSignals])

  const handleAssess = useCallback(async (zone?: string) => {
    const z = zone ?? selectedZone
    setLoading(true)
    setError(null)
    setActionDone(false)
    try {
      const r = await runAssessment(z)
      setResult(r)
      // Refresh signals after assessment
      fetchSignals(z)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [selectedZone, fetchSignals])

  const handleZoneClick = useCallback((zoneId: string) => {
    setSelectedZone(zoneId)
    handleAssess(zoneId)
  }, [handleAssess])

  const handleAction = useCallback(async (action: 'approve' | 'dismiss' | 'edit') => {
    if (!result) return
    try {
      await approve(result.incident_id, action, actionNote)
      setActionDone(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [result, actionNote])

  // Build zone severity map from the current result's zone
  const zoneSeverity: Record<string, Severity> = {}
  if (result?.assessment && result.zone) {
    zoneSeverity[result.zone] = result.assessment.severity
  }

  const sev = result?.assessment?.severity ?? null
  const sevColor = sev ? SEV_COLOR[sev] : '#2a2a4a'
  const sevBg = sev ? SEV_BG[sev] : '#12122a'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a1a',
      backgroundImage: 'linear-gradient(rgba(74,158,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,158,255,0.03) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{
        background: '#0d0d20',
        borderBottom: '1px solid #1e1e3a',
        padding: '0 24px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
      }}>
        {/* Left: logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
            display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15,
            color: '#e2e8f0', letterSpacing: '0.2em',
          }}>
            CITYSHIELD
          </span>
          <span style={{
            fontSize: 10, color: '#2a2a5a',
            fontFamily: 'monospace', marginLeft: 4,
          }}>
            v0.1
          </span>
        </div>

        {/* Center: title */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <span style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            World Cup 2026 · Operations Console
          </span>
        </div>

        {/* Right: severity + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sev && (
            <span style={{
              fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13,
              background: sevBg, color: sevColor,
              padding: '4px 14px', borderRadius: 5,
              border: `1px solid ${sevColor}55`,
              ...(sev === 'severe' ? { animation: 'sevpulse 1.2s ease-in-out infinite' } : {}),
            }}>
              {sev.toUpperCase()}
            </span>
          )}
          <button
            onClick={() => handleAssess()}
            disabled={loading}
            style={{
              padding: '5px 16px', fontSize: 11,
              fontFamily: 'monospace', fontWeight: 'bold',
              background: loading ? '#1e1e3a' : '#4a9eff',
              color: loading ? '#475569' : '#0a0a1a',
              border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Analyzing…' : 'Run Assessment'}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '5px 12px', fontSize: 10,
              fontFamily: 'monospace',
              background: autoRefresh ? '#0f1f3d' : 'transparent',
              color: autoRefresh ? '#4a9eff' : '#475569',
              border: `1px solid ${autoRefresh ? '#4a9eff55' : '#1e1e3a'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {autoRefresh ? `AUTO ${countdown}s` : 'AUTO OFF'}
          </button>
        </div>
      </header>

      {/* ── Error banner ───────────────────────────────────── */}
      {error && (
        <div style={{
          background: '#3d0a0a', borderBottom: '1px solid #ef444466',
          padding: '6px 24px', fontSize: 11, color: '#fca5a5', fontFamily: 'monospace',
        }}>
          {error}
        </div>
      )}

      {/* ── Three-column main ──────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '40% 30% 30%',
        gap: 12,
        padding: '12px 16px',
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* ── Column 1: Stadium + Camera ─────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {/* Zone selector pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {STADIUM_ZONES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleZoneClick(id)}
                style={{
                  fontSize: 9, fontFamily: 'monospace', padding: '3px 8px',
                  borderRadius: 3, cursor: 'pointer', border: '1px solid',
                  background: selectedZone === id ? '#0f1f3d' : 'transparent',
                  color: selectedZone === id ? '#4a9eff' : '#475569',
                  borderColor: selectedZone === id ? '#4a9eff55' : '#1e1e3a',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stadium SVG */}
          <div style={{ background: '#12122a', border: '1px solid #1e1e3a', borderRadius: 8, padding: 10, flex: '0 0 auto' }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#2a2a5a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Stadium Overview · Click Zone to Assess
            </div>
            <StadiumMap
              selectedZone={selectedZone}
              zoneSeverity={zoneSeverity}
              onZoneClick={handleZoneClick}
            />
          </div>

          {/* Camera feed */}
          <div style={{ background: '#12122a', border: '1px solid #1e1e3a', borderRadius: 8, padding: 10, flex: 1 }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#2a2a5a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Computer Vision Feed
            </div>
            <CameraFeed
              density={signals?.density ?? 0}
              zone={formatZone(selectedZone)}
            />
          </div>
        </div>

        {/* ── Column 2: Signal Gauges ────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#2a2a5a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Live Signals · {formatZone(selectedZone)}
            {sigLoading && (
              <span style={{ color: '#4a9eff', marginLeft: 8 }}>↻</span>
            )}
          </div>
          <SignalGauges signals={signals} loading={sigLoading} />
        </div>

        {/* ── Column 3: Assessment ──────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#2a2a5a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Situational Assessment
          </div>
          <AssessmentPanel
            result={result}
            loading={loading}
            onApprove={() => handleAction('approve')}
            onEdit={() => handleAction('edit')}
            onDismiss={() => handleAction('dismiss')}
            actionDone={actionDone}
            actionNote={actionNote}
            onNoteChange={setActionNote}
          />
        </div>
      </div>

      {/* ── Footer status bar ─────────────────────────────── */}
      <footer style={{
        background: '#0d0d20',
        borderTop: '1px solid #1e1e3a',
        padding: '5px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#2a2a5a' }}>
          {result
            ? `INC ${result.incident_id.slice(0, 8)}…`
            : 'NO INCIDENT'}
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#2a2a5a' }}>
          {result
            ? `${formatZone(result.zone ?? selectedZone)} · ${result.window_minutes}m · ${new Date(result.pipeline_completed_at).toLocaleTimeString()}`
            : `Zone: ${formatZone(selectedZone)}`}
          {autoRefresh && ` · next refresh ${countdown}s`}
        </span>
      </footer>
    </div>
  )
}

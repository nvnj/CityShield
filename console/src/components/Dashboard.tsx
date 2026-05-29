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

const HEADER_H  = 52
const FOOTER_H  = 32
const SECTION_H = `calc(100vh - ${HEADER_H}px - ${FOOTER_H}px)`

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

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#6a6a9a',
  textTransform: 'uppercase',
  letterSpacing: '2px',
  flexShrink: 0,
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
      setSignals(await getLatestSignals(zone))
    } catch { /* keep stale */ } finally {
      setSigLoading(false)
    }
  }, [])

  useEffect(() => { fetchSignals(selectedZone) }, [selectedZone, fetchSignals])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => fetchSignals(selectedZone), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, selectedZone, fetchSignals])

  const handleAssess = useCallback(async (zone?: string) => {
    const z = zone ?? selectedZone
    setLoading(true); setError(null); setActionDone(false)
    try {
      const r = await runAssessment(z)
      setResult(r)
      fetchSignals(z)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
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

  const zoneSeverity: Record<string, Severity> = {}
  if (result?.assessment && result.zone) zoneSeverity[result.zone] = result.assessment.severity

  const sev      = result?.assessment?.severity ?? null
  const sevColor = sev ? SEV_COLOR[sev] : '#2a2a4a'
  const sevBg    = sev ? SEV_BG[sev]   : '#12122a'

  return (
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      background: '#0a0a1a',
      backgroundImage: 'linear-gradient(rgba(74,158,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,158,255,0.03) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* ── Header ──────────────────────────────────────── */}
      <header style={{
        height: HEADER_H,
        background: '#0d0d20',
        borderBottom: '1px solid #1e1e3a',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
            display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15, color: '#ffffff', letterSpacing: '0.2em' }}>
            CITYSHIELD
          </span>
          <span style={{ fontSize: 10, color: '#3a3a6a', fontFamily: 'monospace' }}>v0.1</span>
        </div>

        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <span style={{ fontSize: 12, color: '#6a6a9a', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            World Cup 2026 · Operations Console
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sev && (
            <span style={{
              fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12,
              background: sevBg, color: sevColor,
              padding: '4px 12px', borderRadius: 4,
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
              padding: '5px 16px', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold',
              background: loading ? '#1e1e3a' : '#4a9eff',
              color: loading ? '#6a6a9a' : '#0a0a1a',
              border: '1px solid #1e3a5f',
              borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Analyzing…' : 'Run Assessment'}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '5px 12px', fontSize: 10, fontFamily: 'monospace',
              background: autoRefresh ? '#1e3a5f' : 'transparent',
              color: autoRefresh ? '#ffffff' : '#6a6a9a',
              border: `1px solid ${autoRefresh ? '#4a9eff' : '#1e1e3a'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {autoRefresh ? `AUTO ${countdown}s` : 'AUTO OFF'}
          </button>
        </div>
      </header>

      {/* ── Error banner (zero-height when absent) ──────── */}
      {error && (
        <div style={{
          background: '#3d0a0a', borderBottom: '1px solid #ef444466',
          padding: '4px 20px', fontSize: 11, color: '#fca5a5',
          fontFamily: 'monospace', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* ── Three-column main ────────────────────────────── */}
      <div style={{
        height: SECTION_H,
        display: 'grid',
        gridTemplateColumns: '35% 30% 35%',
        gap: 10,
        padding: '10px 14px',
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* ── Col 1: Stadium (50%) + Camera (50%) ─────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          {/* Zone pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
            {STADIUM_ZONES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleZoneClick(id)}
                style={{
                  fontSize: 10, fontFamily: 'monospace', padding: '3px 9px',
                  borderRadius: 4, cursor: 'pointer',
                  background: selectedZone === id ? '#1e3a5f' : 'transparent',
                  color:      selectedZone === id ? '#ffffff' : '#6a6a9a',
                  border:     `1px solid ${selectedZone === id ? '#4a9eff' : '#1e1e3a'}`,
                  transition: 'all 0.15s',
                  fontWeight: selectedZone === id ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stadium map card — 50% of column height */}
          <div style={{
            background: '#0d0d2a', border: '1px solid #1e1e3a', borderRadius: 8,
            padding: '8px 10px',
            flex: '1 1 0', minHeight: 0, overflow: 'visible',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>
              Stadium Overview · Click Zone to Assess
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'visible' }}>
              <StadiumMap
                selectedZone={selectedZone}
                zoneSeverity={zoneSeverity}
                onZoneClick={handleZoneClick}
              />
            </div>
          </div>

          {/* Camera feed card — 50% of column height */}
          <div style={{
            background: '#0d0d2a', border: '1px solid #1e1e3a', borderRadius: 8,
            padding: '8px 10px',
            flex: '1 1 0', minHeight: 0, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>
              Computer Vision Feed
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <CameraFeed
                density={signals?.density ?? 0}
                zone={formatZone(selectedZone)}
              />
            </div>
          </div>
        </div>

        {/* ── Col 2: Signal gauges ─────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ ...LABEL_STYLE, flexShrink: 0 }}>
            Live Signals · {formatZone(selectedZone)}
            {sigLoading && <span style={{ color: '#4a9eff', marginLeft: 8 }}>↻</span>}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <SignalGauges signals={signals} loading={sigLoading} />
          </div>
        </div>

        {/* ── Col 3: Assessment panel ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ ...LABEL_STYLE, flexShrink: 0 }}>
            Situational Assessment
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer style={{
        height: FOOTER_H,
        background: '#0d0d20',
        borderTop: '1px solid #1e1e3a',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#3a3a6a' }}>
          {result ? `INC ${result.incident_id.slice(0, 8)}…` : 'NO INCIDENT'}
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#3a3a6a' }}>
          {result
            ? `${formatZone(result.zone ?? selectedZone)} · ${result.window_minutes}m · ${new Date(result.pipeline_completed_at).toLocaleTimeString()}`
            : `Zone: ${formatZone(selectedZone)}`}
          {autoRefresh && ` · next refresh ${countdown}s`}
        </span>
      </footer>
    </div>
  )
}

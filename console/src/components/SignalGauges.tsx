import type { LatestSignals } from '../types'

// SVG strokeDasharray ring gauge — no recharts, no overlap
interface GaugeProps {
  pct: number        // 0–1
  color: string
  label: string
  valueText: string
  subText: string
  subIsAlert?: boolean
}

const R = 44          // ring radius
const CIRC = Math.PI * R   // half-circle circumference (startAngle 180→0)
const STROKE = 8

function RingGauge({ pct, color, label, valueText, subText, subIsAlert }: GaugeProps) {
  const filled = Math.max(0, Math.min(1, pct)) * CIRC
  const empty  = CIRC - filled

  return (
    <div style={{
      background: '#0d0d2a',
      border: '1px solid #1e1e3a',
      borderRadius: 8,
      padding: '14px 16px 12px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      {/* Card label */}
      <div style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#a0a0c0',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: 8,
        flexShrink: 0,
      }}>
        {label}
      </div>

      {/* Gauge + text below */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <svg
          viewBox="0 0 100 54"
          width="140"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Track (background arc) */}
          <path
            d={`M ${STROKE / 2} 50 A ${R} ${R} 0 0 1 ${100 - STROKE / 2} 50`}
            fill="none"
            stroke="#1e1e3a"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Value arc */}
          {filled > 0 && (
            <path
              d={`M ${STROKE / 2} 50 A ${R} ${R} 0 0 1 ${100 - STROKE / 2} 50`}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${empty}`}
              style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
            />
          )}
        </svg>

        {/* Value text below arc */}
        <div style={{
          fontSize: 28,
          fontFamily: 'monospace',
          fontWeight: 600,
          color: '#ffffff',
          lineHeight: 1,
          marginTop: 4,
        }}>
          {valueText}
        </div>
        <div style={{
          fontSize: 11,
          fontFamily: 'monospace',
          color: subIsAlert ? '#ef4444' : '#6a6a9a',
          marginTop: 4,
        }}>
          {subText}
        </div>
      </div>
    </div>
  )
}

function densityColor(d: number) {
  return d > 0.75 ? '#ef4444' : d >= 0.5 ? '#f59e0b' : '#22c55e'
}
function speedColor(s: number) {
  return s < 15 ? '#ef4444' : s < 30 ? '#f59e0b' : '#22c55e'
}
function sentimentColor(s: number) {
  return s < -0.3 ? '#ef4444' : s < 0.2 ? '#f59e0b' : '#22c55e'
}

interface Props {
  signals: LatestSignals | null
  loading: boolean
}

export function SignalGauges({ signals }: Props) {
  const density   = signals?.density        ?? 0
  const speed     = signals?.speed_avg      ?? 0
  const sentiment = signals?.sentiment_score ?? 0
  const keywords  = signals?.keywords       ?? []
  const incident  = signals?.incident       ?? 'none'
  const headcount = signals?.headcount      ?? 0

  // Always render gauges (show zeros until data arrives)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <RingGauge
        pct={density}
        color={densityColor(density)}
        label="Crowd Density"
        valueText={`${Math.round(density * 100)}%`}
        subText={headcount > 0 ? `~${headcount.toLocaleString()} est.` : 'DENSITY'}
      />
      <RingGauge
        pct={Math.min(1, speed / 60)}
        color={speedColor(speed)}
        label="Traffic Flow"
        valueText={`${speed.toFixed(0)} mph`}
        subText={incident !== 'none' ? incident : 'SPEED AVG'}
        subIsAlert={incident !== 'none'}
      />
      <RingGauge
        pct={(sentiment + 1) / 2}
        color={sentimentColor(sentiment)}
        label="Sentiment Index"
        valueText={`${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(2)}`}
        subText={keywords.length > 0 ? keywords.slice(0, 2).join(' · ') : 'SENTIMENT'}
      />
    </div>
  )
}

import type { LatestSignals } from '../types'

// Fixed internal coordinate system — viewBox "0 0 200 120"
// Arc: cx=100, cy=95, r=70 — top semicircle spans y=25 to y=95
// Value text: y=115 (inside viewBox). Sub label: y=131 would overflow,
// so we fit both inside 120 by placing value at y=112, sub at y=128...
// Wait — viewBox height is 120 so we keep sub at y=119 (just inside).
// The SVG fills 100%×100% of its parent div; viewBox handles all scaling.

const R      = 70
const STROKE = 10
const CIRC   = Math.PI * R   // semicircle circumference ≈ 219.9

interface GaugeProps {
  pct: number        // 0–1
  color: string
  label: string
  valueText: string
  subText: string
  subIsAlert?: boolean
}

function RingGauge({ pct, color, label, valueText, subText, subIsAlert }: GaugeProps) {
  const safePct    = Math.max(0, Math.min(1, pct ?? 0))
  const dashOffset = CIRC * (1 - safePct)

  return (
    // Card: flex column, takes equal share of parent column height
    <div style={{
      background: '#0d0d2a',
      border: '1px solid #1e1e3a',
      borderRadius: 8,
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      {/* Label row — fixed height, never scales */}
      <div style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#a0a0c0',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: 4,
        flexShrink: 0,
      }}>
        {label}
      </div>

      {/* SVG wrapper: takes all remaining card height */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg
          viewBox="0 0 200 120"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          {/* Track arc — background semicircle */}
          <circle
            cx="100" cy="95" r={R}
            fill="none"
            stroke="#1e1e3a"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            transform="rotate(-180 100 95)"
          />
          {/* Value arc — animates via dashOffset */}
          <circle
            cx="100" cy="95" r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-180 100 95)"
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease' }}
          />
          {/* Value — y=103, inside viewBox height 120 */}
          <text
            x="100" y="103"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="22"
            fontFamily="monospace"
            fontWeight="600"
            fill="#ffffff"
          >
            {valueText}
          </text>
          {/* Sub label — y=117, inside viewBox height 120 */}
          <text
            x="100" y="117"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontFamily="monospace"
            fill={subIsAlert ? '#ef4444' : '#6a6a9a'}
          >
            {subText}
          </text>
        </svg>
      </div>
    </div>
  )
}

function densityColor(d: number)   { return d > 0.75 ? '#ef4444' : d >= 0.5 ? '#f59e0b' : '#22c55e' }
function speedColor(s: number)     { return s < 15   ? '#ef4444' : s < 30   ? '#f59e0b' : '#22c55e' }
function sentimentColor(s: number) { return s < -0.3 ? '#ef4444' : s < 0.2  ? '#f59e0b' : '#22c55e' }

interface Props {
  signals: LatestSignals | null
  loading: boolean
}

export function SignalGauges({ signals }: Props) {
  console.log('signals data:', signals)

  const density   = signals?.density         ?? 0
  const speed     = signals?.speed_avg       ?? 0
  const sentiment = signals?.sentiment_score ?? 0
  const keywords  = signals?.keywords        ?? []
  const incident  = signals?.incident        ?? 'none'
  const headcount = signals?.headcount       ?? 0

  return (
    // Outer wrapper: flex column fills the column slot, gaps between cards
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
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

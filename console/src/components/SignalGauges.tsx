import type { LatestSignals } from '../types'

// viewBox "0 0 200 115"
// Arc center cy=72, r=55 → top half arc spans y=17 to y=72, text y=88 and y=104.
// Aspect ratio 200:115 = 1.74 → card needs only 115/200 × card_width height.
// Uses strokeDashoffset on <circle> for smooth animated arc.

const R      = 55
const STROKE = 9
const CIRC   = Math.PI * R   // semicircle circumference ≈ 172.8

interface GaugeProps {
  pct: number          // 0–1, defaults to 0 if undefined/null
  color: string
  label: string
  valueText: string
  subText: string
  subIsAlert?: boolean
}

function RingGauge({ pct, color, label, valueText, subText, subIsAlert }: GaugeProps) {
  // FIX 3: clamp to 0–1, then compute strokeDashoffset
  const safePct  = Math.max(0, Math.min(1, pct ?? 0))
  const dashOffset = CIRC * (1 - safePct)

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
      overflow: 'hidden',
    }}>
      {/* Card label */}
      <div style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#a0a0c0',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: 6,
        flexShrink: 0,
      }}>
        {label}
      </div>

      {/* Single SVG: arc + value + label — all inside viewBox, scales with card width */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <svg
          viewBox="0 0 200 115"
          width="100%"
          style={{ display: 'block' }}
        >
          {/* Track arc — top semicircle, center (100,72), r=55, open side down */}
          <circle
            cx="100" cy="72" r={R}
            fill="none"
            stroke="#1e1e3a"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            transform="rotate(-180 100 72)"
          />
          {/* Value arc */}
          <circle
            cx="100" cy="72" r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-180 100 72)"
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease' }}
          />
          {/* Value — y=88, inside viewBox height 115 */}
          <text
            x="100" y="88"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="22"
            fontFamily="monospace"
            fontWeight="600"
            fill="#ffffff"
          >
            {valueText}
          </text>
          {/* Sub label — y=104, inside viewBox height 115 */}
          <text
            x="100" y="104"
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
  // FIX 3: all values default to 0 (not undefined/null) before being passed as pct
  const density   = signals?.density         ?? 0
  const speed     = signals?.speed_avg       ?? 0
  const sentiment = signals?.sentiment_score ?? 0
  const keywords  = signals?.keywords        ?? []
  const incident  = signals?.incident        ?? 'none'
  const headcount = signals?.headcount       ?? 0

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

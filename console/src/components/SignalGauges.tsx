import type { LatestSignals } from '../types'

// FIX 2: viewBox "0 0 200 150" — arc center (100,100), r=80
// Text at y=125 (value) and y=142 (label) — both inside viewBox
// FIX 3: uses strokeDashoffset on <circle> for smooth animated arc

const R      = 80
const STROKE = 12
// Semicircle circumference: half of full circle
const CIRC   = Math.PI * R   // ≈ 251.3

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
      overflow: 'visible',
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

      {/* FIX 2: single SVG contains arc + value text + sub text */}
      <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
        <svg
          viewBox="0 0 200 150"
          width="160"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Track arc — static background semicircle */}
          <circle
            cx="100" cy="100" r={R}
            fill="none"
            stroke="#1e1e3a"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            // rotate -180° so arc starts at left (9 o'clock) sweeping to right
            transform="rotate(-180 100 100)"
          />
          {/* Value arc — animated via strokeDashoffset */}
          <circle
            cx="100" cy="100" r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC * 10}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-180 100 100)"
            style={{
              transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease',
            }}
          />
          {/* FIX 2: value text at y=125, inside viewBox */}
          <text
            x="100" y="122"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="26"
            fontFamily="monospace"
            fontWeight="600"
            fill="#ffffff"
          >
            {valueText}
          </text>
          {/* FIX 2: sub label at y=142, inside viewBox */}
          <text
            x="100" y="142"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
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

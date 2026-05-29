import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'
import type { LatestSignals } from '../types'

interface GaugeProps {
  value: number       // 0–100 normalised
  color: string
  label: string
  centerTop: string
  centerSub: string
}

function Gauge({ value, color, label, centerTop, centerSub }: GaugeProps) {
  const data = [{ value, fill: color }]
  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #1e1e3a',
      borderRadius: 8,
      padding: '12px 12px 8px',
    }}>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ position: 'relative', height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="80%"
            innerRadius="60%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={data}
          >
            {/* Track */}
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              background={{ fill: '#1e1e3a' }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div style={{
          position: 'absolute', bottom: 12, left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 'bold', color, lineHeight: 1 }}>
            {centerTop}
          </div>
          <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>
            {centerSub}
          </div>
        </div>
      </div>
    </div>
  )
}

interface Props {
  signals: LatestSignals | null
  loading: boolean
}

function densityColor(d: number) {
  return d > 0.75 ? '#ef4444' : d >= 0.5 ? '#f59e0b' : '#22c55e'
}
function speedColor(s: number) {
  // slow = bad (red), fast = good (green), 0–60 mph scale
  return s < 15 ? '#ef4444' : s < 30 ? '#f59e0b' : '#22c55e'
}
function sentimentColor(s: number) {
  return s < -0.3 ? '#ef4444' : s < 0.2 ? '#f59e0b' : '#22c55e'
}

export function SignalGauges({ signals, loading }: Props) {
  const density = signals?.density ?? 0
  const speed = signals?.speed_avg ?? 0
  const sentiment = signals?.sentiment_score ?? 0
  const keywords = signals?.keywords ?? []
  const incident = signals?.incident ?? 'none'
  const headcount = signals?.headcount ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loading && !signals && (
        <div style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', padding: 20 }}>
          Loading signals…
        </div>
      )}

      <Gauge
        value={Math.round(density * 100)}
        color={densityColor(density)}
        label="Crowd Density"
        centerTop={`${Math.round(density * 100)}%`}
        centerSub={headcount > 0 ? `~${headcount.toLocaleString()} est.` : 'DENSITY'}
      />

      <Gauge
        value={Math.min(100, Math.round((speed / 60) * 100))}
        color={speedColor(speed)}
        label="Traffic Flow"
        centerTop={`${speed.toFixed(0)} mph`}
        centerSub={incident !== 'none'
          ? <span style={{ color: '#ef4444' }}>{incident}</span> as unknown as string
          : 'SPEED AVG'}
      />

      <div style={{
        background: '#12122a',
        border: '1px solid #1e1e3a',
        borderRadius: 8,
        padding: '12px 12px 8px',
      }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Sentiment Index
        </div>
        <div style={{ position: 'relative', height: 110 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="80%"
              innerRadius="60%"
              outerRadius="100%"
              startAngle={180}
              endAngle={0}
              data={[{ value: Math.round(((sentiment + 1) / 2) * 100), fill: sentimentColor(sentiment) }]}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={4}
                background={{ fill: '#1e1e3a' }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{
            position: 'absolute', bottom: 12, left: 0, right: 0,
            textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 'bold', color: sentimentColor(sentiment), lineHeight: 1 }}>
              {sentiment >= 0 ? '+' : ''}{sentiment.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>
              {keywords.length > 0 ? keywords.slice(0, 2).join(' · ') : 'SENTIMENT'}
            </div>
          </div>
        </div>
        {keywords.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {keywords.slice(0, 3).map((kw) => (
              <span key={kw} style={{
                fontSize: 9, fontFamily: 'monospace',
                background: '#1e1e3a', color: '#64748b',
                padding: '1px 6px', borderRadius: 3,
              }}>
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

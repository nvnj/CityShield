import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getSignals } from '../api'

const ELASTIC_URL = import.meta.env.VITE_ELASTIC_URL ?? 'https://cityshield-de66e7.es.us-central1.gcp.elastic.cloud'
const KIBANA_URL = ELASTIC_URL.replace('.es.', '.kb.')

interface ChartRow { time: string; value: number }

function toTime(ts: unknown): string {
  if (!ts) return ''
  return new Date(String(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StreamChart({
  title,
  data,
  dataKey,
  color,
  domain,
  refLine,
  loading,
}: {
  title: string
  data: ChartRow[]
  dataKey: string
  color: string
  domain: [number, number]
  refLine?: number
  loading: boolean
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: '#111827', border: '1px solid #1f2937' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
          {title}
        </div>
        <div className="text-xs" style={{ color: '#475569' }}>
          {loading ? 'Refreshing...' : `${data.length} readings`}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-28 text-xs" style={{ color: '#374151' }}>
          No data in window — run feeders to populate
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 10, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 4, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color }}
            />
            {refLine !== undefined && (
              <ReferenceLine y={refLine} stroke="#ef444444" strokeDasharray="3 3" />
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function SignalsTab() {
  const [crowd, setCrowd] = useState<ChartRow[]>([])
  const [traffic, setTraffic] = useState<ChartRow[]>([])
  const [sentiment, setSentiment] = useState<ChartRow[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [c, t, s] = await Promise.all([
        getSignals('crowd', 30),
        getSignals('traffic', 30),
        getSignals('sentiment', 30),
      ])
      setCrowd(
        (c as Record<string, unknown>[])
          .map((d) => ({ time: toTime(d.timestamp), value: Number(d.density ?? 0) }))
          .filter((r) => r.time)
          .reverse(),
      )
      setTraffic(
        (t as Record<string, unknown>[])
          .map((d) => ({ time: toTime(d.timestamp), value: Number(d.vehicle_count ?? 0) }))
          .filter((r) => r.time)
          .reverse(),
      )
      setSentiment(
        (s as Record<string, unknown>[])
          .map((d) => ({ time: toTime(d.timestamp), value: Number(d.sentiment_score ?? 0) }))
          .filter((r) => r.time)
          .reverse(),
      )
      setLastRefresh(new Date())
    } catch {
      // keep stale data on error
    } finally {
      setLoading(false)
    }
  }, [])

  // initial load + 30s auto-refresh
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: '#64748b' }}>
          Live Signal Streams — last 30 minutes
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs" style={{ color: '#475569' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: '#1f2937', color: '#64748b' }}
          >
            Refresh now
          </button>
          <a
            href={`${KIBANA_URL}/app/discover`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={{ background: '#1e3a5f', color: '#60a5fa' }}
          >
            Open Kibana →
          </a>
        </div>
      </div>

      {/* Charts */}
      <StreamChart
        title="Crowd Density (CV optical-flow estimate)"
        data={crowd}
        dataKey="value"
        color="#60a5fa"
        domain={[0, 1]}
        refLine={0.75}
        loading={loading}
      />
      <StreamChart
        title="Traffic — Vehicle Count"
        data={traffic}
        dataKey="value"
        color="#34d399"
        domain={[0, 150]}
        refLine={80}
        loading={loading}
      />
      <StreamChart
        title="Sentiment Score (−1 negative → +1 positive)"
        data={sentiment}
        dataKey="value"
        color="#f59e0b"
        domain={[-1, 1]}
        refLine={-0.5}
        loading={loading}
      />

      {/* Legend */}
      <div
        className="text-xs px-3 py-2 rounded"
        style={{ background: '#111827', border: '1px solid #1f2937', color: '#475569' }}
      >
        Dashed red lines = alert thresholds (density &gt; 0.75, vehicles &gt; 80, sentiment &lt; −0.5).
        Auto-refreshes every 30s. Run{' '}
        <code style={{ color: '#94a3b8' }}>make run-feeders</code> to populate streams.
      </div>
    </div>
  )
}

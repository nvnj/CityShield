import type { Severity } from '../types'

export interface ZoneId {
  id: string
  label: string
}

export const STADIUM_ZONES: ZoneId[] = [
  { id: 'gate_a',      label: 'Gate A' },
  { id: 'gate_b',      label: 'Gate B' },
  { id: 'gate_c',      label: 'Gate C' },
  { id: 'gate_d',      label: 'Gate D' },
  { id: 'north_stand', label: 'North Stand' },
  { id: 'south_stand', label: 'South Stand' },
]

interface ZoneSeverity { [zoneId: string]: Severity }

interface Props {
  selectedZone: string | null
  zoneSeverity?: ZoneSeverity
  onZoneClick: (zoneId: string) => void
}

// cx,cy = center; rx,ry = radii for outer ring; each zone is a radial arc segment
// We use clipPath trick: zone shape = difference of outer arc sector minus inner oval
// Simpler approach: each zone is a path tracing outer arc + inner arc back

const CX = 200
const CY = 160
const ORX = 185
const ORY = 145
const IRX = 115
const IRY = 88

function polarOuter(angleDeg: number) {
  const r = angleDeg * (Math.PI / 180)
  return { x: CX + ORX * Math.cos(r), y: CY + ORY * Math.sin(r) }
}
function polarInner(angleDeg: number) {
  const r = angleDeg * (Math.PI / 180)
  return { x: CX + IRX * Math.cos(r), y: CY + IRY * Math.sin(r) }
}

function arcPath(startDeg: number, endDeg: number): string {
  const o1 = polarOuter(startDeg)
  const o2 = polarOuter(endDeg)
  const i1 = polarInner(endDeg)
  const i2 = polarInner(startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${ORX} ${ORY} 0 ${largeArc} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${IRX} ${IRY} 0 ${largeArc} 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

// Zone angular spans (clockwise from top = -90°)
// Gate A = bottom (90°), Gate B = right (0°), Gate C = top (-90°/270°), Gate D = left (180°)
// North Stand = top-right arc, South Stand = bottom-left arc
const ZONE_ARCS: Record<string, [number, number]> = {
  gate_c:      [-120, -60],
  north_stand: [-60,   30],
  gate_b:      [ 30,   60],  // narrower gate on right
  gate_a:      [ 60,  120],
  south_stand: [120,  210],
  gate_d:      [210,  240],
}

function labelPos(startDeg: number, endDeg: number): { x: number; y: number } {
  const mid = (startDeg + endDeg) / 2
  const r = mid * (Math.PI / 180)
  // Place label at 70% between inner and outer radii (slightly inward)
  const mr = IRX + (ORX - IRX) * 0.6
  const me = IRY + (ORY - IRY) * 0.6
  return { x: CX + mr * Math.cos(r), y: CY + me * Math.sin(r) }
}

const SEVERITY_FILL: Record<Severity, string> = {
  informational: '#1a3a1a',
  moderate:      '#3d2a00',
  severe:        '#3d0a0a',
}
const SEVERITY_STROKE: Record<Severity, string> = {
  informational: '#22c55e',
  moderate:      '#f59e0b',
  severe:        '#ef4444',
}

export function StadiumMap({ selectedZone, zoneSeverity = {}, onZoneClick }: Props) {
  return (
    <svg
      viewBox="0 0 400 330"
      width="100%"
      style={{ display: 'block' }}
    >
      {/* Background */}
      <rect width="400" height="320" fill="#0a0a1a" />

      {/* Pitch */}
      <ellipse cx={CX} cy={CY} rx={IRX - 8} ry={IRY - 8} fill="#0d2b0d" stroke="#1a4d1a" strokeWidth="1" />
      {/* Centre circle */}
      <circle cx={CX} cy={CY} r="22" fill="none" stroke="#1a4d1a" strokeWidth="0.8" />
      {/* Centre spot */}
      <circle cx={CX} cy={CY} r="2" fill="#1a4d1a" />
      {/* Halfway line */}
      <line
        x1={CX - IRX + 10} y1={CY}
        x2={CX + IRX - 10} y2={CY}
        stroke="#1a4d1a" strokeWidth="0.8"
      />
      {/* Penalty areas */}
      <rect x={CX - 38} y={CY - IRY + 10} width="76" height="32" fill="none" stroke="#1a4d1a" strokeWidth="0.8" />
      <rect x={CX - 38} y={CY + IRY - 42} width="76" height="32" fill="none" stroke="#1a4d1a" strokeWidth="0.8" />

      {/* Zone segments */}
      {STADIUM_ZONES.map(({ id }) => {
        const [s, e] = ZONE_ARCS[id] ?? [0, 60]
        const sev = zoneSeverity[id]
        const isSelected = selectedZone === id
        const fill = sev ? SEVERITY_FILL[sev] : (isSelected ? '#0f1f3d' : '#16162a')
        const stroke = isSelected ? '#4a9eff' : (sev ? SEVERITY_STROKE[sev] : '#2a2a4a')
        const sw = isSelected || sev ? 2 : 1
        return (
          <g key={id}>
            <path
              d={arcPath(s, e)}
              fill={fill}
              stroke={stroke}
              strokeWidth={sw}
              style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
              onClick={() => onZoneClick(id)}
            >
              {(sev === 'severe' || isSelected) && (
                <animate attributeName="opacity" values="1;0.7;1" dur="1.8s" repeatCount="indefinite" />
              )}
            </path>
            {/* Severity glow for severe */}
            {sev === 'severe' && (
              <path
                d={arcPath(s, e)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="4"
                opacity="0.25"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        )
      })}

      {/* Zone labels */}
      {STADIUM_ZONES.map(({ id, label }) => {
        const [s, e] = ZONE_ARCS[id] ?? [0, 60]
        const { x, y } = labelPos(s, e)
        const isSelected = selectedZone === id
        const sev = zoneSeverity[id]
        const color = sev ? SEVERITY_STROKE[sev] : (isSelected ? '#4a9eff' : '#c0c0e0')
        return (
          <text
            key={id}
            x={x} y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontFamily="monospace"
            fontWeight={isSelected ? 'bold' : '600'}
            fill={color}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {label}
          </text>
        )
      })}

      {/* Selected badge */}
      {selectedZone && (() => {
        const arc = ZONE_ARCS[selectedZone]
        if (!arc) return null
        const [s, e] = arc
        const { x, y } = labelPos(s, e)
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={x - 18} y={y + 7} width="36" height="10" rx="2" fill="#4a9eff" opacity="0.9" />
            <text x={x} y={y + 12} textAnchor="middle" dominantBaseline="middle"
              fontSize="6" fontFamily="monospace" fontWeight="bold" fill="#fff">
              SELECTED
            </text>
          </g>
        )
      })()}

      {/* Outer stadium wall */}
      <ellipse cx={CX} cy={CY} rx={ORX + 4} ry={ORY + 4}
        fill="none" stroke="#2a2a4a" strokeWidth="2" />
    </svg>
  )
}

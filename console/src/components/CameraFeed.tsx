import { useRef, useEffect } from 'react'

interface Props {
  density: number
  zone: string
}

const densityColor = (d: number) =>
  d > 0.75 ? '#ef4444' : d >= 0.5 ? '#f59e0b' : '#22c55e'

// Draw a 3×3 heatmap grid on a canvas overlay
function drawHeatmap(canvas: HTMLCanvasElement, density: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cols = 3
  const rows = 3
  const cw = canvas.width / cols
  const ch = canvas.height / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Vary each cell slightly around the overall density
      const jitter = (Math.random() - 0.5) * 0.15
      const cellDensity = Math.max(0, Math.min(1, density + jitter))
      let color: string
      if (cellDensity > 0.75) color = `rgba(239,68,68,${0.35 + cellDensity * 0.2})`
      else if (cellDensity >= 0.5) color = `rgba(245,158,11,${0.25 + cellDensity * 0.2})`
      else color = `rgba(34,197,94,${0.12 + cellDensity * 0.15})`
      ctx.fillStyle = color
      ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2)
    }
  }
}

export function CameraFeed({ density, zone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawHeatmap(canvas, density)
    // Redraw periodically so jitter animates
    const id = setInterval(() => drawHeatmap(canvas, density), 2000)
    return () => clearInterval(id)
  }, [density])

  const color = densityColor(density)

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
      <video
        src="/crowd.mp4"
        autoPlay
        loop
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* Heatmap overlay */}
      <canvas
        ref={canvasRef}
        width={320}
        height={180}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      />
      {/* Top label */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(10,10,26,0.75)',
        padding: '3px 8px', borderRadius: 4,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#ef4444',
          display: 'inline-block',
          animation: 'pulse 1s infinite',
        }} />
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#e2e8f0' }}>
          CV Feed · {zone} · LIVE
        </span>
      </div>
      {/* Density badge bottom-left */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8,
        background: 'rgba(10,10,26,0.8)',
        border: `1px solid ${color}`,
        padding: '2px 8px', borderRadius: 4,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color, fontWeight: 'bold' }}>
          Density: {density.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

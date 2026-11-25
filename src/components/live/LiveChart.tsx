import { useId } from 'react'
import type { SignalHistoryPoint } from '../../lib/live'

const WIDTH = 340
const HEIGHT = 124
const PAD = { left: 26, right: 8, top: 12, bottom: 20 }

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function LiveChart({ points, label }: { points: SignalHistoryPoint[]; label: string }) {
  const gradientId = useId().replace(/:/g, '')
  if (!points.length) {
    return (
      <div className="flex h-[124px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-txt-faint">
        No chart samples recorded yet.
      </div>
    )
  }

  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const xFor = (index: number) => PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yFor = (score: number) => PAD.top + (1 - Math.min(100, Math.max(0, score)) / 100) * innerH
  const coords = points.map((point, index) => ({ x: xFor(index), y: yFor(point.score), point }))
  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${PAD.left + innerW},${PAD.top + innerH}`

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${label}: ${points.length} opportunity-score samples from ${clock(points[0].at)} to ${clock(points[points.length - 1].at)}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00D4FF" stopOpacity="0.24" />
            <stop offset="1" stopColor="#00D4FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((tick) => {
          const y = PAD.top + (1 - tick / 100) * innerH
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="7" fill="rgba(148,163,184,0.55)">
                {tick}
              </text>
            </g>
          )
        })}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="rgba(255,255,255,0.10)"
        />
        {points.length > 1 ? (
          <>
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline points={line} fill="none" stroke="#00D4FF" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {coords.map(({ x, y, point }, index) => (
          <circle
            key={`${point.at}-${index}`}
            cx={x}
            cy={y}
            r={index === coords.length - 1 ? 3 : 2}
            fill={index === coords.length - 1 ? '#00D4FF' : '#0b131c'}
            stroke="#00D4FF"
            strokeWidth="1.2"
          >
            <title>{`${clock(point.at)} · score ${point.score} · rank #${point.rank}`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} fontSize="7" fill="rgba(148,163,184,0.55)">
          {clock(points[0].at)}
        </text>
        <text x={PAD.left + innerW} y={HEIGHT - 6} fontSize="7" textAnchor="end" fill="rgba(148,163,184,0.55)">
          {clock(points[points.length - 1].at)}
        </text>
      </svg>
    </div>
  )
}

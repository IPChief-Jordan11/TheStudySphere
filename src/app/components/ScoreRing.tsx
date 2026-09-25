export function scoreColor(percent: number): string {
  if (percent >= 80) return '#5FB3A3'
  if (percent >= 50) return '#5B9DF5'
  return '#E86D5F'
}

export function scoreLabel(percent: number): string {
  if (percent >= 90) return "You're on fire! \ud83d\udd25"
  if (percent >= 80) return 'Great work! \u2728'
  if (percent >= 50) return 'Solid progress \ud83d\udcaa'
  return 'Keep practicing \ud83c\udf31'
}

export default function ScoreRing({
  percent,
  size = 56,
  strokeWidth,
  showPercentLabel = true,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  showPercentLabel?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const stroke = strokeWidth ?? Math.max(4, Math.round(size / 10))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const color = scoreColor(clamped)
  const fontSize = size >= 100 ? 'text-3xl' : size >= 64 ? 'text-sm' : 'text-[10px]'

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2D3540" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
        />
      </svg>
      {showPercentLabel && (
        <span className={`absolute font-serif ${fontSize} text-[#ECE6D6]`}>{clamped}%</span>
      )}
    </div>
  )
}

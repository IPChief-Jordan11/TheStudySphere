// The StudySphere mark: an open book with a sprout growing from its spine —
// study (book) + growth (sprout), in a circular badge. Colors read from the
// theme's CSS variables, so it matches light/dark and high-contrast mode.
export default function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="32" cy="32" r="31" fill="var(--color-primary)" />
      <g fill="var(--color-bg)" transform="translate(32 33) scale(0.94) translate(-32 -28)">
        <path d="M32 50 C24 45 15 44 8 46 V30 C15 28 24 29 32 34 Z" />
        <path d="M32 50 C40 45 49 44 56 46 V30 C49 28 40 29 32 34 Z" />
        <rect x="30.5" y="19" width="3" height="15" rx="1.5" />
        <path d="M32 24 C32 15 40 10 48 12 C47 21 39 26 32 24 Z" />
        <path d="M32 24 C32 15 24 10 16 12 C17 21 25 26 32 24 Z" />
        <path d="M32 19 C29 15 30 9 32 6 C34 9 35 15 32 19 Z" />
      </g>
    </svg>
  )
}

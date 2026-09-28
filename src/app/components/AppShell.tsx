'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoMark from './LogoMark'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/upload', label: 'Upload' },
  { href: '/progress', label: 'Progress' },
  { href: '/study-plan', label: 'Study Plan' },
  { href: '/account', label: 'Account' },
  { href: '/accessibility', label: 'Accessibility' },
]

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ThemeButton({
  isLight,
  onToggle,
  withLabel,
}: {
  isLight: boolean
  onToggle: () => void
  withLabel?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-sm text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
    >
      {isLight ? <SunIcon /> : <MoonIcon />}
      {withLabel && <span>{isLight ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isLight, setIsLight] = useState(false)

  // Re-apply any saved accessibility settings AND theme on every page load.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('studysphere-a11y')
      if (raw) {
        const settings = JSON.parse(raw)
        const root = document.documentElement
        root.setAttribute('data-a11y-spacing', String(Boolean(settings.spacing)))
        root.setAttribute('data-a11y-contrast', String(Boolean(settings.contrast)))
        root.setAttribute('data-a11y-large-text', String(Boolean(settings.largeText)))
      }
    } catch {
      // No saved settings, or storage unavailable — nothing to apply.
    }

    try {
      const light = localStorage.getItem('studysphere-theme') === 'light'
      setIsLight(light)
      document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
    } catch {
      // No saved theme — default dark stays as-is.
    }
  }, [])

  function toggleTheme() {
    const next = !isLight
    setIsLight(next)
    document.documentElement.setAttribute('data-theme', next ? 'light' : 'dark')
    try {
      localStorage.setItem('studysphere-theme', next ? 'light' : 'dark')
    } catch {
      // The theme still applies for this page view even if it can't be saved.
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)] md:flex-row">
      <aside className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 md:sticky md:top-0 md:flex md:h-screen md:w-56 md:flex-col md:border-b-0 md:border-r md:p-6">
        <div className="flex items-center justify-between md:mb-8">
          <div className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="font-serif text-xl">StudySphere</span>
          </div>
          <div className="md:hidden">
            <ThemeButton isLight={isLight} onToggle={toggleTheme} />
          </div>
        </div>

        <nav className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:mt-0 md:block md:space-y-1 md:overflow-visible md:p-0 [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  active
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto hidden md:block">
          <ThemeButton isLight={isLight} onToggle={toggleTheme} withLabel />
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}

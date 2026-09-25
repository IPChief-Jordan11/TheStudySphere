'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/upload', label: 'Upload' },
  { href: '/progress', label: 'Progress' },
  { href: '/study-plan', label: 'Study Plan' },
  { href: '/accessibility', label: 'Accessibility' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Re-apply any saved accessibility settings on every page, not just the
  // accessibility settings page itself.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('studysphere-a11y')
      if (!raw) return
      const settings = JSON.parse(raw)
      const root = document.documentElement
      root.setAttribute('data-a11y-spacing', String(Boolean(settings.spacing)))
      root.setAttribute('data-a11y-contrast', String(Boolean(settings.contrast)))
      root.setAttribute('data-a11y-large-text', String(Boolean(settings.largeText)))
    } catch {
      // No saved settings, or storage unavailable — nothing to apply.
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[#12161C] text-[#ECE6D6] md:flex-row">
      <aside className="w-full shrink-0 border-b border-[#2D3540] px-4 py-3 md:w-56 md:border-b-0 md:border-r md:p-6">
        <div className="flex items-center justify-between md:block">
          <div className="flex items-center gap-2 md:mb-10">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#12161C]"
              style={{ background: 'linear-gradient(135deg, #5B9DF5, #5FB3A3)' }}
              aria-hidden="true"
            >
              S
            </span>
            <span className="font-serif text-xl">StudySphere</span>
          </div>
          <nav className="flex gap-1 md:block md:space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition-transform transition-colors hover:scale-[1.03] ${
                    active
                      ? 'bg-[#1A2029] text-[#5B9DF5]'
                      : 'text-[#8B93A0] hover:bg-[#1A2029] hover:text-[#ECE6D6]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}

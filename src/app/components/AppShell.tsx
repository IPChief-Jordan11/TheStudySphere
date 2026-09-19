'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/upload', label: 'Upload' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-[#12161C] text-[#ECE6D6]">
      <aside className="w-56 shrink-0 border-r border-[#2D3540] p-6">
        <div className="mb-10 font-serif text-xl">StudySphere</div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-[#1A2029] text-[#E8A33D]'
                    : 'text-[#8B93A0] hover:bg-[#1A2029] hover:text-[#ECE6D6]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
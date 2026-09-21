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
    <div className="flex min-h-screen flex-col bg-[#12161C] text-[#ECE6D6] md:flex-row">
      <aside className="w-full shrink-0 border-b border-[#2D3540] px-4 py-3 md:w-56 md:border-b-0 md:border-r md:p-6">
        <div className="flex items-center justify-between md:block">
          <div className="font-serif text-xl md:mb-10">StudySphere</div>
          <nav className="flex gap-1 md:block md:space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
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

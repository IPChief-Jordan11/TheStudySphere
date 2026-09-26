'use client'

import { useEffect, useState } from 'react'
import AppShell from '../components/AppShell'

type Profile = {
  name: string | null
  email: string
  institution: string | null
  faculty: string | null
  modules: { id: string; name: string }[]
}

const THEME_KEY = 'studysphere-theme'

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{ backgroundColor: checked ? '#5B9DF5' : '#2D3540' }}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
    >
      <span
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
        className="absolute top-0.5 h-5 w-5 rounded-full bg-[#ECE6D6] transition-transform"
      />
    </button>
  )
}

export default function AccountClient({ profile }: { profile: Profile }) {
  const [isLight, setIsLight] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    const light = stored === 'light'
    setIsLight(light)
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
    setLoaded(true)
  }, [])

  function toggleTheme(light: boolean) {
    setIsLight(light)
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark')
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-2xl">Account</h1>

        <div className="mt-6 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#8B93A0]">Name</dt>
              <dd className="text-right text-[#ECE6D6]">{profile.name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#8B93A0]">Email</dt>
              <dd className="text-right text-[#ECE6D6] [overflow-wrap:anywhere]">{profile.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#8B93A0]">Institution</dt>
              <dd className="text-right text-[#ECE6D6]">{profile.institution || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#8B93A0]">Faculty</dt>
              <dd className="text-right text-[#ECE6D6]">{profile.faculty || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-5">
          <p className="text-sm font-medium text-[#ECE6D6]">Modules</p>
          {profile.modules.length === 0 ? (
            <p className="mt-2 text-sm text-[#8B93A0]">No modules yet.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {profile.modules.map((m) => (
                <li
                  key={m.id}
                  className="rounded-full border border-[#2D3540] px-3 py-1 text-xs text-[#ECE6D6]"
                >
                  {m.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {loaded && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-5">
            <div>
              <p className="text-sm font-medium text-[#ECE6D6]">Light mode</p>
              <p className="mt-0.5 text-xs text-[#8B93A0]">
                A quick color-inverted light mode. It isn&apos;t a hand-designed light theme yet, but
                it works app-wide.
              </p>
            </div>
            <ToggleSwitch checked={isLight} onChange={toggleTheme} />
          </div>
        )}
      </div>
    </AppShell>
  )
}

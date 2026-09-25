'use client'

import { useEffect, useState } from 'react'
import AppShell from '../components/AppShell'

type Settings = { spacing: boolean; contrast: boolean; largeText: boolean }
const STORAGE_KEY = 'studysphere-a11y'
const DEFAULTS: Settings = { spacing: false, contrast: false, largeText: false }

function applyToDocument(settings: Settings) {
  const root = document.documentElement
  root.setAttribute('data-a11y-spacing', String(settings.spacing))
  root.setAttribute('data-a11y-contrast', String(settings.contrast))
  root.setAttribute('data-a11y-large-text', String(settings.largeText))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2D3540] py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-[#ECE6D6]">{title}</p>
        <p className="mt-0.5 text-xs text-[#8B93A0]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        style={{ backgroundColor: checked ? '#5B9DF5' : '#2D3540' }}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      >
        <span
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-[#ECE6D6] transition-transform"
        />
      </button>
    </div>
  )
}

export default function AccessibilityPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = loadSettings()
    setSettings(stored)
    applyToDocument(stored)
    setLoaded(true)
  }, [])

  function update(key: keyof Settings, value: boolean) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    applyToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // If storage is unavailable, the setting still applies for this page view.
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-2xl">Accessibility</h1>
        <p className="mt-1 text-sm text-[#8B93A0]">
          These controls apply across the whole app immediately, and are remembered on this
          device.
        </p>

        {loaded && (
          <div className="mt-6 rounded-2xl border border-[#2D3540] bg-[#1A2029] px-5">
            <ToggleRow
              title="Dyslexia-friendly spacing"
              description="Wider letter and word spacing, increased line height."
              checked={settings.spacing}
              onChange={(v) => update('spacing', v)}
            />
            <ToggleRow
              title="High contrast"
              description="Boosts contrast across the app. Since colors here aren't yet built on a single theme system, this is a contrast boost rather than a literal black-on-white swap."
              checked={settings.contrast}
              onChange={(v) => update('contrast', v)}
            />
            <ToggleRow
              title="Larger text"
              description="Increases text size across the app by 20%."
              checked={settings.largeText}
              onChange={(v) => update('largeText', v)}
            />
          </div>
        )}

        <p className="mt-4 text-xs text-[#8B93A0]">
          Settings are stored only on this device/browser, not on your account, so they won&apos;t
          follow you to another device yet.
        </p>
      </div>
    </AppShell>
  )
}

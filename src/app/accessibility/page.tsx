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
    const parsed = JSON.parse(raw)
    return {
      spacing: Boolean(parsed.spacing),
      contrast: Boolean(parsed.contrast),
      largeText: Boolean(parsed.largeText),
    }
  } catch {
    return DEFAULTS
  }
}

// Off: knob on the left, dim track. On: knob on the right, track lit up.
// The knob is positioned with explicit left offsets and every color is set
// inline, so the state can never drift out of sync with what's drawn.
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full border"
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
        borderColor: checked ? 'var(--color-primary)' : 'var(--color-muted)',
        boxShadow: checked ? '0 0 14px rgba(var(--glow), 0.55)' : 'none',
        transition: 'background-color 300ms, border-color 300ms, box-shadow 300ms, filter 150ms',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute h-5 w-5 rounded-full"
        style={{
          top: 3,
          left: checked ? 23 : 3,
          backgroundColor: checked ? '#f6fbf7' : 'var(--color-muted)',
          transition: 'left 320ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 200ms',
        }}
      />
    </button>
  )
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
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="w-7 text-right text-xs font-medium"
          style={{ color: checked ? 'var(--color-primary)' : 'var(--color-muted)' }}
        >
          {checked ? 'On' : 'Off'}
        </span>
        <Switch checked={checked} onChange={onChange} label={title} />
      </div>
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
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          These controls apply across the whole app immediately, and are remembered on this
          device.
        </p>

        {loaded && (
          <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-5">
            <ToggleRow
              title="Dyslexia-friendly spacing"
              description="Wider letter and word spacing, increased line height."
              checked={settings.spacing}
              onChange={(v) => update('spacing', v)}
            />
            <ToggleRow
              title="High contrast"
              description="Maximum text contrast and stronger borders, in whichever theme you're using."
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

        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Settings are stored only on this device/browser, not on your account, so they won&apos;t
          follow you to another device yet.
        </p>
      </div>
    </AppShell>
  )
}

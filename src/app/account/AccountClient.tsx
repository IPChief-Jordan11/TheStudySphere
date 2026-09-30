'use client'

import AppShell from '../components/AppShell'
import { addModule, removeModule } from './actions'
import UpgradePanel from './UpgradePanel'

type Profile = {
  name: string | null
  email: string
  institution: string | null
  faculty: string | null
  modules: { id: string; name: string }[]
  premiumUntil: string | null
}

export default function AccountClient({ profile, error }: { profile: Profile; error?: string }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-2xl">Account</h1>

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Name</dt>
              <dd className="text-right text-[var(--color-text)]">{profile.name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Email</dt>
              <dd className="text-right text-[var(--color-text)] [overflow-wrap:anywhere]">{profile.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Institution</dt>
              <dd className="text-right text-[var(--color-text)]">{profile.institution || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Faculty</dt>
              <dd className="text-right text-[var(--color-text)]">{profile.faculty || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <p className="text-sm font-medium text-[var(--color-text)]">Modules</p>

          {profile.modules.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">No modules yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {profile.modules.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                >
                  <span className="text-sm text-[var(--color-text)] [overflow-wrap:anywhere]">{m.name}</span>
                  <form action={removeModule}>
                    <input type="hidden" name="moduleId" value={m.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${m.name}`}
                      className="shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={addModule} className="mt-3 flex flex-wrap gap-2">
            <input
              name="name"
              placeholder="New module name"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              required
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90"
            >
              + Add module
            </button>
          </form>
        </div>

        <UpgradePanel premiumUntil={profile.premiumUntil} />

        <p className="mt-4 text-xs text-[var(--color-muted)]">
          You can switch between light and dark mode from the icon in the sidebar.
        </p>
      </div>
    </AppShell>
  )
}

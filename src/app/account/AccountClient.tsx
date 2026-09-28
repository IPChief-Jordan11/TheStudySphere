'use client'

import AppShell from '../components/AppShell'

type Profile = {
  name: string | null
  email: string
  institution: string | null
  faculty: string | null
  modules: { id: string; name: string }[]
}

export default function AccountClient({ profile }: { profile: Profile }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-2xl">Account</h1>

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
            <ul className="mt-2 flex flex-wrap gap-2">
              {profile.modules.map((m) => (
                <li
                  key={m.id}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
                >
                  {m.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-[var(--color-muted)]">
          You can switch between light and dark mode from the icon in the top bar.
        </p>
      </div>
    </AppShell>
  )
}

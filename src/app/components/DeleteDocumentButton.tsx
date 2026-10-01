'use client'

import { deleteDocument } from '../documents/[id]/delete-actions'

export default function DeleteDocumentButton({
  documentId,
  fileName,
  className,
}: {
  documentId: string
  fileName: string
  className?: string
}) {
  return (
    <form
      action={deleteDocument}
      onSubmit={(e) => {
        if (!confirm(`Delete "${fileName}"? This removes its summary, flashcards, quiz history, and chat history too. This can't be undone.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        aria-label={`Delete ${fileName}`}
        className={
          className ??
          'rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]'
        }
      >
        Delete
      </button>
    </form>
  )
}

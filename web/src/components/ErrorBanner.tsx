import type { ApiError } from '../api/client'

export function ErrorBanner({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="error-banner">
      <span data-testid="error-icon" aria-hidden="true">⚠</span>
      <span>{error.messageTh}</span>
      {onRetry && <button type="button" onClick={onRetry}>ลองอีกครั้ง</button>}
    </div>
  )
}

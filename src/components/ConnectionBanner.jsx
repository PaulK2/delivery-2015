import { useSyncExternalStore } from 'react'
import { subscribeConnection, getConnectionState } from '../services/api/connection.js'

// Small, non-blocking banner that reflects backend connectivity (spec §79).
//
// It NEVER replaces the app. A single failed request shows nothing; once requests
// keep failing the API client escalates the shared connection status, and this banner
// appears — soft first ("временен проблем… опитваме отново"), stronger only after
// several consecutive failures. As soon as any request succeeds the status returns to
// 'online' and the banner disappears on its own.
export default function ConnectionBanner() {
  const { status } = useSyncExternalStore(subscribeConnection, getConnectionState, getConnectionState)

  if (status === 'online') return null

  const lost = status === 'lost'
  return (
    <div
      className={'connection-banner ' + (lost ? 'connection-banner--lost' : 'connection-banner--unstable')}
      role="status"
      aria-live="polite"
    >
      <span className="connection-banner__dot" aria-hidden="true" />
      {lost
        ? 'Няма връзка със сървъра. Продължаваме да опитваме…'
        : 'Временен проблем с връзката. Опитваме отново…'}
    </div>
  )
}

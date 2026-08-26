import { useEffect, useState } from 'react'

// Visible Bulgarian warning when the device loses connectivity (spec §79).
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null
  return (
    <div className="offline-banner" role="alert">
      Няма връзка с интернет. Част от информацията може да не е актуална.
    </div>
  )
}

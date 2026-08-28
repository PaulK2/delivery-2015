import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './styles/global.css'
import App from './App.jsx'
import { APP_VERSION } from './config/index.js'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { applyFontScale } from './utils/uiPrefs.js'

// Printed at startup so the running frontend build is verifiable from the console.
console.log('FleetView frontend build:', APP_VERSION)

// Apply the saved "large text" preference before first paint (no flash).
applyFontScale()

// Register the PWA service worker in production only (spec §87).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// HashRouter avoids the GitHub Pages SPA 404 problem (no server rewrite needed).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
)

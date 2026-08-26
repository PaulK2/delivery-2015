import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './styles/global.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

// HashRouter avoids the GitHub Pages SPA 404 problem (no server rewrite needed).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)

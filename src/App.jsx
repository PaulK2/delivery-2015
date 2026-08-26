import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Spinner from './components/Spinner.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'
import SchedulePage from './pages/SchedulePage.jsx'
import VehiclesPage from './pages/VehiclesPage.jsx'
import VehicleDetailPage from './pages/VehicleDetailPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoading />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function FullScreenLoading() {
  return (
    <div className="center-screen">
      <Spinner label="Зареждане…" />
    </div>
  )
}

export default function App() {
  const { loading } = useAuth()
  if (loading) return <FullScreenLoading />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route
          path="/availability"
          element={<PlaceholderPage title="Следваща седмица" phase="Фаза 3" />}
        />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/vehicles/:carId" element={<VehicleDetailPage />} />
        <Route
          path="/maintenance"
          element={<PlaceholderPage title="Сигнали и поддръжка" phase="Фаза 4" />}
        />
        <Route
          path="/admin"
          element={<PlaceholderPage title="Администрация" phase="Фаза 6" adminOnly />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Spinner from './components/Spinner.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'

// Keep Home + core shell in the initial bundle; split the heavier, less-frequently
// opened pages so they load on demand instead of bloating first paint.
const SchedulePage = lazy(() => import('./pages/SchedulePage.jsx'))
const VehiclesPage = lazy(() => import('./pages/VehiclesPage.jsx'))
const VehicleDetailPage = lazy(() => import('./pages/VehicleDetailPage.jsx'))
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage.jsx'))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'))
const ReportPage = lazy(() => import('./pages/ReportPage.jsx'))

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

// Subtle in-content fallback while a lazily-loaded page chunk arrives (the app shell,
// header and navigation stay mounted — no full-screen takeover).
function PageLoading() {
  return (
    <div className="page-loading">
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
        <Route
          path="/schedule"
          element={
            <Suspense fallback={<PageLoading />}>
              <SchedulePage />
            </Suspense>
          }
        />
        <Route
          path="/availability"
          element={
            <Suspense fallback={<PageLoading />}>
              <AvailabilityPage />
            </Suspense>
          }
        />
        <Route
          path="/orders"
          element={
            <Suspense fallback={<PageLoading />}>
              <OrdersPage />
            </Suspense>
          }
        />
        <Route
          path="/report"
          element={
            <Suspense fallback={<PageLoading />}>
              <ReportPage />
            </Suspense>
          }
        />
        <Route
          path="/vehicles"
          element={
            <Suspense fallback={<PageLoading />}>
              <VehiclesPage />
            </Suspense>
          }
        />
        <Route
          path="/vehicles/:carId"
          element={
            <Suspense fallback={<PageLoading />}>
              <VehicleDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/maintenance"
          element={
            <Suspense fallback={<PageLoading />}>
              <MaintenancePage />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<PageLoading />}>
              <AdminPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

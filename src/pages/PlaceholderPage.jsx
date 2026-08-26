import { useAuth } from '../context/AuthContext.jsx'

// Bulgarian placeholder for sections built in later phases.
export default function PlaceholderPage({ title, phase, adminOnly }) {
  const { isAdmin } = useAuth()
  if (adminOnly && !isAdmin) {
    return (
      <div className="page">
        <h1 className="page__title">{title}</h1>
        <div className="empty-state">Нямате достъп до този раздел.</div>
      </div>
    )
  }
  return (
    <div className="page">
      <h1 className="page__title">{title}</h1>
      <div className="empty-state">
        <p>Този раздел предстои да бъде добавен.</p>
        {phase ? <p className="empty-state__hint">Планиран за: {phase}</p> : null}
      </div>
    </div>
  )
}

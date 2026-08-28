import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { NAV_ITEMS } from '../components/nav.js'
import Icon from '../components/Icon.jsx'
import { isLargeText, setLargeText } from '../utils/uiPrefs.js'

// Secondary destinations + settings, shown as big, clearly-labelled buttons so nothing
// is a guess. This is the "Още" target from the bottom bar (mobile especially).
export default function MorePage() {
  const { user, isAdmin, logout, canToggleView, viewAsWorker, setViewAsWorker } = useAuth()
  const [big, setBig] = useState(() => isLargeText())

  const moreItems = NAV_ITEMS.filter(
    (i) => i.group === 'more' && (!i.adminOnly || isAdmin)
  )

  function toggleBig() {
    const next = !big
    setBig(next)
    setLargeText(next)
  }

  return (
    <div className="page more-page">
      <div className="page__header">
        <h1 className="page__title">Още</h1>
      </div>

      <nav className="more-list" aria-label="Още страници">
        {moreItems.map((item) => (
          <Link key={item.to} to={item.to} className="more-list__item">
            <span className="more-list__icon" aria-hidden="true">
              <Icon name={item.icon} size={24} />
            </span>
            <span className="more-list__label">{item.label}</span>
            <span className="more-list__chev" aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>

      <section className="detail-section">
        <h2 className="detail-section__title">Настройки</h2>

        {canToggleView ? (
          <>
            <button
              type="button"
              className={'toggle-row' + (viewAsWorker ? ' toggle-row--on' : '')}
              onClick={() => setViewAsWorker(!viewAsWorker)}
              aria-pressed={viewAsWorker}
            >
              <span className="toggle-row__label">Изглед на работник</span>
              <span className="toggle-row__state">{viewAsWorker ? 'Включен' : 'Изключен'}</span>
            </button>
            <p className="more-page__hint">
              Показва по-опростения изглед на обикновен работник (без администраторски
              функции). Може да превключвате обратно по всяко време оттук.
            </p>
          </>
        ) : null}

        <button
          type="button"
          className={'toggle-row' + (big ? ' toggle-row--on' : '')}
          onClick={toggleBig}
          aria-pressed={big}
        >
          <span className="toggle-row__label">Голям текст</span>
          <span className="toggle-row__state">{big ? 'Включен' : 'Изключен'}</span>
        </button>
        <p className="more-page__hint">Уголемява текста и бутоните в цялото приложение.</p>
      </section>

      <section className="detail-section">
        <h2 className="detail-section__title">Как да използвам приложението</h2>
        <ol className="help-steps">
          <li><strong>Начало</strong> — вижте къде работите днес и с коя кола.</li>
          <li><strong>График</strong> — вижте своите смени за седмицата.</li>
          <li><strong>Моят ден</strong> — въведете доставките си след смяната.</li>
          <li><strong>Автомобили</strong> — вземете или освободете кола.</li>
          <li><strong>Моята наличност</strong> — кажете кога можете да работите следващата седмица.</li>
        </ol>
      </section>

      {user ? (
        <button className="btn btn--ghost btn--block" onClick={logout}>
          Изход
        </button>
      ) : null}
    </div>
  )
}

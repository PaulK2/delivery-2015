import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCars } from '../services/fleet/fleet.js'
import { carTitle } from '../utils/vehicles.js'
import StatusBadge from './StatusBadge.jsx'

// App-wide quick search (spec §82 — "find my car fast", Phase 6 search).
// A command-palette overlay: open with the header button or the "/" key, type a
// plate/make/model, and jump straight to the vehicle. Fleet is the only entity
// with a detail route, so it is what we search.
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cars, setCars] = useState(null) // null=not loaded yet
  const [error, setError] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  // Global "/" shortcut to open (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Load the fleet once, lazily, the first time the palette opens.
  useEffect(() => {
    if (!open || cars !== null) return
    let alive = true
    getCars()
      .then((list) => alive && setCars(list))
      .catch((e) => alive && setError(e.message || 'Грешка при зареждане.'))
    return () => {
      alive = false
    }
  }, [open, cars])

  // Focus the input and reset state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQ('')
    }
  }, [open])

  const results = useMemo(() => {
    const n = q.replace(/\s+/g, '').toLowerCase()
    if (!n || !cars) return []
    return cars
      .filter(
        (c) =>
          c.registration.replace(/\s+/g, '').toLowerCase().includes(n) ||
          carTitle(c).toLowerCase().includes(n)
      )
      .slice(0, 12)
  }, [q, cars])

  useEffect(() => {
    setSel(0)
  }, [q])

  function go(car) {
    if (!car) return
    setOpen(false)
    navigate('/vehicles/' + car.car_id)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[sel])
    }
  }

  return (
    <>
      <button
        className="global-search__trigger"
        onClick={() => setOpen(true)}
        aria-label="Търсене на автомобил"
        title="Търсене ( / )"
      >
        <span aria-hidden="true">🔍</span>
      </button>

      {open ? (
        <div className="search-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="search-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Търсене на автомобил"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-palette__inputwrap">
              <span className="search-palette__icon" aria-hidden="true">
                🔍
              </span>
              <input
                ref={inputRef}
                className="search-palette__input"
                type="search"
                placeholder="Рег. номер, марка или модел…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Търсене"
              />
              <kbd className="search-palette__esc">Esc</kbd>
            </div>

            <div className="search-palette__results" role="listbox">
              {error ? (
                <div className="search-palette__empty">{error}</div>
              ) : cars === null ? (
                <div className="search-palette__empty">Зареждане…</div>
              ) : !q.trim() ? (
                <div className="search-palette__empty">Започнете да пишете, за да търсите автомобил.</div>
              ) : results.length === 0 ? (
                <div className="search-palette__empty">Няма съвпадения.</div>
              ) : (
                results.map((c, i) => (
                  <button
                    key={c.car_id}
                    role="option"
                    aria-selected={i === sel}
                    className={'search-result' + (i === sel ? ' search-result--active' : '')}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(c)}
                  >
                    <span className="search-result__main">
                      <span className="search-result__plate">{c.registration}</span>
                      <span className="search-result__sub">{carTitle(c)}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

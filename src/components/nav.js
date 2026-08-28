// Primary navigation. Bulgarian labels, machine paths. Icons are keys into the shared
// line-icon family (see components/Icon.jsx).
//
// `group` splits the destinations so mobile shows a short, uncluttered bottom bar:
//   - 'primary' → always in the bottom bar + side nav (the everyday screens)
//   - 'more'    → reached via the "Още" button (bottom bar) or listed directly on the
//                 wider desktop side nav
// Full words only — no abbreviations, so nothing is a guess for the reader.
export const NAV_ITEMS = [
  { to: '/', label: 'Начало', icon: 'home', end: true, group: 'primary' },
  { to: '/schedule', label: 'График', icon: 'calendar', group: 'primary' },
  { to: '/day', label: 'Моят ден', icon: 'report', group: 'primary' },
  { to: '/vehicles', label: 'Автомобили', icon: 'car', group: 'primary' },
  { to: '/availability', label: 'Моята наличност', icon: 'calendar-check', group: 'more' },
  { to: '/maintenance', label: 'Сигнали и поддръжка', icon: 'wrench', group: 'more' },
  { to: '/admin', label: 'Администрация', icon: 'settings', adminOnly: true, group: 'more' },
]

// The bottom-bar entry that opens the "More" screen (secondary destinations).
export const MORE_ITEM = { to: '/more', label: 'Още', icon: 'more' }

// Primary navigation (spec §4). Bulgarian labels, machine paths. Icons are keys into
// the shared line-icon family (see components/Icon.jsx).
export const NAV_ITEMS = [
  { to: '/', label: 'Начало', icon: 'home', end: true },
  { to: '/schedule', label: 'График', icon: 'calendar' },
  { to: '/availability', label: 'Следваща седмица', icon: 'calendar-check', short: 'Следв.' },
  { to: '/vehicles', label: 'Автомобили', icon: 'car' },
  { to: '/maintenance', label: 'Сигнали и поддръжка', icon: 'wrench', short: 'Сигнали' },
  { to: '/admin', label: 'Администрация', icon: 'settings', short: 'Админ', adminOnly: true },
]

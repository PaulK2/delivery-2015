// Primary navigation (spec §4). Bulgarian labels, machine paths.
export const NAV_ITEMS = [
  { to: '/', label: 'Начало', icon: '🏠', end: true },
  { to: '/schedule', label: 'График', icon: '📅' },
  { to: '/availability', label: 'Следваща седмица', icon: '🗓️', short: 'Следв.' },
  { to: '/vehicles', label: 'Автомобили', icon: '🚗' },
  { to: '/maintenance', label: 'Сигнали и поддръжка', icon: '🔧', short: 'Сигнали' },
  { to: '/admin', label: 'Администрация', icon: '⚙️', short: 'Админ', adminOnly: true },
]

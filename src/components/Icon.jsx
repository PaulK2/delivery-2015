// Navigation icon set — one consistent family: 24×24 grid, 1.5px stroke, round
// caps/joins, no fill. Colour is inherited via `currentColor`, so icons pick up the
// nav link's normal / hover / active colour automatically.

const ICONS = {
  // Начало — house
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  // График — calendar
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </>
  ),
  // Следваща седмица — calendar with a check
  'calendar-check': (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
      <path d="M9 15l2 2 4-4" />
    </>
  ),
  // Автомобили — car
  car: (
    <>
      <path d="M4 13.5l1.7-4.6A2 2 0 0 1 7.6 7.5h8.8a2 2 0 0 1 1.9 1.4L20 13.5" />
      <path d="M3.2 13.5h17.6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
      <circle cx="7.2" cy="16" r="1.3" />
      <circle cx="16.8" cy="16" r="1.3" />
    </>
  ),
  // Сигнали и поддръжка — wrench
  wrench: (
    <path d="M15.2 6.2a4.2 4.2 0 0 0-5.5 5.2l-5.6 5.6a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a4.2 4.2 0 0 0 5.2-5.5l-2.6 2.6-2.3-.6-.6-2.3 2.5-2.5Z" />
  ),
  // Brand — delivery van / box truck
  truck: (
    <>
      <path d="M13.5 17.5V6.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1.2" />
      <path d="M14.3 17.5H9.7" />
      <path d="M18.3 17.5h1.7a1 1 0 0 0 1-1v-3.1a1 1 0 0 0-.22-.62l-3.1-3.9a1 1 0 0 0-.78-.38H13.5" />
      <circle cx="7.4" cy="17.6" r="1.7" />
      <circle cx="16.6" cy="17.6" r="1.7" />
    </>
  ),
  // Reveal password — eye / eye with a slash
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10 5.7A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.5" />
      <path d="M6.4 7.3A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.8-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  // Day navigation — chevrons
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  // Администрация — sliders (settings)
  settings: (
    <>
      <path d="M5 7h9" />
      <path d="M18 7h1.5" />
      <circle cx="16" cy="7" r="2" />
      <path d="M5 17h1.5" />
      <path d="M10.5 17h9" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
}

export default function Icon({ name, size = 20, className }) {
  const glyph = ICONS[name]
  if (!glyph) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}

// The only bridge between the frontend and the Apps Script backend (spec §2, §83).
// All calls go through api(action, params). The Apps Script Web App exposes a single
// doPost entry point that dispatches on `action`.
//
// We send Content-Type: text/plain so the browser treats it as a "simple request"
// and skips the CORS preflight — Apps Script Web Apps do not answer OPTIONS.

import { API_URL } from '../../config/index.js'

const TOKEN_KEY = 'fv_session_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

// Friendly, user-facing error (Bulgarian) — never leak raw backend errors (spec §16, §78).
export class ApiError extends Error {
  constructor(messageBG, code) {
    super(messageBG)
    this.name = 'ApiError'
    this.code = code || 'unknown'
  }
}

export async function api(action, params = {}, { signal } = {}) {
  if (!API_URL) {
    throw new ApiError('Сървърът не е конфигуриран. Свържете се с администратор.', 'no_api_url')
  }

  const body = JSON.stringify({ action, token: getToken(), params })

  let res
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      signal,
      redirect: 'follow',
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Няма връзка със сървъра.', 'network')
  }

  let payload
  try {
    payload = await res.json()
  } catch {
    throw new ApiError('Възникна проблем при връзката със сървъра. Опитайте отново.', 'bad_response')
  }

  if (!payload || payload.ok !== true) {
    const code = payload?.error || 'server_error'
    throw new ApiError(mapErrorBG(code), code)
  }

  return payload.data
}

// Map machine error codes coming from the backend to Bulgarian messages (spec §78).
function mapErrorBG(code) {
  const M = {
    unauthorized: 'Сесията е изтекла. Влезте отново.',
    forbidden: 'Нямате права за това действие.',
    invalid_pin: 'Грешен PIN. Опитайте отново.',
    employee_inactive: 'Профилът ви е деактивиран.',
    car_taken: 'Автомобилът вече е взет от друг служител.',
    car_not_available: 'Автомобилът не е свободен в момента.',
    not_found: 'Записът не е намерен.',
    schedule_load_failed: 'Графикът не може да бъде зареден. Проверете Google Sheet връзката.',
    availability_closed: 'Приемът на наличност е затворен.',
    validation: 'Проверете въведените данни.',
    server_error: 'Възникна проблем със сървъра. Опитайте отново.',
  }
  return M[code] || 'Възникна проблем. Опитайте отново.'
}

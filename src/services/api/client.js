// The only bridge between the frontend and the Apps Script backend (spec §2, §83).
// All calls go through api(action, params). The Apps Script Web App exposes a single
// doPost entry point that dispatches on `action`.
//
// We send Content-Type: text/plain so the browser treats it as a "simple request"
// and skips the CORS preflight — Apps Script Web Apps do not answer OPTIONS.
//
// Reliability (spec §79): Apps Script/network hiccups are common and brief. Idempotent
// reads are retried automatically with a short backoff, every request has a timeout so
// it can't hang forever, and transient failures update a shared connection signal so the
// UI can show a small "retrying" banner instead of looking fully disconnected.

import { API_URL, CONFIG } from '../../config/index.js'
import { reportSuccess, reportFailure } from './connection.js'

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
// `transient` marks connectivity problems (worth retrying / a soft banner) as opposed to
// definitive business errors (unauthorized, validation, …) that must surface immediately.
export class ApiError extends Error {
  constructor(messageBG, code, { transient = false } = {}) {
    super(messageBG)
    this.name = 'ApiError'
    this.code = code || 'unknown'
    this.transient = transient
  }
}

// Codes that represent a temporary transport/backend hiccup rather than a decision the
// backend made about the request.
const TRANSIENT_CODES = new Set(['network', 'timeout', 'bad_response', 'server_error'])

// Only read-only actions are safe to retry automatically — retrying a mutation could
// double-apply it (take a car twice, save two copies, …). Everything else runs once.
function isIdempotent(action) {
  return /^get/i.test(action) || action === 'validateSession'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function api(action, params = {}, { signal } = {}) {
  if (!API_URL) {
    // Configuration problem, not connectivity — don't touch the connection signal.
    throw new ApiError('Сървърът не е конфигуриран. Свържете се с администратор.', 'no_api_url')
  }

  const backoff = CONFIG.net.retryBackoffMs || []
  const maxRetries = isIdempotent(action) ? backoff.length : 0

  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await attemptRequest(action, params, signal)
      reportSuccess()
      return data
    } catch (e) {
      // The caller aborted (component unmounted, navigation) — not a failure.
      if (e?.name === 'AbortError') throw e
      lastError = e

      if (e instanceof ApiError && e.transient && attempt < maxRetries) {
        const delay = backoff[attempt] ?? backoff[backoff.length - 1] ?? 1000
        // eslint-disable-next-line no-console
        console.warn(
          `[api] "${action}" transient failure (${e.code}); retrying in ${delay}ms ` +
            `(attempt ${attempt + 1}/${maxRetries})`
        )
        await sleep(delay)
        continue
      }
      break
    }
  }

  // Out of retries (or not retryable). Update the connection signal only for transient
  // failures so business errors don't make the app look disconnected.
  if (lastError instanceof ApiError && lastError.transient) {
    // eslint-disable-next-line no-console
    console.warn(`[api] "${action}" failed after retries:`, lastError.code, lastError.message)
    reportFailure()
  } else {
    // A definitive answer from the backend means connectivity itself is fine.
    reportSuccess()
  }
  throw lastError
}

// A single request attempt: applies the timeout, parses the response, and normalizes
// errors into ApiError with a `transient` flag.
async function attemptRequest(action, params, externalSignal) {
  const body = JSON.stringify({ action, token: getToken(), params })

  const controller = new AbortController()
  let timedOut = false
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, CONFIG.net.requestTimeoutMs)

  let res
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (e) {
    if (timedOut) {
      throw new ApiError('Сървърът не отговори навреме. Опитваме отново…', 'timeout', {
        transient: true,
      })
    }
    // Genuine external abort — propagate so the caller can ignore it.
    if (e?.name === 'AbortError') throw e
    throw new ApiError('Няма връзка със сървъра.', 'network', { transient: true })
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }

  let payload
  try {
    payload = await res.json()
  } catch {
    throw new ApiError('Възникна проблем при връзката със сървъра. Опитайте отново.', 'bad_response', {
      transient: true,
    })
  }

  if (!payload || payload.ok !== true) {
    const code = payload?.error || 'server_error'
    throw new ApiError(mapErrorBG(code), code, { transient: TRANSIENT_CODES.has(code) })
  }

  return payload.data
}

// Downloads a file-returning action (Пътен лист Excel export) — these respond with
// either the raw file (success) or the usual JSON error envelope (failure), told apart
// by Content-Type. Returns { blob, filename } on success; throws ApiError like api().
export async function apiDownloadFile(action, params = {}) {
  if (!API_URL) {
    throw new ApiError('Сървърът не е конфигуриран. Свържете се с администратор.', 'no_api_url')
  }

  let res
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), params }),
    })
  } catch {
    throw new ApiError('Няма връзка със сървъра.', 'network', { transient: true })
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('json')) {
    const payload = await res.json().catch(() => null)
    const code = payload?.error || 'server_error'
    throw new ApiError(mapErrorBG(code), code, { transient: TRANSIENT_CODES.has(code) })
  }
  if (!res.ok) {
    throw new ApiError('Възникна проблем. Опитайте отново.', 'server_error', { transient: true })
  }

  const disposition = res.headers.get('content-disposition') || ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match ? match[1] : 'export.xlsx'
  const blob = await res.blob()
  return { blob, filename }
}

// Map machine error codes coming from the backend to Bulgarian messages (spec §78).
function mapErrorBG(code) {
  const M = {
    unauthorized: 'Сесията е изтекла. Влезте отново.',
    forbidden: 'Нямате права за това действие.',
    invalid_credentials: 'Грешна парола. Опитайте отново.',
    weak_password: 'Паролата трябва да е поне 6 символа.',
    admin_no_availability: 'Администраторите не подават заявки за смени.',
    invalid_pin: 'Грешен PIN. Опитайте отново.',
    employee_inactive: 'Профилът ви е деактивиран.',
    car_taken: 'Автомобилът вече е взет от друг служител.',
    car_not_available: 'Автомобилът не е свободен в момента.',
    car_limit: 'Не може да управлявате повече от 2 автомобила едновременно. Освободете автомобил, преди да вземете нов.',
    car_in_use: 'Автомобилът се управлява в момента. Освободете го, преди да го изтриете.',
    car_not_found: 'Автомобилът не е намерен.',
    car_not_in_use: 'Автомобилът не се управлява в момента.',
    fuel_cash_required: 'Въведете наличните пари за гориво в документите.',
    future_date: 'Не може да въвеждате данни за бъдещи дни.',
    not_paid_yet: 'Заплатата все още не е отбелязана като изплатена.',
    odometer_required: 'Въведете текущия километраж.',
    odometer_too_low: 'Километражът не може да е по-малък от предишния.',
    cannot_delete_self: 'Не можете да изтриете собствения си профил.',
    not_found: 'Записът не е намерен.',
    schedule_load_failed: 'Графикът не може да бъде зареден. Проверете Google Sheet връзката.',
    schedule_access_denied:
      'Този Google Sheet не е публично достъпен. Отворете го → бутон „Споделяне“ → „Общ достъп“ → изберете „Всеки с връзката“ с права „Преглед“, след което опитайте отново.',
    schedule_wrong_tab:
      'Връзката се отвори, но не сочи към листа с графика. Отворете Google Sheet-а, изберете точно листа с графика (реда с „ДАТА“ в клетка A1), и копирайте адреса от адресната лента точно оттам — не общ линк за споделяне.',
    archive_limit: 'Достигнат е максимумът от 4 архивирани връзки. Изтрийте някоя, преди да добавите нова.',
    roadbook_export_failed: 'Генерирането на Excel файла не бе успешно. Опитайте отново.',
    availability_closed: 'Приемът на наличност е затворен.',
    validation: 'Проверете въведените данни.',
    server_error: 'Възникна проблем със сървъра. Опитайте отново.',
  }
  return M[code] || 'Възникна проблем. Опитайте отново.'
}

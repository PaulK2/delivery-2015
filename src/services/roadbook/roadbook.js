// Пътен лист (Road Book) service — admin-only reporting layer over the permanent
// vehicle usage history (see worker/lib/roadbook.js for how the backend computes it).
import { api, apiDownloadFile } from '../api/client.js'

// Live view for a week (Monday) or an explicit range — always current data, so a
// later correction to usage history shows up immediately (spec §17).
export async function getRoadBook({ weekStart, dateFrom, dateTo, carId, limit, offset } = {}) {
  return api('getRoadBook', { weekStart, dateFrom, dateTo, carId, limit, offset })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on a delay — some browsers need the object URL to stay valid a moment
  // after the click for the download to actually start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// "Изтегли Excel" / "Генерирай отново" — always a fresh generation (an explicit click
// is itself the "unless requested" exception), which also (re)writes that week's
// frozen snapshot in the archive.
export async function exportRoadBookExcel(weekStart) {
  const { blob, filename } = await apiDownloadFile('exportRoadBookExcel', { weekStart })
  triggerDownload(blob, filename)
}

export async function getRoadBookExportArchive() {
  const { exports: list } = await api('getRoadBookExportArchive', {})
  return list
}

// Downloads the STORED snapshot for an already-generated week — never regenerates.
export async function downloadRoadBookExport(weekStart) {
  const { blob, filename } = await apiDownloadFile('downloadRoadBookExport', { weekStart })
  triggerDownload(blob, filename)
}

// Private dev changelog (ПАВЕЛ / В. ПЕТКОВ only) — the backend rejects anyone else
// with 'forbidden', this module has no client-side gating of its own.
import { api } from '../api/client.js'
import { APP_VERSION } from '../../config/index.js'

export async function getDevNotes() {
  const { notes } = await api('getDevNotes', {})
  return notes
}

export async function addDevNote(content) {
  return api('addDevNote', { content, appVersion: APP_VERSION })
}

export async function deleteDevNote(noteId) {
  return api('deleteDevNote', { noteId })
}

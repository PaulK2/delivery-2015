// Private dev changelog — visible ONLY to ПАВЕЛ and В. ПЕТКОВ (see DEV_NOTE_ADMINS /
// requireDevNoteAccess in lib/auth.js). Every route here is gated by that, not
// requireAdmin, so other admins (ЦЕЦО, СИМО, МАГИ) get 'forbidden' the same as anyone else.
import { ok, fail } from '../lib/http.js'
import { requireDevNoteAccess } from '../lib/auth.js'
import { genId, nowStamp } from '../lib/util.js'

export async function getDevNotes(params, ctx) {
  const notAllowed = requireDevNoteAccess(ctx)
  if (notAllowed) return notAllowed

  const { results } = await ctx.env.DB.prepare('SELECT * FROM dev_notes ORDER BY created_at DESC').all()
  return ok({ notes: results })
}

export async function addDevNote(params, ctx) {
  const notAllowed = requireDevNoteAccess(ctx)
  if (notAllowed) return notAllowed

  const content = String(params.content || '').trim()
  if (!content) return fail('validation')

  const db = ctx.env.DB
  const id = genId('DEVN')
  await db
    .prepare('INSERT INTO dev_notes (note_id, author_id, author_name, content, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, ctx.user.employee_id, ctx.user.name, content, String(params.appVersion || ''), nowStamp())
    .run()
  return ok({ note_id: id })
}

// A dev may delete their own note (typo/correction) — not the other dev's.
export async function deleteDevNote(params, ctx) {
  const notAllowed = requireDevNoteAccess(ctx)
  if (notAllowed) return notAllowed

  const db = ctx.env.DB
  const noteId = params.noteId
  if (!noteId) return fail('validation')

  const note = await db.prepare('SELECT author_id FROM dev_notes WHERE note_id = ?').bind(noteId).first()
  if (!note) return fail('not_found')
  if (String(note.author_id) !== String(ctx.user.employee_id)) return fail('forbidden')

  await db.prepare('DELETE FROM dev_notes WHERE note_id = ?').bind(noteId).run()
  return ok({ note_id: noteId })
}

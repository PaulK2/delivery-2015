// Vehicle documents — direct port of the matching Backend.gs section.
import { ok, fail } from '../lib/http.js'
import { requireAuth, requireAdmin, audit } from '../lib/auth.js'
import { genId } from '../lib/util.js'

export async function getVehicleDocuments(params, ctx) {
  const unauth = requireAuth(ctx)
  if (unauth) return unauth

  const db = ctx.env.DB
  const { results } =
    params && params.carId
      ? await db.prepare('SELECT * FROM documents WHERE car_id = ?').bind(params.carId).all()
      : await db.prepare('SELECT * FROM documents').all()
  return ok({ documents: results })
}

export async function saveVehicleDocument(params, ctx) {
  const notAdmin = requireAdmin(ctx)
  if (notAdmin) return notAdmin

  const db = ctx.env.DB
  const doc = params.document || {}
  if (!doc.carId || !doc.type) return fail('validation')

  const car = await db.prepare('SELECT * FROM cars WHERE car_id = ?').bind(doc.carId).first()
  if (!car) return fail('car_not_found')

  if (doc.document_id) {
    const existing = await db.prepare('SELECT document_id FROM documents WHERE document_id = ?').bind(doc.document_id).first()
    if (existing) {
      await db
        .prepare(
          `UPDATE documents SET car_id = ?, registration = ?, type = ?, provider = ?, document_number = ?,
           valid_from = ?, valid_until = ?, warning_days = ?, notes = ? WHERE document_id = ?`
        )
        .bind(
          car.car_id, car.registration, doc.type, doc.provider || '', doc.documentNumber || '',
          doc.validFrom || '', doc.validUntil || '', doc.warningDays || 30, doc.notes || '',
          doc.document_id
        )
        .run()
      await audit(db, ctx.user, 'document_updated', 'document', doc.document_id, car.registration)
      return ok({ document_id: doc.document_id })
    }
  }

  const id = genId('DOC')
  await db
    .prepare(
      `INSERT INTO documents (document_id, car_id, registration, type, provider, document_number,
       valid_from, valid_until, warning_days, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, car.car_id, car.registration, doc.type, doc.provider || '', doc.documentNumber || '', doc.validFrom || '', doc.validUntil || '', doc.warningDays || 30, doc.notes || '')
    .run()
  await audit(db, ctx.user, 'document_created', 'document', id, car.registration)
  return ok({ document_id: id })
}

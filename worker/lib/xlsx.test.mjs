// Structural + content checks for the hand-rolled .xlsx writer. Since entries are
// written STORED (uncompressed), the worksheet XML bytes sit verbatim inside the zip,
// so a substring search on the decoded output is a legitimate content check — no zip
// library needed for the test either. (Round-tripped once by hand through a real
// parser — SheetJS, used read-only, never shipped — while building this; see the
// commit that introduced this file for that verification.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildXlsx } from './xlsx.js'

test('buildXlsx produces a well-formed zip with the expected local/central signatures', () => {
  const bytes = buildXlsx('Пътен лист', [
    ['Автомобил', 'Шофьор'],
    ['СВ1234АВ', 'ПАВЕЛ'],
  ])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // First bytes are a local file header ("PK\x03\x04").
  assert.equal(view.getUint32(0, true), 0x04034b50)

  // The end-of-central-directory record ("PK\x05\x06") must be present near the tail.
  const text = Buffer.from(bytes).toString('latin1')
  assert.ok(text.includes('PK\x05\x06'), 'missing end-of-central-directory record')

  // All 5 fixed OOXML parts must be present as zip entry names.
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) {
    assert.ok(text.includes(name), `missing zip entry: ${name}`)
  }
})

test('buildXlsx embeds the sheet name, headers, and row data (Cyrillic, quotes, &) correctly escaped', () => {
  const bytes = buildXlsx('Пътен лист', [
    ['Автомобил', 'Бележка'],
    ['СВ1234АВ', 'кавички "тест" & амперсанд'],
  ])
  const text = Buffer.from(bytes).toString('utf8')

  assert.ok(text.includes('<sheet name="Пътен лист"'), 'sheet name not embedded')
  assert.ok(text.includes('<t xml:space="preserve">Автомобил</t>'), 'header cell missing')
  assert.ok(text.includes('<t xml:space="preserve">СВ1234АВ</t>'), 'data cell missing')
  // & and " must be XML-escaped, not raw, inside the cell text.
  assert.ok(text.includes('&amp;'), 'ampersand not escaped')
  assert.ok(text.includes('&quot;'), 'quote not escaped')
  assert.ok(!/[^&]&[^a-z#]/.test(text.split('кавички')[1]?.slice(0, 60) || ''), 'raw unescaped & found near test cell')
})

test('buildXlsx writes numbers as plain <v> cells, not inline strings', () => {
  const bytes = buildXlsx('Sheet', [['Count'], [42]])
  const text = Buffer.from(bytes).toString('utf8')
  assert.ok(text.includes('<c r="A2"><v>42</v></c>'), 'numeric cell not written as a plain value')
})

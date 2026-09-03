// Minimal, dependency-free .xlsx (OOXML spreadsheet) writer for a single flat sheet
// of strings/numbers — no styling, no formulas. Deliberately hand-rolled instead of
// using the well-known `xlsx`/SheetJS package: that package has high-severity CVEs
// with no fix available (prototype pollution, ReDoS — both in its *parsing* path, but
// "no fix available" on a security-sensitive permanent-records feature isn't worth the
// dependency). This needs no Node APIs, so it's guaranteed to run in the Workers
// runtime. Writes STORED (uncompressed) zip entries — valid per the ZIP spec, and
// Excel/Sheets/LibreOffice all read them fine — which avoids needing a deflate impl.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// MS-DOS date/time packing (ZIP local/central headers use this, not a real timestamp).
function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f)
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
  return { time, day }
}

// Builds a STORED-method (uncompressed) ZIP archive from named byte entries.
function buildZip(entries) {
  const encoder = new TextEncoder()
  const { time, day } = dosDateTime(new Date())
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    const size = data.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0, true) // flags
    local.setUint16(8, 0, true) // method: stored
    local.setUint16(10, time, true)
    local.setUint16(12, day, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true) // compressed size
    local.setUint32(22, size, true) // uncompressed size
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // extra field length
    localParts.push(new Uint8Array(local.buffer), nameBytes, data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true) // version made by
    central.setUint16(6, 20, true) // version needed
    central.setUint16(8, 0, true) // flags
    central.setUint16(10, 0, true) // method: stored
    central.setUint16(12, time, true)
    central.setUint16(14, day, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true) // extra length
    central.setUint16(32, 0, true) // comment length
    central.setUint16(34, 0, true) // disk number
    central.setUint16(36, 0, true) // internal attrs
    central.setUint32(38, 0, true) // external attrs
    central.setUint32(42, offset, true) // offset of local header
    centralParts.push(new Uint8Array(central.buffer), nameBytes)

    offset += local.buffer.byteLength + nameBytes.length + size
  }

  const centralStart = offset
  let centralSize = 0
  for (const p of centralParts) centralSize += p.length

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(4, 0, true) // disk number
  end.setUint16(6, 0, true) // disk with central dir
  end.setUint16(8, entries.length, true) // entries on this disk
  end.setUint16(10, entries.length, true) // total entries
  end.setUint32(12, centralSize, true)
  end.setUint32(16, centralStart, true)
  end.setUint16(20, 0, true) // comment length

  const allParts = [...localParts, ...centralParts, new Uint8Array(end.buffer)]
  let total = 0
  for (const p of allParts) total += p.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of allParts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

function xmlEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[c]))
}

// 1-based column index -> "A", "B", … "Z", "AA", …
function colLetter(n) {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellXml(colIndex, rowIndex, value) {
  const ref = colLetter(colIndex) + rowIndex
  if (typeof value === 'number' && isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

function workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
}

// rows: array of arrays of string|number. The first row is typically the header —
// callers pass it as a normal row (bold/styling isn't supported by this minimal writer).
function worksheetXml(rows, colWidths) {
  const rowsXml = rows
    .map((row, rIdx) => {
      const cells = row.map((v, cIdx) => cellXml(cIdx + 1, rIdx + 1, v)).join('')
      return `<row r="${rIdx + 1}">${cells}</row>`
    })
    .join('')
  const cols = colWidths?.length
    ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${cols}<sheetData>${rowsXml}</sheetData>
</worksheet>`
}

// Builds a single-sheet .xlsx as a Uint8Array. `rows[0]` is treated as the header row
// (plain data, same as any other row — no bold styling in this minimal writer).
export function buildXlsx(sheetName, rows, colWidths) {
  const encoder = new TextEncoder()
  const entries = [
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheetName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheetXml(rows, colWidths)) },
  ]
  return buildZip(entries)
}

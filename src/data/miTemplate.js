import JSZip from 'jszip'
import shopMiTemplateUrl from '../assets/templates/MI-ST962-032-130.xlsx?url'
import { WTM_MIN_TAPING_PITCH_IN, ptfeShopPitchSetpoint } from './materialLibrary.js'

const INCH_TO_MM = 25.4
const SHOP_MI_TEMPLATE_URL = shopMiTemplateUrl
const SHOP_MI_TEMPLATE_NAME = 'MI-ST962-032-130.xlsx'
export const SHOP_MI_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const DEFAULT_MI_STEPS = [
  'Issue materials per BOM',
  'Apply PTFE tape',
  'Apply PTFE tape',
  'Perform tape conditioning',
  'Apply flat wire tapes (spiral and helical) to cable',
  'Perform signal integrity test',
  'Braid cable',
  'Perform signal integrity test',
  'Mix compounds',
  'Extrude cable',
  'Perform signal integrity test',
  'Mark and respool cable',
  'Package cable',
  'Perform final testing',
  'Perform final inspection',
  'Scan completed job package and route to engineering',
]

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value = '', style = '', mergeAcross = 0) {
  const attrs = [
    style ? `ss:StyleID="${style}"` : '',
    mergeAcross ? `ss:MergeAcross="${mergeAcross}"` : '',
  ].filter(Boolean).join(' ')
  const raw = value ?? ''
  const type = typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim()))
    ? 'Number'
    : 'String'
  return `<Cell${attrs ? ` ${attrs}` : ''}><Data ss:Type="${type}">${esc(raw)}</Data></Cell>`
}

function row(values = [], style = '') {
  return `<Row>${values.map((value) => Array.isArray(value) ? cell(value[0], value[1] || style, value[2] || 0) : cell(value, style)).join('')}</Row>`
}

function blankRows(count) {
  return Array.from({ length: count }, () => '<Row/>').join('')
}

const MI_COLUMNS = [92, 92, 112, 74, 74, 74, 88, 74, 74, 92]

function sheet(name, rowsXml, columns = MI_COLUMNS) {
  return `<Worksheet ss:Name="${esc(name).slice(0, 31)}">
  <Table>${columns.map((width) => `<Column ss:Width="${width}"/>`).join('')}${rowsXml}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Print><ValidPrinterInfo/></Print></WorksheetOptions>
 </Worksheet>`
}

function workbook(sheets) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="default"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="title"><Font ss:FontName="Arial" ss:Size="18" ss:Bold="1"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="titleRight"><Font ss:FontName="Arial" ss:Size="18" ss:Bold="1"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="topGrid"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="section"><Font ss:FontName="Arial" ss:Size="14" ss:Bold="1"/><Alignment ss:Vertical="Center"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="head"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#E6E6E6" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="label"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="plain"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="box"><Font ss:FontName="Arial" ss:Size="11"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="boxBlank"><Font ss:FontName="Arial" ss:Size="11"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#EFEFEF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="dashBox"><Font ss:FontName="Arial" ss:Size="11"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Dash" ss:Weight="2"/><Border ss:Position="Top" ss:LineStyle="Dash" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Dash" ss:Weight="2"/><Border ss:Position="Right" ss:LineStyle="Dash" ss:Weight="2"/></Borders></Style>
  <Style ss:ID="value"><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="note"><Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#666666"/></Style>
 </Styles>
 ${sheets.join('\n')}
</Workbook>`
}

function fmt(value, digits = 4) {
  const n = Number(value)
  if (!isFinite(n)) return ''
  return n.toFixed(digits)
}

function fmtInch(value, digits = 4) {
  return fmt(value, digits)
}

function toleranceTriplet(nominalIn, tol = 0.001) {
  const v = Number(nominalIn)
  if (!isFinite(v) || v <= 0) return ['', '', '']
  return [fmtInch(v - tol), fmtInch(v), fmtInch(v + tol)]
}

function overlapText(overlap) {
  const raw = String(overlap || '2/3').trim()
  if (raw.includes('/')) return `${raw} WRAP`
  const n = Number(raw)
  if (isFinite(n)) {
    const f = n > 1 ? n / 100 : n
    if (Math.abs(f - 0.5) < 0.02) return '1/2 WRAP'
    if (Math.abs(f - 2 / 3) < 0.03) return '2/3 WRAP'
    if (Math.abs(f - 0.75) < 0.03) return '3/4 WRAP'
  }
  return `${raw} WRAP`.toUpperCase()
}

function overlapFraction(overlap) {
  if (typeof overlap === 'number') {
    const f = overlap > 1 ? overlap / 100 : overlap
    if (Math.abs(f - 2 / 3) < 0.03) return 2 / 3
    if (Math.abs(f - 0.75) < 0.03) return 0.75
    return 0.5
  }
  const key = String(overlap || '').toLowerCase()
  if (key === '1/2') return 0.5
  if (key === '2/3') return 2 / 3
  if (key === '3/4') return 0.75
  return 2 / 3
}

function layDirection(index) {
  return index % 2 === 0 ? 'Z-DIRECTION' : 'S-DIRECTION'
}

function directionLetter(index) {
  return index % 2 === 0 ? 'Z' : 'S'
}

function coverSheet(options = {}) {
  const miNumber = options.miNumber || 'MI-ST962-____-___'
  const partNumber = options.partNumber || ''
  const date = options.date || new Date().toLocaleDateString('en-US')
  const by = options.by || ''
  const target = options.targetSummary || ''
  const rows = [
    row([['COVER SHEET', 'title', 3], [miNumber, 'titleRight', 5]]),
    blankRows(1),
    row(['Part Number', partNumber, 'Revision', '', 'By', by, 'Date', date], 'topGrid'),
    row([['Target', 'topGrid'], [target, 'topGrid', 8]], 'topGrid'),
    blankRows(1),
    row([['Operations', 'section', 9]]),
    row(['Op', ['Process', 'head', 2], 'Machine ID', 'By', 'Date', 'Notes'], 'head'),
    DEFAULT_MI_STEPS.map((step, i) => row([
      String(i + 1).padStart(2, '0'),
      [step, 'plain', 2],
      '',
      '',
      '',
      '',
    ], 'topGrid')).join(''),
  ].join('')
  return sheet('Cover', rows)
}

function genericOperationSheet(name, subtitle, rows = [], options = {}) {
  const miNumber = options.miNumber || 'MI-ST962-AUTO'
  const body = [
    row([[name, 'title', 3], [miNumber, 'titleRight', 5]]),
    row([[subtitle, 'section', 9]]),
    row([['Parameter', 'head', 2], 'Min.', 'Nom.', 'Max.', 'Actual', 'Oper.', 'Date'], 'head'),
    ...rows.map((item) => row([
      [item[0] || '', 'label', 2],
      [item[1] || '', 'box'],
      [item[2] || '', 'box'],
      [item[3] || '', 'box'],
      [item[4] || '', 'boxBlank'],
      [item[5] || '', 'boxBlank'],
      [item[6] || '', 'boxBlank'],
    ])),
    blankRows(Math.max(2, 12 - rows.length)),
  ].join('')
  return sheet(name, body)
}

function materialSection(materials) {
  const maxRows = Math.max(3, materials.length || 0)
  const rows = [
    row([['Materials', 'section', 3], ['', 'plain'], ['', 'plain'], ['REFERENCE AP96-007', 'label', 3]]),
    row([['Description', 'head', 1], ['Part Number', 'head', 1], ['', 'head', 1], ['Estimated Footage', 'label', 1], ['', 'dashBox', 1]], 'head'),
  ]
  for (let i = 0; i < maxRows; i++) {
    const m = materials[i] || {}
    rows.push(row([
      [m.description || `Tape #${i + 1}`, 'label', 1],
      [m.partNumber || '', m.partNumber ? 'box' : 'boxBlank', 1],
      ['', 'plain', 1],
      ['', 'plain', 1],
      ['', 'plain', 1],
    ]))
  }
  return rows.join('')
}

function parameterHeader() {
  return row([['', 'plain', 2], 'Min.', 'Nom.', 'Max.', 'Actual', 'Oper.', 'Date'], 'head')
}

function parameterRow(label, min = '', nom = '', max = '', actual = '', oper = '', date = '') {
  return row([
    [label, 'label', 2],
    [min, min === '' ? 'boxBlank' : 'box'],
    [nom, nom === '' ? 'boxBlank' : 'box'],
    [max, max === '' ? 'boxBlank' : 'box'],
    [actual, 'boxBlank'],
    [oper, 'boxBlank'],
    [date, 'boxBlank'],
  ])
}

function ptfeMachineSheet(name, entries, options = {}) {
  const date = options.date || new Date().toLocaleDateString('en-US')
  const by = options.by || ''
  const miNumber = options.miNumber || 'MI-ST962-AUTO'
  const sheetNo = Number(name.match(/#(\d+)/)?.[1] || 1)
  const materials = entries.map((entry, i) => ({
    description: `Tape #${i + 1}`,
    partNumber: entry.partNumber,
    thickness: entry.thicknessMil ? `${entry.thicknessMil} mil` : '',
    width: entry.widthIn ? `${fmtInch(entry.widthIn, 4)} in` : '',
  }))
  const conductorTriplet = toleranceTriplet(options.conductorOdIn)
  const finalEntry = entries[entries.length - 1]
  const finalTriplet = finalEntry ? toleranceTriplet(finalEntry.odAfterIn) : ['', '', '']

  const rows = [
    row([[`SHEET ${sheetNo} OF 12`, 'title', 3], [miNumber, 'titleRight', 5]]),
    row(['Process', [name, 'topGrid', 1], 'Machine ID', ['WTM 3-Bay', 'topGrid', 1], 'By', by, 'Date', date], 'topGrid'),
    blankRows(1),
    materialSection(materials),
    blankRows(1),
    parameterHeader(),
    parameterRow('"PO" LaserLink OD (Avg, Inch)', ...conductorTriplet),
  ]
  entries.forEach((entry, i) => {
    const label = `Tape #${i + 1}`
    rows.push(parameterRow(`${label}, Lay Direction`, '', entry.direction, ''))
    rows.push(parameterRow(`${label}, Pitch Set-Point`, '', entry.pitchIn ? fmtInch(entry.pitchIn, 4) : '', ''))
    rows.push(parameterRow(`${label}, Overlap`, '', entry.overlapText, ''))
    rows.push(parameterRow(`${label}, Tension (N)`, '', fmt(entry.tensionN, 1), ''))
    rows.push(parameterRow(`${label}, Roller #1/#2 Position`, '', entry.rollerPosition || '', ''))
    rows.push(parameterRow(`"H${i + 1}" LaserLink OD (Avg, Inch)`, ...toleranceTriplet(entry.odAfterIn)))
  })
  rows.push(parameterRow('Line Speed (ft/min)', '', fmt(options.lineSpeedFtMin || 7, 0), ''))
  rows.push(parameterRow('"TU" LaserLink OD (Avg, Inch)', ...finalTriplet))
  rows.push(parameterRow('Take-Up Spool Size', '', options.takeUpSpool || '', ''))

  return sheet(name, rows.join(''))
}

function makeLegacyBlankMiWorkbook(options = {}) {
  return workbook([
    coverSheet(options),
    ptfeMachineSheet('PTFE Tape #1', [{}, {}, {}], options),
    ptfeMachineSheet('PTFE Tape #2', [{}, {}, {}], options),
    genericOperationSheet('Tape Conditioning', 'Oven bake / conditioning', [
      ['Oven temperature (F)', '', '', '', '', ''],
      ['Minimum bake time (hr)', '', '', '', '', ''],
      ['Spool ID', '', '', '', '', ''],
    ], options),
    genericOperationSheet('Spiral Shield', 'Flatwire and foil shield application', [
      ['Flatwire part number', '', '', '', '', ''],
      ['Foil part number', '', '', '', '', ''],
      ['Lay direction', '', '', '', '', ''],
      ['Pitch set-point', '', '', '', '', ''],
      ['Overlap / gap', '', '', '', '', ''],
      ['Tension (N)', '', '', '', '', ''],
    ], options),
    genericOperationSheet('SI Post Spiral', 'Signal integrity test after spiral shield', [], options),
    genericOperationSheet('Braiding', 'Braid process setup', [
      ['Braid material', '', '', '', '', ''],
      ['Carriers', '', '', '', '', ''],
      ['Ends', '', '', '', '', ''],
      ['Picks', '', '', '', '', ''],
      ['Coverage', '', '', '', '', ''],
    ], options),
    genericOperationSheet('SI Post Braid', 'Signal integrity test after braid', [], options),
    genericOperationSheet('Mixing', 'Compound mixing', [], options),
    genericOperationSheet('Extrusion', 'Jacket extrusion', [], options),
    genericOperationSheet('SI Post Jacket', 'Signal integrity test after jacket', [], options),
    genericOperationSheet('Mark Respool', 'UV laser mark and respool', [], options),
    genericOperationSheet('Package', 'Package cable', [], options),
  ])
}

export function buildPtfeMiEntries({ conductorOdMm, layers, overlap, tensionN = 4.0, lineSpeedFtMin = 7 }) {
  const conductorOdIn = Number(conductorOdMm) / INCH_TO_MM
  let radiusMm = Number(conductorOdMm) / 2
  let layerIndex = 0
  const entries = []

  ;(layers || []).forEach((layer) => {
    const passes = Math.max(1, Number(layer.passes || 1))
    const tapeThicknessMm = Number(layer.tape_thickness_mm || layer.tapeThicknessMm || 0)
    const tensionFactor = Number(layer.tension_factor || 0.92)
    const overlapMode = layer.overlap || overlap || '2/3'
    const overlapLayers = Math.max(1, Math.round(1 / Math.max(0.05, 1 - overlapFraction(overlapMode))))
    const radialBuildMm = tapeThicknessMm * overlapLayers * tensionFactor
    const widthIn = Number(layer.tape_width_in || (layer.tape_width_mm ? layer.tape_width_mm / INCH_TO_MM : 0))
    for (let pass = 0; pass < passes; pass++) {
      const odBeforeMm = 2 * radiusMm
      const direction = String(layer.direction || layer.lay_direction || '').trim().toUpperCase().startsWith('S')
        ? 'S-DIRECTION'
        : String(layer.direction || layer.lay_direction || '').trim().toUpperCase().startsWith('Z')
          ? 'Z-DIRECTION'
          : layDirection(layerIndex)
      const pitchInfo = ptfeShopPitchSetpoint({
        cableOdMm: odBeforeMm,
        tapeWidthIn: widthIn,
        overlap: overlapMode,
        densityCode: layer.density_code || layer.densityCode,
        density: layer.density,
        partNumber: layer.part_number || layer.partNumber,
      })
      radiusMm += radialBuildMm
      entries.push({
        pass: entries.length + 1,
        partNumber: layer.part_number || layer.partNumber || '',
        densityCode: layer.density_code || layer.densityCode || '',
        thicknessMil: layer.tape_thickness_mil,
        widthIn,
        direction,
        directionLetter: direction.startsWith('S') ? 'S' : directionLetter(layerIndex),
        pitchIn: pitchInfo.pitchIn,
        calculatedPitchIn: pitchInfo.calculatedPitchIn,
        pitchClamped: pitchInfo.pitchLimited,
        minPitchIn: WTM_MIN_TAPING_PITCH_IN,
        overlapText: overlapText(overlapMode),
        tensionN,
        rollerPosition: `${layerIndex % 6}/6`,
        odAfterIn: (2 * radiusMm) / INCH_TO_MM,
        lineSpeedFtMin,
      })
      layerIndex += 1
    }
  })

  return { conductorOdIn, entries }
}

function makeLegacyPtfeMiWorkbook(options = {}) {
  const {
    miNumber = 'MI-ST962-AUTO',
    partNumber = '',
    by = '',
    date = new Date().toLocaleDateString('en-US'),
    targetSummary = '',
    conductorOdMm,
    layers = [],
    overlap = '2/3',
    tensionN = 4.0,
    lineSpeedFtMin = 7,
    predicted = {},
  } = options

  const { conductorOdIn, entries } = buildPtfeMiEntries({ conductorOdMm, layers, overlap, tensionN, lineSpeedFtMin })
  const chunks = []
  for (let i = 0; i < entries.length; i += 3) chunks.push(entries.slice(i, i + 3))

  const processSheets = chunks.length
    ? chunks.map((chunk, i) => ptfeMachineSheet(`PTFE Tape #${i + 1}`, chunk, { date, by, miNumber, conductorOdIn, lineSpeedFtMin }))
    : [ptfeMachineSheet('PTFE Tape #1', [{}, {}, {}], { date, by, miNumber, conductorOdIn, lineSpeedFtMin })]

  const recipeRows = [
    row([[`PTFE Auto Recipe`, 'title', 6]]),
    row(['Target summary', targetSummary, 'Predicted OD', predicted.final_od_mm ? `${predicted.final_od_mm} mm` : '', 'Predicted VP', predicted.vp || ''], 'value'),
    row(['Predicted Z0', predicted.z0_ohm ? `${predicted.z0_ohm} ohm` : '', 'Eps eff', predicted.eps_eff || '', '', ''], 'value'),
    blankRows(1),
    row(['Pass', 'Part Number', 'Direction', 'Pitch Set-Point (in)', 'Overlap', 'Tension (N)', 'OD After Wrap (in)'], 'head'),
    ...entries.map((entry) => row([
      entry.pass,
      entry.partNumber,
      entry.direction,
      fmtInch(entry.pitchIn, 4),
      entry.overlapText,
      fmt(entry.tensionN, 1),
      fmtInch(entry.odAfterIn, 4),
    ])),
  ].join('')

  return workbook([
    coverSheet({ miNumber, partNumber, date, by, targetSummary }),
    sheet('PTFE Recipe', recipeRows),
    ...processSheets,
    genericOperationSheet('Tape Conditioning', 'Oven bake / conditioning', [
      ['Oven temperature (F)', '365', '370', '375', '', 'From reference MI; edit for material/process'],
      ['Minimum bake time (hr)', '', '8', '', '', ''],
      ['Final PTFE OD (in)', '', entries.length ? fmtInch(entries[entries.length - 1].odAfterIn, 4) : '', '', '', ''],
    ], { miNumber }),
    genericOperationSheet('Spiral Shield', 'Flatwire and foil shield application', [], { miNumber }),
    genericOperationSheet('SI Post Spiral', 'Signal integrity test after spiral shield', [], { miNumber }),
    genericOperationSheet('Braiding', 'Braid process setup', [], { miNumber }),
    genericOperationSheet('SI Post Braid', 'Signal integrity test after braid', [], { miNumber }),
    genericOperationSheet('Mixing', 'Compound mixing', [], { miNumber }),
    genericOperationSheet('Extrusion', 'Jacket extrusion', [], { miNumber }),
    genericOperationSheet('SI Post Jacket', 'Signal integrity test after jacket', [], { miNumber }),
    genericOperationSheet('Mark Respool', 'UV laser mark and respool', [], { miNumber }),
    genericOperationSheet('Package', 'Package cable', [], { miNumber }),
  ])
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readAttrs(tag) {
  const attrs = {}
  String(tag || '').replace(/([\w:]+)="([^"]*)"/g, (_, key, value) => {
    attrs[key] = value
    return ''
  })
  return attrs
}

function normalizeXlsxTarget(target) {
  const raw = String(target || '').replace(/^\/+/, '')
  if (raw.startsWith('xl/')) return raw
  return `xl/${raw}`
}

async function sheetPathMap(zip) {
  const workbookXml = await zip.file('xl/workbook.xml').async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const rels = {}
  ;(relsXml.match(/<Relationship\b[^>]*\/>/g) || []).forEach((tag) => {
    const attrs = readAttrs(tag)
    if (attrs.Id && attrs.Target) rels[attrs.Id] = normalizeXlsxTarget(attrs.Target)
  })
  const sheets = {}
  ;(workbookXml.match(/<sheet\b[^>]*\/>/g) || []).forEach((tag) => {
    const attrs = readAttrs(tag)
    const rid = attrs['r:id']
    if (attrs.name && rid && rels[rid]) sheets[attrs.name] = rels[rid]
  })
  return sheets
}

function cellStyleAttrs(cellXml) {
  const style = String(cellXml || '').match(/\ss="[^"]*"/)?.[0] || ''
  const meta = String(cellXml || '').match(/\scm="[^"]*"/)?.[0] || ''
  const vm = String(cellXml || '').match(/\svm="[^"]*"/)?.[0] || ''
  return `${style}${meta}${vm}`
}

function cellXml(ref, previousXml, value, type = 'auto') {
  const style = cellStyleAttrs(previousXml)
  if (value == null || value === '') return `<c r="${ref}"${style}/>`
  const numeric = type === 'number' || (type === 'auto' && typeof value === 'number' && Number.isFinite(value))
  if (numeric) return `<c r="${ref}"${style}><v>${Number(value)}</v></c>`
  return `<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

function splitCellRef(ref) {
  const match = String(ref || '').toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { col: match[1], row: Number(match[2]) }
}

function columnIndex(col) {
  return String(col || '').toUpperCase().split('').reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0)
}

function rowNumberFromTag(rowTag) {
  const match = String(rowTag || '').match(/\br="(\d+)"/)
  return match ? Number(match[1]) : Number.NaN
}

function writeExistingCell(xml, ref, value, type = 'auto') {
  const pattern = new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*/>|<c\\b(?=[^>]*\\br="${ref}")[^>]*>[\\s\\S]*?<\\/c>`)
  if (pattern.test(xml)) {
    return xml.replace(pattern, (previous) => cellXml(ref, previous, value, type))
  }

  const parsed = splitCellRef(ref)
  if (!parsed) return xml
  const newCell = cellXml(ref, '', value, type)
  const rowPattern = new RegExp(`<row\\b(?=[^>]*\\br="${parsed.row}")[^>]*>[\\s\\S]*?<\\/row>`)
  if (rowPattern.test(xml)) {
    return xml.replace(rowPattern, (rowXml) => {
      const targetCol = columnIndex(parsed.col)
      const cells = Array.from(rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g))
      const nextCell = cells.find((match) => columnIndex(match[1]) > targetCol)
      if (nextCell?.index != null) {
        return `${rowXml.slice(0, nextCell.index)}${newCell}${rowXml.slice(nextCell.index)}`
      }
      return rowXml.replace('</row>', `${newCell}</row>`)
    })
  }

  const newRow = `<row r="${parsed.row}">${newCell}</row>`
  const sheetDataPattern = /<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/
  return xml.replace(sheetDataPattern, (sheetDataXml) => {
    const rows = Array.from(sheetDataXml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g))
    const nextRow = rows.find((match) => rowNumberFromTag(match[0]) > parsed.row)
    if (nextRow?.index != null) {
      return `${sheetDataXml.slice(0, nextRow.index)}${newRow}${sheetDataXml.slice(nextRow.index)}`
    }
    return sheetDataXml.replace('</sheetData>', `${newRow}</sheetData>`)
  })
}

async function removeCalcChain(zip) {
  zip.remove('xl/calcChain.xml')
  zip.remove('xl/_rels/calcChain.xml.rels')

  const relsPath = 'xl/_rels/workbook.xml.rels'
  if (zip.file(relsPath)) {
    let relsXml = await zip.file(relsPath).async('string')
    relsXml = relsXml.replace(/<Relationship\b(?=[^>]*(?:Target="calcChain\.xml"|Type="[^"]*\/calcChain"))[^>]*\/>\s*/g, '')
    relsXml = relsXml.replace(/<Relationship\b(?=[^>]*Target="\/?xl\/calcChain\.xml")[^>]*\/>\s*/g, '')
    zip.file(relsPath, relsXml)
  }

  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let contentTypesXml = await zip.file(contentTypesPath).async('string')
    contentTypesXml = contentTypesXml.replace(/<Override\b(?=[^>]*PartName="\/xl\/calcChain\.xml")[^>]*\/>\s*/g, '')
    zip.file(contentTypesPath, contentTypesXml)
  }
}

function writeTripletAt(xml, rowNumber, triplet, minCol, nomCol, maxCol) {
  const [min, nom, max] = triplet
  let next = writeExistingCell(xml, `${minCol}${rowNumber}`, min === '' ? '-' : min, typeof min === 'number' ? 'number' : 'auto')
  next = writeExistingCell(next, `${nomCol}${rowNumber}`, nom === '' ? '' : nom, typeof nom === 'number' ? 'number' : 'auto')
  next = writeExistingCell(next, `${maxCol}${rowNumber}`, max === '' ? '-' : max, typeof max === 'number' ? 'number' : 'auto')
  return next
}

function writeTapingTriplet(xml, rowNumber, triplet) {
  return writeTripletAt(xml, rowNumber, triplet, 'C', 'E', 'F')
}

function writeMachineTriplet(xml, rowNumber, triplet) {
  return writeTripletAt(xml, rowNumber, triplet, 'B', 'E', 'F')
}

function blankTriplet() {
  return ['-', '', '-']
}

function xlsxToleranceTriplet(nominalIn, tol = 0.001) {
  const v = Number(nominalIn)
  if (!Number.isFinite(v) || v <= 0) return blankTriplet()
  return [Number((v - tol).toFixed(4)), Number(v.toFixed(4)), Number((v + tol).toFixed(4))]
}

function xlsxNominalTriplet(nominalIn) {
  const v = Number(nominalIn)
  if (!Number.isFinite(v) || v <= 0) return blankTriplet()
  return ['-', Number(v.toFixed(4)), '-']
}

function mmToIn(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n / INCH_TO_MM : Number.NaN
}

function finiteNumber(value, fallback = Number.NaN) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fixedNumber(value, digits = 4) {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : ''
}

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return Number.NaN
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function percentCell(value, fallback) {
  const n = Number(value)
  const raw = Number.isFinite(n) ? n : Number(fallback)
  if (!Number.isFinite(raw)) return ''
  return Number((raw > 1 ? raw / 100 : raw).toFixed(4))
}

function directionText(value, fallback = 'Z', suffix = '') {
  const text = String(value || fallback || '').trim().toUpperCase()
  const dir = text.startsWith('S') ? 'S' : 'Z'
  return `${dir}-DIRECTION${suffix}`
}

function shieldLayerByType(layers, type) {
  return (layers || []).find((layer) => String(layer?.type || '').toLowerCase() === type) || null
}

function readLayerText(step, apply, ...keys) {
  for (const key of keys) {
    const text = String(step?.[key] ?? apply?.[key] ?? '').trim()
    if (text) return text
  }
  return ''
}

function shieldWrapText(value, fallbackPct = 50) {
  const text = String(value ?? '').trim()
  if (text.includes('/')) return overlapText(text)
  const n = Number(text)
  const pct = Number.isFinite(n) ? (n > 1 ? n : n * 100) : fallbackPct
  if (Math.abs(pct - 50) < 3) return '1/2 WRAP'
  if (Math.abs(pct - 66.7) < 4) return '2/3 WRAP'
  if (Math.abs(pct - 75) < 4) return '3/4 WRAP'
  return `${Number(pct.toFixed(1))}% OVERLAP`
}

function braidPartNumberFromSetup(setup = {}, fallback = '') {
  const explicit = firstText(setup.part_number, setup.partNumber, fallback)
  if (explicit) return explicit
  const awg = Math.round(Number(setup.wire_awg ?? setup.gauge))
  const ends = Math.round(Number(setup.ends_per_carrier ?? setup.ends))
  if (Number.isFinite(awg) && Number.isFinite(ends) && awg > 0 && ends > 0) {
    return `961-96207-SCC-${awg}-${ends}`
  }
  return ''
}

function excelDateSerial(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const iso = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const utc = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const utc = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000)
}

function uint8ToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function loadShopMiZip() {
  const response = await fetch(SHOP_MI_TEMPLATE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load ${SHOP_MI_TEMPLATE_NAME} (${response.status})`)
  return JSZip.loadAsync(await response.arrayBuffer())
}

function clearTapingSlot(xml, slot) {
  const materialRow = 6 + slot
  const baseRow = 21 + slot * 8
  let next = writeExistingCell(xml, `D${materialRow}`, '-')
  next = writeExistingCell(next, `C${baseRow}`, '-')
  next = writeTapingTriplet(next, baseRow + 1, blankTriplet())
  next = writeExistingCell(next, `C${baseRow + 2}`, '-')
  next = writeTapingTriplet(next, baseRow + 3, blankTriplet())
  next = writeExistingCell(next, `C${baseRow + 4}`, '-')
  next = writeTapingTriplet(next, baseRow + 6, blankTriplet())
  return next
}

function fillTapingSlot(xml, slot, entry) {
  const materialRow = 6 + slot
  const baseRow = 21 + slot * 8
  let next = writeExistingCell(xml, `D${materialRow}`, entry.partNumber || '-')
  next = writeExistingCell(next, `C${baseRow}`, entry.direction || '-')
  next = writeTapingTriplet(next, baseRow + 1, ['-', fixedNumber(entry.pitchIn, 4), '-'])
  next = writeExistingCell(next, `C${baseRow + 2}`, entry.overlapText || '-')
  next = writeTapingTriplet(next, baseRow + 3, ['-', fixedNumber(entry.tensionN, 1), '-'])
  next = writeExistingCell(next, `C${baseRow + 4}`, entry.rollerPosition || '-')
  next = writeTapingTriplet(next, baseRow + 6, xlsxNominalTriplet(entry.odAfterIn))
  return next
}

async function patchTapingSheet(zip, path, sheetEntries, options) {
  if (!path || !zip.file(path)) return
  const incomingOdIn = Number(options.incomingOdIn)
  const finalOdIn = sheetEntries.length
    ? sheetEntries[sheetEntries.length - 1].odAfterIn
    : Number.NaN
  let xml = await zip.file(path).async('string')

  xml = writeTapingTriplet(xml, 10, xlsxToleranceTriplet(incomingOdIn))
  for (let slot = 0; slot < 3; slot++) {
    xml = sheetEntries[slot] ? fillTapingSlot(xml, slot, sheetEntries[slot]) : clearTapingSlot(xml, slot)
  }
  xml = writeTapingTriplet(xml, 45, sheetEntries.length ? ['-', Number(options.lineSpeedFtMin || 7), '-'] : blankTriplet())
  xml = writeTapingTriplet(xml, 47, sheetEntries.length ? xlsxNominalTriplet(finalOdIn) : blankTriplet())
  zip.file(path, xml)
}

async function patchSpiralShieldSheet(zip, path, options = {}) {
  if (!path || !zip.file(path)) return { filled: false }
  const shieldLayers = Array.isArray(options.shieldLayers) ? options.shieldLayers : []
  const applyLayers = Array.isArray(options.applyLayers) ? options.applyLayers : []
  const spiralStep = shieldLayerByType(shieldLayers, 'spiral')
  const spiralApply = shieldLayerByType(applyLayers, 'spiral')
  const foilStep = shieldLayerByType(shieldLayers, 'foil') || shieldLayerByType(shieldLayers, 'flatwire')
  const foilApply = shieldLayerByType(applyLayers, 'foil') || shieldLayerByType(applyLayers, 'flatwire')
  const incomingOdIn = firstFinite(options.incomingOdIn, mmToIn(options.incomingOdMm), mmToIn(spiralStep?.od_before_mm), mmToIn(foilStep?.od_before_mm))
  const spiralOdAfterIn = firstFinite(options.spiralOdAfterIn, mmToIn(options.spiralOdAfterMm), mmToIn(spiralStep?.od_after_mm), mmToIn(spiralApply?.ODAfterMm))
  const foilOdAfterIn = firstFinite(options.foilOdAfterIn, mmToIn(options.foilOdAfterMm), mmToIn(foilStep?.od_after_mm), mmToIn(foilApply?.ODAfterMm))
  const finalOdIn = firstFinite(foilOdAfterIn, spiralOdAfterIn, incomingOdIn)
  const spiralPitch = firstFinite(options.spiralPitchSetpoint, options.spiralPitch, spiralStep?.mi_pitch_setpoint, spiralStep?.pitch_setpoint, spiralStep?.pitch_mm, spiralApply?.pitch)
  const foilPitchIn = firstFinite(options.foilPitchSetpointIn, options.foilPitchIn, foilStep?.pitch_in, foilApply?.pitch_in, mmToIn(options.foilPitchSetpointMm), mmToIn(options.foilPitchMm), mmToIn(foilStep?.pitch_mm), mmToIn(foilApply?.pitch))
  const foilOverlap = firstText(options.foilWrap, options.foilOverlap, foilStep?.wrap, foilStep?.overlap_text, foilStep?.overlap_pct, foilApply?.overlap)
  const hasSpiral = Boolean(spiralStep || spiralApply)
  const hasFoil = Boolean(foilStep || foilApply)
  let xml = await zip.file(path).async('string')

  xml = writeExistingCell(xml, 'D6', hasSpiral ? readLayerText(spiralStep, spiralApply, 'part_number', 'partNumber') || '-' : '-')
  xml = writeExistingCell(xml, 'D7', hasFoil ? readLayerText(foilStep, foilApply, 'part_number', 'partNumber') || '-' : '-')
  xml = writeExistingCell(xml, 'D8', options.takeUpSpool || options.take_up_spool || 'AT12679 (24"x14")')
  xml = writeMachineTriplet(xml, 10, xlsxToleranceTriplet(incomingOdIn))
  xml = writeMachineTriplet(xml, 12, ['-', finiteNumber(options.caterpillarGap, 1.03), '-'])
  xml = writeMachineTriplet(xml, 13, ['-', percentCell(options.payOffTorquePct, 30), '-'])
  xml = writeMachineTriplet(xml, 14, ['-', percentCell(options.takeUpTorquePct, 30), '-'])

  if (hasSpiral) {
    const spiralDieSize = firstFinite(options.spiralDieSizeIn, spiralStep?.die_size_in, spiralApply?.dieSizeIn, spiralOdAfterIn)
    xml = writeExistingCell(xml, 'B16', directionText(readLayerText(spiralStep, spiralApply, 'direction'), 'S'))
    xml = writeExistingCell(xml, 'B17', firstFinite(options.spiralBobbins, spiralStep?.bobbins, spiralApply?.bobbins, 8), 'number')
    xml = writeMachineTriplet(xml, 18, ['-', Number.isFinite(spiralPitch) ? Number(spiralPitch.toFixed(4)) : '', '-'])
    xml = writeExistingCell(xml, 'B19', Number.isFinite(spiralDieSize) ? Number(spiralDieSize.toFixed(3)) : '-')
    xml = writeMachineTriplet(xml, 21, xlsxToleranceTriplet(spiralOdAfterIn))
  } else {
    xml = writeExistingCell(xml, 'B16', '-')
    xml = writeExistingCell(xml, 'B17', '-')
    xml = writeMachineTriplet(xml, 18, blankTriplet())
    xml = writeExistingCell(xml, 'B19', '-')
    xml = writeMachineTriplet(xml, 21, blankTriplet())
  }

  if (hasFoil) {
    const foilType = String(foilStep?.type || foilApply?.type || '').toLowerCase()
    const isMetalFoil = foilType !== 'flatwire'
    xml = writeExistingCell(xml, 'B23', directionText(readLayerText(foilStep, foilApply, 'direction'), 'Z', isMetalFoil ? ' / FOIL IN' : ''))
    xml = writeExistingCell(xml, 'B24', Number.isFinite(foilPitchIn) ? Number(foilPitchIn.toFixed(4)) : '-')
    xml = writeExistingCell(xml, 'B25', shieldWrapText(foilOverlap, firstFinite(foilStep?.overlap_pct, foilApply?.overlap, 50)))
    xml = writeMachineTriplet(xml, 26, ['-', firstFinite(options.foilTensionN, options.tapeTensionN, foilStep?.tension_n, foilApply?.tension, 5), '-'])
    xml = writeExistingCell(xml, 'B27', firstText(options.foilRoller1Position, foilStep?.roller_1_position, foilApply?.roller1, '1'))
    xml = writeExistingCell(xml, 'B28', firstText(options.foilRoller2Position, foilStep?.roller_2_position, foilApply?.roller2, '1'))
    xml = writeMachineTriplet(xml, 30, xlsxToleranceTriplet(foilOdAfterIn))
  } else {
    xml = writeExistingCell(xml, 'B23', '-')
    xml = writeExistingCell(xml, 'B24', '-')
    xml = writeExistingCell(xml, 'B25', '-')
    xml = writeMachineTriplet(xml, 26, blankTriplet())
    xml = writeExistingCell(xml, 'B27', '-')
    xml = writeExistingCell(xml, 'B28', '-')
    xml = writeMachineTriplet(xml, 30, blankTriplet())
  }

  xml = writeMachineTriplet(xml, 32, ['-', finiteNumber(options.lineSpeedFtMin, 7), '-'])
  xml = writeMachineTriplet(xml, 34, xlsxToleranceTriplet(finalOdIn))
  zip.file(path, xml)
  return { filled: hasSpiral || hasFoil, filledSpiral: hasSpiral, filledFoil: hasFoil }
}

async function patchBraidingSheet(zip, path, options = {}) {
  if (!path || !zip.file(path)) return { filled: false }
  const shieldLayers = Array.isArray(options.shieldLayers) ? options.shieldLayers : []
  const applyLayers = Array.isArray(options.applyLayers) ? options.applyLayers : []
  const braidStep = shieldLayerByType(shieldLayers, 'braid')
  const braidApply = shieldLayerByType(applyLayers, 'braid')
  if (!braidStep && !braidApply) {
    let xml = await zip.file(path).async('string')
    xml = writeExistingCell(xml, 'C6', '-')
    xml = writeExistingCell(xml, 'C7', '-')
    xml = writeMachineTriplet(xml, 9, blankTriplet())
    xml = writeMachineTriplet(xml, 10, blankTriplet())
    xml = writeMachineTriplet(xml, 12, blankTriplet())
    xml = writeExistingCell(xml, 'B13', '-')
    xml = writeMachineTriplet(xml, 14, blankTriplet())
    xml = writeMachineTriplet(xml, 15, blankTriplet())
    xml = writeMachineTriplet(xml, 16, blankTriplet())
    xml = writeMachineTriplet(xml, 18, blankTriplet())
    xml = writeExistingCell(xml, 'B19', '-')
    xml = writeExistingCell(xml, 'B21', '-')
    xml = writeMachineTriplet(xml, 26, blankTriplet())
    xml = writeMachineTriplet(xml, 27, blankTriplet())
    xml = writeMachineTriplet(xml, 29, blankTriplet())
    zip.file(path, xml)
    return { filled: false }
  }

  const setup = braidStep?.braid_setup || braidApply || {}
  const incomingOdIn = firstFinite(options.braidIncomingOdIn, mmToIn(options.braidIncomingOdMm), mmToIn(braidStep?.od_before_mm))
  const outgoingOdIn = firstFinite(options.braidOutgoingOdIn, mmToIn(options.braidOutgoingOdMm), mmToIn(braidStep?.od_after_mm))
  const carriers = firstFinite(options.braidCarriers, setup.carriers, braidApply?.carriers)
  const ends = firstFinite(options.braidEndsPerCarrier, setup.ends_per_carrier, braidApply?.ends)
  const picks = firstFinite(options.braidPicksPerIn, setup.picks_per_in, braidApply?.picks)
  const awg = firstFinite(setup.wire_awg, braidApply?.gauge)
  const coverage = firstFinite(options.braidCoveragePct, setup.coverage_pct, braidApply?.coverage)
  const angle = firstFinite(options.braidAngleDeg, setup.braid_angle_deg, 38.07)
  const rpm = firstFinite(options.braidRpm, picks > 0 && picks <= 15 ? 100 : 30)
  const dieSizeIn = firstFinite(options.braidDieSizeIn, incomingOdIn > 0 ? Math.max(incomingOdIn + 0.03, incomingOdIn * 1.3) : Number.NaN)
  let xml = await zip.file(path).async('string')

  xml = writeExistingCell(xml, 'C6', braidPartNumberFromSetup({ ...setup, wire_awg: awg, ends_per_carrier: ends }, options.braidPartNumber || options.braid_part_number))
  xml = writeExistingCell(xml, 'C7', options.takeUpSpool || options.take_up_spool || 'AT12679 (24" x 14")')
  xml = writeMachineTriplet(xml, 9, [0.9, percentCell(coverage, 95), 1])
  xml = writeMachineTriplet(xml, 10, [35, Number.isFinite(angle) ? Number(angle.toFixed(2)) : 38.07, 45])
  xml = writeMachineTriplet(xml, 12, xlsxToleranceTriplet(incomingOdIn))
  xml = writeExistingCell(xml, 'B13', Number.isFinite(carriers) ? Math.round(carriers) : '-')
  xml = writeMachineTriplet(xml, 14, ['-', Number.isFinite(ends) ? Math.round(ends) : '', '-'])
  xml = writeMachineTriplet(xml, 15, ['-', Number.isFinite(picks) ? Number(picks.toFixed(1)) : '', '-'])
  xml = writeMachineTriplet(xml, 16, ['-', Number.isFinite(rpm) ? Number(rpm.toFixed(1)) : '', '-'])
  xml = writeMachineTriplet(xml, 18, ['-', Number.isFinite(dieSizeIn) ? Number(dieSizeIn.toFixed(3)) : '', '-'])
  xml = writeExistingCell(xml, 'B19', firstText(options.braidTensionSpringColor, options.tensionSpringColor, 'Blue'))
  xml = writeExistingCell(xml, 'B21', 'OFF')
  xml = writeMachineTriplet(xml, 26, ['-', firstFinite(options.braidTakeUpTraverse, options.takeUpTraverse, 1.8), '-'])
  xml = writeMachineTriplet(xml, 27, ['-', firstFinite(options.braidTakeUpTension, options.takeUpTension, 1.8), '-'])
  xml = writeMachineTriplet(xml, 29, xlsxToleranceTriplet(outgoingOdIn, 0.002))
  zip.file(path, xml)
  return { filled: true, braidPartNumber: braidPartNumberFromSetup({ ...setup, wire_awg: awg, ends_per_carrier: ends }, options.braidPartNumber || options.braid_part_number) }
}

async function patchHeaderCells(zip, paths, options) {
  const by = options.by || ''
  const dateSerial = excelDateSerial(options.date || new Date())
  for (const path of Object.values(paths)) {
    if (!path || !zip.file(path)) continue
    let xml = await zip.file(path).async('string')
    xml = writeExistingCell(xml, 'F2', by)
    xml = writeExistingCell(xml, 'J2', dateSerial, typeof dateSerial === 'number' ? 'number' : 'auto')
    zip.file(path, xml)
  }

  const coverPath = paths['Cover Sheet']
  if (coverPath && zip.file(coverPath)) {
    let xml = await zip.file(coverPath).async('string')
    xml = writeExistingCell(xml, 'D2', by)
    xml = writeExistingCell(xml, 'E2', dateSerial, typeof dateSerial === 'number' ? 'number' : 'auto')
    zip.file(coverPath, xml)
  }
}

async function makeShopMiXlsx(options = {}, entries = [], conductorOdIn = Number.NaN) {
  const zip = await loadShopMiZip()
  const paths = await sheetPathMap(zip)
  const lineSpeedFtMin = options.lineSpeedFtMin || 7
  await patchHeaderCells(zip, paths, options)

  const firstEntries = entries.slice(0, 3)
  const secondEntries = entries.slice(3, 6)
  await patchTapingSheet(zip, paths['Taping (3-Bay)'], firstEntries, {
    incomingOdIn: conductorOdIn,
    lineSpeedFtMin,
  })
  await patchTapingSheet(zip, paths['Taping (3-Bay) (2)'], secondEntries, {
    incomingOdIn: entries[2]?.odAfterIn ?? (firstEntries.length ? firstEntries[firstEntries.length - 1].odAfterIn : conductorOdIn),
    lineSpeedFtMin,
  })
  await patchSpiralShieldSheet(zip, paths['Spiral Shield'], {})
  await patchBraidingSheet(zip, paths.Braiding, {})

  await removeCalcChain(zip)
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    base64: uint8ToBase64(bytes),
    mime: SHOP_MI_XLSX_MIME,
    extension: 'xlsx',
    template: SHOP_MI_TEMPLATE_NAME,
    filledTapingEntries: Math.min(entries.length, 6),
    omittedTapingEntries: Math.max(0, entries.length - 6),
  }
}

export async function makeShieldMiWorkbook(options = {}) {
  const zip = await loadShopMiZip()
  const paths = await sheetPathMap(zip)
  await patchHeaderCells(zip, paths, options)
  const lineSpeedFtMin = options.lineSpeedFtMin || 7
  const ptfeLayers = Array.isArray(options.ptfeLayers) ? options.ptfeLayers : []
  const ptfeConductorOdMm = firstFinite(options.ptfeConductorOdMm, options.conductorOdMm)
  const ptfeMi = ptfeLayers.length && ptfeConductorOdMm > 0
    ? buildPtfeMiEntries({
        conductorOdMm: ptfeConductorOdMm,
        layers: ptfeLayers,
        overlap: options.ptfeOverlap || options.overlap || '2/3',
        tensionN: firstFinite(options.ptfeTensionN, options.tensionN, 4.0),
        lineSpeedFtMin,
      })
    : { conductorOdIn: Number.NaN, entries: [] }
  const firstEntries = ptfeMi.entries.slice(0, 3)
  const secondEntries = ptfeMi.entries.slice(3, 6)
  await patchTapingSheet(zip, paths['Taping (3-Bay)'], firstEntries, {
    incomingOdIn: ptfeMi.conductorOdIn,
    lineSpeedFtMin,
  })
  await patchTapingSheet(zip, paths['Taping (3-Bay) (2)'], secondEntries, {
    incomingOdIn: ptfeMi.entries[2]?.odAfterIn ?? (firstEntries.length ? firstEntries[firstEntries.length - 1].odAfterIn : ptfeMi.conductorOdIn),
    lineSpeedFtMin,
  })
  const spiral = await patchSpiralShieldSheet(zip, paths['Spiral Shield'], options)
  const braid = await patchBraidingSheet(zip, paths.Braiding, options)
  await removeCalcChain(zip)
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    base64: uint8ToBase64(bytes),
    mime: SHOP_MI_XLSX_MIME,
    extension: 'xlsx',
    template: SHOP_MI_TEMPLATE_NAME,
    filledTapingEntries: Math.min(ptfeMi.entries.length, 6),
    omittedTapingEntries: Math.max(0, ptfeMi.entries.length - 6),
    filledShieldSheets: [spiral.filled ? 'Spiral Shield' : null, braid.filled ? 'Braiding' : null].filter(Boolean),
    filledSpiralShield: Boolean(spiral.filled),
    filledBraid: Boolean(braid.filled),
    braidPartNumber: braid.braidPartNumber || '',
  }
}

export async function makeBlankMiWorkbook(options = {}) {
  return makeShopMiXlsx(options, [], Number.NaN)
}

export async function makePtfeMiWorkbook(options = {}) {
  const {
    conductorOdMm,
    layers = [],
    overlap = '2/3',
    tensionN = 4.0,
    lineSpeedFtMin = 7,
  } = options

  const { conductorOdIn, entries } = buildPtfeMiEntries({ conductorOdMm, layers, overlap, tensionN, lineSpeedFtMin })
  return makeShopMiXlsx({ ...options, lineSpeedFtMin }, entries, conductorOdIn)
}

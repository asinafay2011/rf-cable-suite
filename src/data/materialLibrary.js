const INCH_TO_MM = 25.4
const MIL_TO_MM = 0.0254

export const PTFE_TAPE_BASE_PART = '962-96000'
export const SPC_SPIRAL_BASE_PART = '962-96001'
export const FOIL_TAPE_BASE_PART = '962-96003'
export const SPC_HELICAL_BASE_PART = '962-96004'

export const PTFE_TAPE_PART_NUMBERS = Array.from(new Set([
  '962-96000-04H0375',
  '962-96000-02H0500',
  '962-96000-05H0500',
  '962-96000-10H0500',
  '962-96000-02H0625',
  '962-96000-02H1000',
  '962-96000-03H0250',
  '962-96000-02H0375',
  '962-96000-02L0250',
  '962-96000-03L0250',
  '962-96000-05L0250',
  '962-96000-04L0375',
  '962-96000-05L0375',
  '962-96000-05L0500',
  '962-96000-05L0750',
  '962-96000-10L0750',
  '962-96000-05L1000',
  '962-96000-10L1000',
  '962-96000-02H0250',
  '962-96000-02H0250-1',
  '962-96000-02H0250-3',
  '962-96000-02H0250-5',
  '962-96000-02H0250-6',
  '962-96000-02H0250-9',
  '962-96000-02H1000-9',
  '962-96000-04H0250',
  '962-96000-02H0500-9',
  '962-96000-08L0375',
  '962-96000-08L0500',
  '962-96000-08L0625',
  '962-96000-06H0625',
  '962-96000-02L0125',
  '962-96000-02L0500',
  '962-96000-03L0125',
  '962-96000-02H0125',
  '962-96000-03H0125',
  '962-96000-05H250',
  '962-96000-05H0250',
  '962-96000-08H0500',
  '962-96000-08H0375',
  '962-96000-05H0375',
  '962-96000-05L0200',
  '962-96000-05L0150',
]))

export const SPC_FLATWIRE_PART_NUMBERS = Array.from(new Set([
  '962-96001-SPC-2.5-0300',
  '962-96001-SPC-2.5-0360',
  '962-96001-SPC-2.5-0500',
  '962-96001-SPC-2.5-0895',
  '962-96004-SPC-2.5-0750',
  '962-96001-SPC-2.5-0450',
  '962-96001-SPC-2.5-0600',
  '962-96001-SPC-1.0-0130',
  '962-96004-SPC-2.5-1250',
  '962-96001-SPC-1.0-0220',
  '962-96001-SPC-2.5-0750',
  '962-96004-SPC-2.5-2500',
  '962-96001-SPC-2.5-2500',
  '962-96001-SPC-1.0-0400',
  '962-96001-SPC-1.0-0250',
  '962-96001-SPC-2.5-1250',
  '962-96004-1000',
  '962-96004-SPC-1.0-0300',
  '962-96004-SPC-1.0-0600',
  '962-96004-SPC-2.0-0600',
  '962-96004-SPC-1.0-0750',
  '962-96004-SPC-1.0-1250',
  '962-96004-SPC-1.0-1000',
]))

export const FOIL_TAPE_PART_NUMBERS = Array.from(new Set([
  '962-96003-1.4-0250',
  '962-96003-1.4-0375',
  '962-96003-1.4-0500',
  '962-96003-1.4-2000',
  '962-96003-1.4-1500',
  '962-96003-1.4-1750',
  '962-96003-ALK-1.4-0750',
  '962-96003-1.4-1000',
  '962-96003-1.4-1250',
  '962-96003-ALK-1.4-0311',
  '962-96003-ALK-1.4-0125',
]))

export const MATERIAL_FAMILIES = [
  {
    id: 'ptfe_tape',
    label: 'PTFE tape',
    basePart: PTFE_TAPE_BASE_PART,
    status: 'active',
    note: 'Skived PTFE tape. Part suffix is thickness mil + density code + width inch code.',
  },
  {
    id: 'foil_tape',
    label: 'Foil tape',
    basePart: FOIL_TAPE_BASE_PART,
    status: 'active',
    note: 'ALK aluminum/Kapton foil tape. Missing ALK in legacy part strings is normalized into the catalog.',
  },
  {
    id: 'spc_flatwire',
    label: 'SPC flatwire',
    basePart: `${SPC_SPIRAL_BASE_PART} / ${SPC_HELICAL_BASE_PART}`,
    status: 'active',
    note: 'Silver-plated copper flatwire. 962-96001 is spiral bobbin stock; 962-96004 is large-spool helical stock.',
  },
  { id: 'braid', label: 'Braid wire', status: 'next' },
  { id: 'jacket', label: 'Jacket compound', status: 'next' },
]

export function parsePtfeTapePartNumber(partNumber) {
  const raw = String(partNumber || '').trim().toUpperCase()
  if (!raw) return null
  if (raw === PTFE_TAPE_BASE_PART) {
    return {
      id: raw.toLowerCase(),
      partNumber: raw,
      family: 'ptfe_tape',
      material: 'PTFE tape',
      isFamilyPart: true,
    }
  }

  const match = raw.match(/^962-96000-(\d{2})([LH])(\d{3,4})(?:-(\d+))?$/)
  if (!match) return null

  const [, milCode, densityCode, widthCodeRaw, variant] = match
  const widthCode = widthCodeRaw.padStart(4, '0')
  const thicknessMil = Number(milCode)
  const widthIn = Number(widthCode) / 1000
  const densityLabel = densityCode === 'H' ? 'High density' : 'Low density'
  const densityGcc = densityCode === 'H' ? 1.6 : 0.7

  return {
    id: raw.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    partNumber: raw,
    basePart: PTFE_TAPE_BASE_PART,
    family: 'ptfe_tape',
    material: 'PTFE tape',
    thicknessMil,
    thicknessMm: thicknessMil * MIL_TO_MM,
    densityCode,
    densityLabel,
    densityGcc,
    widthCode,
    widthIn,
    widthMm: widthIn * INCH_TO_MM,
    variant: variant || '',
  }
}

export const PTFE_TAPE_MATERIALS = PTFE_TAPE_PART_NUMBERS
  .map(parsePtfeTapePartNumber)
  .filter(Boolean)
  .sort((a, b) => (
    a.densityCode.localeCompare(b.densityCode)
    || a.thicknessMil - b.thicknessMil
    || a.widthIn - b.widthIn
    || String(a.variant).localeCompare(String(b.variant))
  ))

export function parseSpcFlatwirePartNumber(partNumber) {
  const raw = String(partNumber || '').trim().toUpperCase()
  if (!raw) return null
  const match = raw.match(/^(962-9600[14])(?:-SPC-(\d+(?:\.\d+)?)-(\d{4})|-(\d{4}))$/)
  if (!match) return null

  const [, basePart, thicknessRaw, widthCodeA, widthCodeB] = match
  const thicknessMil = thicknessRaw == null ? null : Number(thicknessRaw)
  const widthCode = widthCodeA || widthCodeB
  const shieldUse = basePart === SPC_SPIRAL_BASE_PART ? 'spiral' : 'helical'
  const widthIn = Number(widthCode) / 100000

  return {
    id: raw.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    partNumber: raw,
    basePart,
    family: 'spc_flatwire',
    material: 'SPC flatwire',
    plating: 'SPC',
    platingLabel: 'Silver-plated copper',
    shieldUse,
    spoolLabel: shieldUse === 'spiral' ? 'Spiral bobbin stock' : 'Helical large spool',
    thicknessMil,
    thicknessMm: thicknessMil == null ? null : thicknessMil * MIL_TO_MM,
    widthCode,
    widthIn,
    widthMm: widthIn * INCH_TO_MM,
  }
}

export const SPC_FLATWIRE_MATERIALS = SPC_FLATWIRE_PART_NUMBERS
  .map(parseSpcFlatwirePartNumber)
  .filter(Boolean)
  .sort((a, b) => (
    a.shieldUse.localeCompare(b.shieldUse)
    || (a.thicknessMil ?? 999) - (b.thicknessMil ?? 999)
    || a.widthIn - b.widthIn
    || a.partNumber.localeCompare(b.partNumber)
  ))

export function parseFoilTapePartNumber(partNumber) {
  const raw = String(partNumber || '').trim().toUpperCase()
  if (!raw) return null
  const match = raw.match(/^(962-96003)(?:-ALK)?-(\d+(?:\.\d+)?)-(\d{4})$/)
  if (!match) return null

  const [, basePart, thicknessRaw, widthCode] = match
  const thicknessMil = Number(thicknessRaw)
  const canonicalPart = `${basePart}-ALK-${thicknessRaw}-${widthCode}`
  const widthIn = Number(widthCode) / 10000

  return {
    id: canonicalPart.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    partNumber: canonicalPart,
    sourcePartNumber: raw,
    aliases: Array.from(new Set([raw, canonicalPart])),
    basePart,
    family: 'foil_tape',
    material: 'Foil tape',
    laminate: 'ALK',
    laminateLabel: 'Aluminum/Kapton laminate',
    thicknessMil,
    thicknessMm: thicknessMil * MIL_TO_MM,
    widthCode,
    widthIn,
    widthMm: widthIn * INCH_TO_MM,
  }
}

export const FOIL_TAPE_MATERIALS = Array.from(
  FOIL_TAPE_PART_NUMBERS
    .map(parseFoilTapePartNumber)
    .filter(Boolean)
    .reduce((map, item) => {
      const existing = map.get(item.partNumber)
      if (existing) {
        existing.aliases = Array.from(new Set([...(existing.aliases || []), ...(item.aliases || [])]))
        return map
      }
      map.set(item.partNumber, item)
      return map
    }, new Map())
    .values()
).sort((a, b) => (
  a.thicknessMil - b.thicknessMil
  || a.widthIn - b.widthIn
  || a.partNumber.localeCompare(b.partNumber)
))

export function formatPtfeTapeLabel(tape) {
  if (!tape) return 'Select PTFE tape'
  const width = tape.widthIn < 1 ? tape.widthIn.toFixed(3) : tape.widthIn.toFixed(2)
  return `${tape.partNumber} · ${tape.thicknessMil} mil ${tape.densityCode} · ${width} in`
}

export function formatSpcFlatwireLabel(flatwire) {
  if (!flatwire) return 'Select SPC flatwire'
  const thick = flatwire.thicknessMil == null ? 'thickness TBD' : `${flatwire.thicknessMil} mil`
  return `${flatwire.partNumber} · ${flatwire.shieldUse} · ${thick} · ${flatwire.widthIn.toFixed(4)} in`
}

export function formatFoilTapeLabel(foil) {
  if (!foil) return 'Select foil tape'
  return `${foil.partNumber} · ${foil.laminate} · ${foil.thicknessMil} mil · ${foil.widthIn.toFixed(4)} in`
}

export function findPtfeTapeByPart(partNumber) {
  const key = String(partNumber || '').trim().toUpperCase()
  return PTFE_TAPE_MATERIALS.find((tape) => tape.partNumber === key) || null
}

export function findFoilTapeByPart(partNumber) {
  const key = String(partNumber || '').trim().toUpperCase()
  return FOIL_TAPE_MATERIALS.find((foil) => foil.partNumber === key || foil.aliases?.includes(key)) || null
}

export function findSpcFlatwireByPart(partNumber) {
  const key = String(partNumber || '').trim().toUpperCase()
  return SPC_FLATWIRE_MATERIALS.find((flatwire) => flatwire.partNumber === key) || null
}

function densityCodeFrom(input = {}) {
  const explicit = String(input.densityCode || '').toUpperCase()
  if (explicit === 'H' || explicit === 'L') return explicit
  const prefer = String(input.prefer || '').toLowerCase()
  if (prefer === 'hd' || prefer === 'high' || prefer === 'high_density') return 'H'
  if (prefer === 'ld' || prefer === 'low' || prefer === 'low_density') return 'L'
  const density = Number(input.densityGcc ?? input.density)
  if (density > 0) return density >= 1.1 ? 'H' : 'L'
  return ''
}

export function findNearestPtfeTape(input = {}) {
  const byPart = findPtfeTapeByPart(input.partNumber || input.materialPart || input.material_id)
  const desiredDensity = densityCodeFrom(input)
  const desiredMil = Number(input.thicknessMil ?? input.mil ?? (input.thicknessMm || input.tape_thickness_mm) / MIL_TO_MM)
  const desiredWidthMm = Number(input.widthMm ?? input.width ?? input.tape_width_mm ?? input.widthIn * INCH_TO_MM)
  const maxThicknessMil = Number(input.maxThicknessMil || input.maxMil || Infinity)
  if (byPart && byPart.thicknessMil <= maxThicknessMil + 0.0001) return byPart
  const candidates = PTFE_TAPE_MATERIALS.filter((tape) => tape.thicknessMil <= maxThicknessMil + 0.0001)
  const pool = candidates.length ? candidates : PTFE_TAPE_MATERIALS

  return pool
    .map((tape) => {
      const densityPenalty = desiredDensity && tape.densityCode !== desiredDensity ? 35 : 0
      const milPenalty = Number.isFinite(desiredMil) ? Math.abs(tape.thicknessMil - desiredMil) * 4 : 0
      const widthPenalty = Number.isFinite(desiredWidthMm) ? Math.abs(tape.widthMm - desiredWidthMm) * 0.9 : 0
      const variantPenalty = tape.variant ? 0.3 : 0
      return { tape, score: densityPenalty + milPenalty + widthPenalty + variantPenalty }
    })
    .sort((a, b) => a.score - b.score)[0]?.tape || PTFE_TAPE_MATERIALS[0]
}

export function findNearestSpcFlatwire(input = {}) {
  const byPart = findSpcFlatwireByPart(input.partNumber || input.spcPartNumber || input.materialPart || input.material_id)
  if (byPart) return byPart

  const desiredUse = String(input.shieldUse || input.use || input.type || '').toLowerCase()
  const desiredMil = Number(input.thicknessMil ?? input.mil ?? (input.thicknessMm ? input.thicknessMm / MIL_TO_MM : NaN))
  const desiredWidthMm = Number(input.widthMm ?? input.width ?? (input.widthIn ? input.widthIn * INCH_TO_MM : NaN))
  const poolByUse = SPC_FLATWIRE_MATERIALS.filter((item) => {
    if (desiredUse === 'spiral') return item.shieldUse === 'spiral'
    if (desiredUse === 'flatwire' || desiredUse === 'helical') return item.shieldUse === 'helical'
    return true
  })
  const pool = poolByUse.length ? poolByUse : SPC_FLATWIRE_MATERIALS

  return pool
    .map((flatwire) => {
      const milPenalty = Number.isFinite(desiredMil) && flatwire.thicknessMil != null
        ? Math.abs(flatwire.thicknessMil - desiredMil) * 10
        : flatwire.thicknessMil == null ? 4 : 0
      const widthPenalty = Number.isFinite(desiredWidthMm) ? Math.abs(flatwire.widthMm - desiredWidthMm) * 18 : 0
      return { flatwire, score: milPenalty + widthPenalty }
    })
    .sort((a, b) => a.score - b.score)[0]?.flatwire || SPC_FLATWIRE_MATERIALS[0]
}

export function findNearestFoilTape(input = {}) {
  const byPart = findFoilTapeByPart(input.partNumber || input.foilPartNumber || input.materialPart || input.material_id)
  if (byPart) return byPart

  const desiredMil = Number(input.thicknessMil ?? input.mil ?? (input.thicknessMm ? input.thicknessMm / MIL_TO_MM : NaN))
  const desiredWidthMm = Number(input.widthMm ?? input.width ?? (input.widthIn ? input.widthIn * INCH_TO_MM : NaN))

  return FOIL_TAPE_MATERIALS
    .map((foil) => {
      const milPenalty = Number.isFinite(desiredMil) ? Math.abs(foil.thicknessMil - desiredMil) * 8 : 0
      const widthPenalty = Number.isFinite(desiredWidthMm) ? Math.abs(foil.widthMm - desiredWidthMm) * 3 : 0
      return { foil, score: milPenalty + widthPenalty }
    })
    .sort((a, b) => a.score - b.score)[0]?.foil || FOIL_TAPE_MATERIALS[0]
}

export function ptfeTapeToLayer(tape, patch = {}) {
  if (!tape) return { ...patch }
  return {
    materialId: tape.id,
    partNumber: tape.partNumber,
    densityCode: tape.densityCode,
    mil: tape.thicknessMil,
    width: tape.widthMm,
    density: tape.densityGcc,
    tapeThicknessMm: tape.thicknessMm,
    tapeWidthIn: tape.widthIn,
    ...patch,
  }
}

export function foilTapeToLayer(foil, patch = {}) {
  if (!foil) return { ...patch }
  return {
    materialId: foil.id,
    partNumber: foil.partNumber,
    sourcePartNumber: foil.sourcePartNumber,
    material: foil.material,
    laminate: foil.laminate,
    laminateLabel: foil.laminateLabel,
    thicknessMil: foil.thicknessMil,
    thicknessMm: foil.thicknessMm,
    width: foil.widthMm,
    widthIn: foil.widthIn,
    widthCode: foil.widthCode,
    ...patch,
  }
}

export function spcFlatwireToLayer(flatwire, patch = {}) {
  if (!flatwire) return { ...patch }
  return {
    materialId: flatwire.id,
    partNumber: flatwire.partNumber,
    material: flatwire.material,
    plating: flatwire.plating,
    shieldUse: flatwire.shieldUse,
    thicknessMil: flatwire.thicknessMil,
    thicknessMm: flatwire.thicknessMm,
    width: flatwire.widthMm,
    widthIn: flatwire.widthIn,
    widthCode: flatwire.widthCode,
    ...patch,
  }
}

export function ptfeTapeToToolLayer(tape, patch = {}) {
  if (!tape) return { ...patch }
  return {
    part_number: tape.partNumber,
    material_id: tape.id,
    density_code: tape.densityCode,
    density_label: tape.densityLabel,
    density: tape.densityGcc,
    tape_thickness_mm: tape.thicknessMm,
    tape_thickness_mil: tape.thicknessMil,
    tape_width_mm: tape.widthMm,
    tape_width_in: tape.widthIn,
    ...patch,
  }
}

export function spcFlatwireToToolLayer(flatwire, patch = {}) {
  if (!flatwire) return { ...patch }
  return {
    part_number: flatwire.partNumber,
    material_id: flatwire.id,
    material: flatwire.material,
    plating: flatwire.plating,
    plating_label: flatwire.platingLabel,
    shield_use: flatwire.shieldUse,
    spool_label: flatwire.spoolLabel,
    thickness_mil: flatwire.thicknessMil,
    thickness_mm: flatwire.thicknessMm,
    width_in: flatwire.widthIn,
    width_mm: flatwire.widthMm,
    width_code: flatwire.widthCode,
    ...patch,
  }
}

export function foilTapeToToolLayer(foil, patch = {}) {
  if (!foil) return { ...patch }
  return {
    part_number: foil.partNumber,
    source_part_number: foil.sourcePartNumber,
    aliases: foil.aliases,
    material_id: foil.id,
    material: foil.material,
    laminate: foil.laminate,
    laminate_label: foil.laminateLabel,
    thickness_mil: foil.thicknessMil,
    thickness_mm: foil.thicknessMm,
    width_in: foil.widthIn,
    width_mm: foil.widthMm,
    width_code: foil.widthCode,
    ...patch,
  }
}

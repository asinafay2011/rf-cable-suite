// Tools exposed to the RF agent. Pure-math + small DBs, client-side dispatch.
import { getCustomRfCables, addCustomRfCable, deleteCustomRfCable } from './customCableStore.js'
import { getCompanyDefaults, setCompanyDefaults, resetCompanyDefaults } from './companyDefaults.js'
import { getShopMemory, proposeShopRule } from './shopMemory.js'
import { RF_CABLES, RF_CATEGORIES, getRfCableSourceMeta } from '../data/rfCableLibrary.js'
import {
  FOIL_TAPE_MATERIALS,
  PTFE_TAPE_MATERIALS,
  SPC_FLATWIRE_MATERIALS,
  findFoilTapeByPart,
  findNearestFoilTape,
  findNearestPtfeTape,
  findNearestSpcFlatwire,
  findPtfeTapeByPart,
  findSpcFlatwireByPart,
  ptfeTapeToToolLayer,
  ptfeShopPitchSetpoint,
  foilTapeToToolLayer,
  normalizePtfeWrap,
  ptfeWrapFraction,
  ptfeWrapLayers,
  recommendPtfeWrapForCable,
  spiralFlatwireWidthFromDielectricOd,
  spcFlatwireToToolLayer,
  DEFAULT_SPIRAL_BOBBINS,
  DEFAULT_SPIRAL_GAP_PCT,
  SMALL_CABLE_MAX_PTFE_WIDTH_IN,
  SMALL_CABLE_TAPE_OD_IN,
  WTM_MIN_TAPING_PITCH_IN,
  WTM_MIN_TAPING_PITCH_MM,
} from '../data/materialLibrary.js'
import { buildPtfeMiEntries, makeBlankMiWorkbook, makePtfeMiWorkbook } from '../data/miTemplate.js'
import { HIGGSFIELD_TOOLS, dispatchHiggsfieldTool, isHiggsfieldTool } from './higgsfieldTools.js'

const RF_CALIBRATION_MEMORY_KEY = 'rf-stack-calibration-memory-v1'

// ── Material properties database ────────────────────────
export const MATERIAL_DB = {
  copper:    { name: 'Copper (Cu)',         rho_ohm_m: 1.68e-8, mu_r: 1, sigma_S_per_m: 5.96e7, density_g_cm3: 8.96, tmax_c: 200,  notes: 'Best general-purpose conductor for RF cable.' },
  silver:    { name: 'Silver (Ag)',         rho_ohm_m: 1.59e-8, mu_r: 1, sigma_S_per_m: 6.30e7, density_g_cm3: 10.49, tmax_c: 200, notes: 'Lowest resistivity. Used for plating in high-Q / low-IL applications.' },
  aluminum:  { name: 'Aluminum (Al)',       rho_ohm_m: 2.65e-8, mu_r: 1, sigma_S_per_m: 3.77e7, density_g_cm3: 2.70, tmax_c: 200,  notes: 'Lighter and cheaper than Cu. Used for outer foil shields and Heliax outers.' },
  tin_plated_cu:    { name: 'Tinned Copper (TC)',     rho_ohm_m: 1.72e-8, mu_r: 1, sigma_S_per_m: 5.81e7, density_g_cm3: 8.93, tmax_c: 150, notes: 'Cu plated with Sn for solderability + corrosion resistance.' },
  silver_plated_cu: { name: 'Silver-plated Cu (SPC)', rho_ohm_m: 1.59e-8, mu_r: 1, sigma_S_per_m: 6.30e7, density_g_cm3: 8.96, tmax_c: 200, notes: 'Standard for high-frequency RF cable.' },
  nickel_plated_cu: { name: 'Nickel-plated Cu (NPC)', rho_ohm_m: 1.75e-8, mu_r: 100, sigma_S_per_m: 5.71e7, density_g_cm3: 8.95, tmax_c: 250, notes: 'Higher temp, magnetic outer (lossier above ~1 GHz due to ferromagnetic skin).' },
  pe_solid:  { name: 'Polyethylene (solid PE)', er: 2.30, tan_delta: 1e-4, density_g_cm3: 0.94, tmax_c: 80,  notes: 'Standard low-loss dielectric for RG-class cables.' },
  pe_foamed: { name: 'Foamed PE',           er: 1.55, tan_delta: 7e-5, density_g_cm3: 0.55, tmax_c: 80,  notes: 'Air-filled PE; lower εr → faster (higher VF) and lighter, slightly less compression-tolerant.' },
  ptfe:      { name: 'PTFE',                er: 2.10, tan_delta: 2e-4, density_g_cm3: 2.20, tmax_c: 200, notes: 'High temp, chemically inert. Used in mil-spec cable.' },
  fep:       { name: 'FEP',                 er: 2.05, tan_delta: 7e-4, density_g_cm3: 2.15, tmax_c: 200, notes: 'Easier-to-process fluoropolymer; slightly lossier than PTFE.' },
  pfa:       { name: 'PFA',                 er: 2.05, tan_delta: 4e-4, density_g_cm3: 2.15, tmax_c: 250, notes: 'Highest-temp common fluoropolymer; aerospace.' },
  eptfe:     { name: 'ePTFE',               er: 1.30, tan_delta: 1e-4, density_g_cm3: 0.6,  tmax_c: 200, notes: 'Expanded PTFE; ultra-low εr for highest VF.' },
  pvc:       { name: 'PVC',                 er: 3.50, tan_delta: 0.03,  density_g_cm3: 1.40, tmax_c: 80,  notes: 'Lossy at RF; jacket only.' },
  air:       { name: 'Air',                 er: 1.0006, tan_delta: 0,   density_g_cm3: 0.0012, tmax_c: 1000, notes: 'Theoretical lower-bound dielectric for hardline (Heliax with nitrogen pressurization).' },
}

// ── Standards database ──────────────────────────────────
export const STANDARDS_DB = {
  'tia-568.2-d': {
    name: 'TIA-568.2-D',
    title: 'Balanced Twisted-Pair Telecommunications Cabling',
    scope: 'Cat 5e, Cat 6, Cat 6A, Cat 8 cabling channel + permanent link performance.',
    key_clauses: [
      'NEXT (worst-pair to worst-pair) limits per category',
      'Return loss limits over 1–500 MHz (Cat 6A) / 2 GHz (Cat 8)',
      'Insertion loss limits, propagation delay, delay skew',
      'TCL / ELTCTL for pair balance',
    ],
    typical_limits: {
      'Cat 6A': { freq_max_mhz: 500, max_skew_ps_per_m: 45, max_il_db_per_100m_at_500mhz: 30.5, min_next_db_at_100mhz: 39.9 },
      'Cat 8':  { freq_max_mhz: 2000, max_skew_ps_per_m: 25, max_il_db_per_100m_at_2000mhz: 67.0, min_next_db_at_2000mhz: 13.1 },
    },
  },
  'ieee-802.3bq': {
    name: 'IEEE 802.3bq',
    title: '25/40 GBASE-T over Cat 6A / Cat 8',
    scope: 'Physical layer for 25 Gbps and 40 Gbps Ethernet over twisted pair.',
    key_clauses: ['30 m max channel length', 'Cat 8 cabling required', '4-pair full-duplex with PAM-16 modulation'],
  },
  'scte-51': {
    name: 'SCTE 51',
    title: 'Test Methods for Drop Cable Braid Coverage',
    scope: 'How to measure optical coverage of single-layer cable braids.',
    key_clauses: ['α = arctan(2π·R·PR/C)', 'F = (P·PR·d)/sin α', 'K = (2F − F²)·100%'],
  },
  'mil-std-1553b': {
    name: 'MIL-STD-1553B',
    title: 'Aircraft Internal Time-Division Multiplex Data Bus',
    scope: 'Avionics serial data bus, 1 Mbps, transformer-coupled.',
    key_clauses: ['78 Ω characteristic impedance (typically met by 70–85 Ω)', 'Twinax cable + transformer-coupled stubs', '6 dB max stub attenuation'],
  },
  'iec-61156': {
    name: 'IEC 61156',
    title: 'Multicore and symmetrical pair/quad cables for digital communications',
    scope: 'International equivalent / superset of TIA-568 for category cables.',
    key_clauses: ['Series 5 and 6 categories', 'Frequency-dependent IL/NEXT/RL limits'],
  },
  'usb4': {
    name: 'USB4',
    title: 'USB Type-C / USB4 Specification',
    scope: 'High-speed USB cable assemblies (20 / 40 / 80 Gbps).',
    key_clauses: ['Differential 100 Ω ±10 %', 'Intra-pair skew ≤ 5 ps/m', 'IL @ Nyquist limited per cable class'],
  },
  'ecss-50-12c': {
    name: 'ECSS-E-ST-50-12C',
    title: 'SpaceWire links, nodes, routers and networks',
    scope: 'Spacecraft on-board point-to-point serial data link.',
    key_clauses: ['Differential LVDS', 'Up to 400 Mbps', '100 Ω twin-axial cable'],
  },
}

// ── Shared RF cable database ───────────────────────────
// Source tables in rfCableLibrary.js are dB / 100 m for the UI;
// RF tools expose dB / 100 ft for compatibility with existing tool contracts.
const _dbPer100mTo100ft = (db) => Number((db * 0.3048).toFixed(3))

function _normaliseLibraryCable(id, cable) {
  const sourceMeta = getRfCableSourceMeta(id, cable)
  const attenuation100ft = {}
  const attenuation100m = {}
  for (const [freq, dbPer100m] of cable.atten || []) {
    attenuation100m[freq] = dbPer100m
    attenuation100ft[freq] = _dbPer100mTo100ft(dbPer100m)
  }
  return {
    id,
    name: cable.name,
    z0: cable.z,
    vf: cable.vp ? cable.vp / 100 : undefined,
    od_mm: cable.OD,
    conductor_od_mm: cable.d,
    dielectric_od_mm: cable.D,
    shield_od_mm: cable.shield,
    fmax_ghz: cable.fMax,
    v_max: cable.vMax,
    capacitance_pf_m: cable.cap,
    mass_g_m: cable.mass,
    flex: cable.flex,
    outdoor: cable.outdoor,
    power: cable.power,
    complexity: cable.complexity,
    category: cable.cat,
    category_label: RF_CATEGORIES[cable.cat]?.label || cable.cat,
    alias: cable.alias,
    notes: cable.apps,
    makers: cable.makers,
    construction: cable.cons,
    process: cable.proc,
    render: cable.render,
    model: cable.model,
    macroModel: cable.macroModel,
    datasheet: cable.datasheet,
    source_confidence: sourceMeta.confidence,
    source_label: sourceMeta.label,
    source_name: sourceMeta.sourceName,
    source_detail: sourceMeta.sourceDetail,
    source_note: sourceMeta.description,
    atten_db_per_100m: attenuation100m,
    atten_db_per_100ft: attenuation100ft,
  }
}

export const RF_CABLE_DB = Object.fromEntries(
  Object.entries(RF_CABLES).map(([id, cable]) => [id, _normaliseLibraryCable(id, cable)])
)

// ── Connector database ─────────────────────────────────
export const CONNECTOR_DB = {
  'n':    { name: 'N-type',  fmax_ghz: 18, il_db: 0.10, return_loss_db: 26, gender: ['M','F'], notes: 'Industry workhorse for outdoor RF, 50/75 Ω versions.' },
  'sma':  { name: 'SMA',     fmax_ghz: 18, il_db: 0.15, return_loss_db: 25, gender: ['M','F'], notes: '3.5 mm interface compatible with 3.5 mm and 2.92 mm.' },
  'tnc':  { name: 'TNC',     fmax_ghz: 11, il_db: 0.15, return_loss_db: 23, gender: ['M','F'], notes: 'Threaded BNC. Better high-freq performance than BNC.' },
  'bnc':  { name: 'BNC',     fmax_ghz: 4,  il_db: 0.30, return_loss_db: 20, gender: ['M','F'], notes: 'Bayonet, 50 or 75 Ω. Test bench standard.' },
  '7-16': { name: '7/16 DIN', fmax_ghz: 7.5, il_db: 0.05, return_loss_db: 30, gender: ['M','F'], notes: 'Low-PIM, high-power tower-top.' },
  'mmcx': { name: 'MMCX',    fmax_ghz: 6,  il_db: 0.20, return_loss_db: 20, gender: ['M','F'], notes: 'Miniature snap-on. Used inside small WiFi/cellular modules.' },
  'mcx':  { name: 'MCX',     fmax_ghz: 6,  il_db: 0.15, return_loss_db: 20, gender: ['M','F'], notes: 'Slightly larger than MMCX, snap-on.' },
  'f':    { name: 'F-type',  fmax_ghz: 1.5, il_db: 0.20, return_loss_db: 18, gender: ['M','F'], notes: '75 Ω CATV/satellite standard, screw-on.' },
  'smb':  { name: 'SMB',     fmax_ghz: 4,  il_db: 0.20, return_loss_db: 18, gender: ['M','F'], notes: 'Snap-on miniature, 50 Ω.' },
}

// ── helpers ────────────────────────────────────────────
const num = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(d)) : v)

function searchDB(db, query) {
  const q = normaliseSearchKey(query)
  const out = []
  for (const [id, item] of Object.entries(db)) {
    const hay = normaliseSearchKey([
      id, item.name, item.alias, item.notes, item.makers, item.category_label, item.category,
      item.source_label, item.source_name, item.source_confidence,
    ].filter(Boolean).join(' '))
    if (hay.includes(q)) out.push({ id, ...item })
  }
  return out
}

function normaliseSearchKey(value) {
  return String(value || '').toLowerCase().replace(/[\s/_().-]/g, '')
}

function findRfCable(db, cableId) {
  if (!cableId) return [null, null]
  if (db[cableId]) return [cableId, db[cableId]]
  const q = normaliseSearchKey(cableId)
  const match = Object.entries(db).find(([id, cable]) => {
    return normaliseSearchKey(id) === q
      || normaliseSearchKey(cable.name) === q
      || normaliseSearchKey(cable.alias).includes(q)
  })
  return match || [null, null]
}

function materialPublic(tape) {
  return {
    part_number: tape.partNumber,
    family: tape.family,
    material: tape.material,
    thickness_mil: tape.thicknessMil,
    thickness_mm: num(tape.thicknessMm, 4),
    density_code: tape.densityCode,
    density_label: tape.densityLabel,
    density_gcc: tape.densityGcc,
    width_in: num(tape.widthIn, 4),
    width_mm: num(tape.widthMm, 3),
    variant: tape.variant || null,
  }
}

function flatwirePublic(flatwire) {
  return {
    part_number: flatwire.partNumber,
    family: flatwire.family,
    base_part: flatwire.basePart,
    material: flatwire.material,
    plating: flatwire.plating,
    plating_label: flatwire.platingLabel,
    shield_use: flatwire.shieldUse,
    spool_label: flatwire.spoolLabel,
    thickness_mil: flatwire.thicknessMil,
    thickness_mm: flatwire.thicknessMm == null ? null : num(flatwire.thicknessMm, 4),
    width_code: flatwire.widthCode,
    width_in: num(flatwire.widthIn, 5),
    width_mm: num(flatwire.widthMm, 4),
  }
}

function foilPublic(foil) {
  return {
    part_number: foil.partNumber,
    source_part_number: foil.sourcePartNumber,
    aliases: foil.aliases,
    family: foil.family,
    base_part: foil.basePart,
    material: foil.material,
    laminate: foil.laminate,
    laminate_label: foil.laminateLabel,
    thickness_mil: foil.thicknessMil,
    thickness_mm: num(foil.thicknessMm, 4),
    width_code: foil.widthCode,
    width_in: num(foil.widthIn, 5),
    width_mm: num(foil.widthMm, 4),
  }
}

function lookupMaterialLibrary(input = {}) {
  const query = String(input.query || '').trim()
  const inferredFamily = /^962-9600[14]/i.test(query) ? 'spc_flatwire'
    : /^962-96003/i.test(query) ? 'foil_tape'
      : 'ptfe_tape'
  const family = String(input.family || inferredFamily).toLowerCase()
  if (family !== 'ptfe_tape' && family !== 'spc_flatwire' && family !== 'foil_tape') {
    return {
      family,
      matches: [],
      note: 'PTFE tape, SPC flatwire, and foil tape are active right now. Braid and jacket material libraries are ready as next tabs.',
      available_families: ['ptfe_tape', 'spc_flatwire', 'foil_tape'],
    }
  }

  if (family === 'spc_flatwire') {
    const exact = findSpcFlatwireByPart(query)
    const shieldUse = String(input.shield_use || input.use || '').toLowerCase()
    const thicknessMil = Number(input.thickness_mil)
    const widthMm = Number(input.width_mm ?? (Number.isFinite(Number(input.width_in)) ? Number(input.width_in) * 25.4 : NaN))
    const q = query.toLowerCase()
    const limit = Math.min(50, Math.max(1, Math.round(Number(input.limit) || 12)))

    let matches = SPC_FLATWIRE_MATERIALS
    if (shieldUse === 'spiral' || shieldUse === 'helical') matches = matches.filter((item) => item.shieldUse === shieldUse)
    if (Number.isFinite(thicknessMil) && thicknessMil > 0) matches = matches.filter((item) => Math.abs((item.thicknessMil ?? 999) - thicknessMil) <= 0.01)
    if (Number.isFinite(widthMm) && widthMm > 0) matches = matches.filter((item) => Math.abs(item.widthMm - widthMm) <= 0.025)
    if (q && !exact) {
      matches = matches.filter((item) => [
        item.partNumber,
        item.basePart,
        item.plating,
        item.shieldUse,
        item.spoolLabel,
        `${item.thicknessMil ?? ''}mil`,
        `${item.widthIn.toFixed(4)}`,
        `${item.widthMm.toFixed(3)}mm`,
      ].join(' ').toLowerCase().includes(q))
    }

    const nearest = findNearestSpcFlatwire({
      partNumber: exact?.partNumber || query,
      shieldUse,
      thicknessMil,
      widthMm,
    })
    const outputMatches = exact ? [exact] : matches
    return {
      family: 'spc_flatwire',
      base_parts: {
        '962-96001': 'SPC spiral flatwire bobbin stock',
        '962-96004': 'SPC helical flatwire large spool stock',
      },
      count: outputMatches.length,
      nearest: nearest ? flatwirePublic(nearest) : null,
      matches: outputMatches.slice(0, limit).map(flatwirePublic),
      decoder: '962-96001-SPC-2.5-0500 = spiral flatwire, silver-plated copper, 2.5 mil thickness, 0.0050 inch width. For SPC flatwire, width code 1250 = 0.0125 inch.',
    }
  }

  if (family === 'foil_tape') {
    const exact = findFoilTapeByPart(query)
    const thicknessMil = Number(input.thickness_mil)
    const widthMm = Number(input.width_mm ?? (Number.isFinite(Number(input.width_in)) ? Number(input.width_in) * 25.4 : NaN))
    const q = query.toLowerCase()
    const limit = Math.min(50, Math.max(1, Math.round(Number(input.limit) || 12)))

    let matches = FOIL_TAPE_MATERIALS
    if (Number.isFinite(thicknessMil) && thicknessMil > 0) matches = matches.filter((item) => Math.abs(item.thicknessMil - thicknessMil) <= 0.01)
    if (Number.isFinite(widthMm) && widthMm > 0) matches = matches.filter((item) => Math.abs(item.widthMm - widthMm) <= 0.025)
    if (q && !exact) {
      matches = matches.filter((item) => [
        item.partNumber,
        item.sourcePartNumber,
        ...(item.aliases || []),
        item.laminate,
        item.laminateLabel,
        `${item.thicknessMil}mil`,
        `${item.widthIn.toFixed(4)}`,
        `${item.widthMm.toFixed(3)}mm`,
      ].join(' ').toLowerCase().includes(q))
    }

    const nearest = findNearestFoilTape({
      partNumber: exact?.partNumber || query,
      thicknessMil,
      widthMm,
    })
    const outputMatches = exact ? [exact] : matches
    return {
      family: 'foil_tape',
      base_part: '962-96003',
      count: outputMatches.length,
      nearest: nearest ? foilPublic(nearest) : null,
      matches: outputMatches.slice(0, limit).map(foilPublic),
      decoder: '962-96003-ALK-1.4-0311 = foil tape, ALK aluminum/Kapton laminate, 1.4 mil thickness, 0.0311 inch width. Legacy parts missing ALK are normalized to ALK.',
    }
  }

  const exact = findPtfeTapeByPart(input.query)
  const density = String(input.density_code || '').toUpperCase()
  const thicknessMil = Number(input.thickness_mil)
  const widthMm = Number(input.width_mm ?? (Number.isFinite(Number(input.width_in)) ? Number(input.width_in) * 25.4 : NaN))
  const maxMil = Number(input.max_thickness_mil)
  const q = String(input.query || '').trim().toLowerCase()
  const limit = Math.min(50, Math.max(1, Math.round(Number(input.limit) || 12)))

  let matches = PTFE_TAPE_MATERIALS
  if (density === 'H' || density === 'L') matches = matches.filter((item) => item.densityCode === density)
  if (Number.isFinite(thicknessMil) && thicknessMil > 0) matches = matches.filter((item) => Math.abs(item.thicknessMil - thicknessMil) <= 0.01)
  if (Number.isFinite(widthMm) && widthMm > 0) matches = matches.filter((item) => Math.abs(item.widthMm - widthMm) <= 0.35)
  if (Number.isFinite(maxMil) && maxMil > 0) matches = matches.filter((item) => item.thicknessMil <= maxMil)
  if (q && !exact) {
    matches = matches.filter((item) => [
      item.partNumber,
      item.densityCode,
      item.densityLabel,
      `${item.thicknessMil}mil`,
      `${item.widthIn}`,
      `${item.widthMm.toFixed(2)}mm`,
    ].join(' ').toLowerCase().includes(q))
  }

  const nearest = findNearestPtfeTape({
    partNumber: exact?.partNumber || input.query,
    densityCode: density,
    thicknessMil,
    widthMm,
    maxThicknessMil: maxMil,
  })

  const outputMatches = exact ? [exact] : matches
  return {
    family: 'ptfe_tape',
    base_part: '962-96000',
    count: outputMatches.length,
    nearest: nearest ? materialPublic(nearest) : null,
    matches: outputMatches.slice(0, limit).map(materialPublic),
    decoder: '962-96000-05L0750 = PTFE family, 05 mil, L low density (H = high density), 0750 = 0.750 inch tape width.',
  }
}

function interpAtten(table, freq_mhz) {
  const tbl = Object.entries(table).map(([f, db]) => [parseFloat(f), db]).sort((a, b) => a[0] - b[0])
  const fLo = tbl[0][0], fHi = tbl[tbl.length - 1][0]
  if (freq_mhz <= fLo) return tbl[0][1] * Math.sqrt(freq_mhz / fLo)
  if (freq_mhz >= fHi) return tbl[tbl.length - 1][1] * Math.sqrt(freq_mhz / fHi)
  for (let i = 0; i < tbl.length - 1; i++) {
    const [f1, a1] = tbl[i]; const [f2, a2] = tbl[i + 1]
    if (freq_mhz >= f1 && freq_mhz <= f2) {
      const t = (Math.sqrt(freq_mhz) - Math.sqrt(f1)) / (Math.sqrt(f2) - Math.sqrt(f1))
      return a1 + t * (a2 - a1)
    }
  }
  return tbl[tbl.length - 1][1]
}

// ── tool list ──────────────────────────────────────────
export const RF_TOOLS = [
  ...HIGGSFIELD_TOOLS,
  {
    name: 'lookup_rf_cable',
    description:
      'Search the on-board RF cable database (RG, LMR, Heliax, semi-rigid). Returns Z₀, VF, OD, max frequency, and an attenuation table. Use for any "what are the specs of X cable" question.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Cable name or family (e.g., "RG-58", "LMR", "Heliax")' } },
      required: ['query'],
    },
  },
  {
    name: 'lookup_connector',
    description:
      'Search the on-board RF connector database (N, SMA, BNC, TNC, etc.). Returns max frequency, IL, return loss, gender options.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Connector type or query (e.g., "N", "SMA", "BNC")' } },
      required: ['query'],
    },
  },
  {
    name: 'lookup_material_library',
    description:
      'Search the factory material library. Includes 962-96000 PTFE tape, 962-96003 ALK foil tape, and SPC flatwire shield stock: 962-96001 for spiral bobbins, 962-96004 for helical large spools. Use before recommending PTFE/foil/SPC material or decoding parts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part number or search text, e.g. 962-96000-05L0750, 05L, 0.750, low density.' },
        family: { type: 'string', description: 'Material family: ptfe_tape, foil_tape, or spc_flatwire.' },
        density_code: { type: 'string', description: 'H or L.' },
        shield_use: { type: 'string', description: 'For SPC flatwire: spiral or helical.' },
        thickness_mil: { type: 'number', description: 'Desired tape thickness in mil.' },
        width_in: { type: 'number', description: 'Desired tape width in inches.' },
        width_mm: { type: 'number', description: 'Desired tape width in millimetres.' },
        max_thickness_mil: { type: 'number', description: 'Optional maximum thickness in mil.' },
        limit: { type: 'number', description: 'Max rows to return. Default 12.' },
      },
      required: [],
    },
  },
  {
    name: 'generate_blank_mi_template',
    description:
      'Generate the shop MI workbook from the MI-ST962-032-130 .xlsx template. Use when the engineer asks for a blank MI/template before filling process values. The workbook keeps the real cover, Taping (3-Bay), conditioning, spiral shield, SI, braid, extrusion, marking, and packaging sheets.',
    input_schema: {
      type: 'object',
      properties: {
        mi_number: { type: 'string', description: 'Optional MI number/title, e.g. MI-ST962-032-200.' },
        part_number: { type: 'string', description: 'Optional finished cable part number.' },
        by: { type: 'string', description: 'Prepared-by initials.' },
        date: { type: 'string', description: 'Date to put in the workbook. Default today.' },
      },
      required: [],
    },
  },
  {
    name: 'compute_attenuation',
    description:
      'Compute insertion loss (dB) over a given length at a given frequency for a known RF cable. Uses the cable\'s published table with √f scaling between datapoints.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id from the database (use lookup_rf_cable if unsure).' },
        freq_mhz: { type: 'number', description: 'Frequency in MHz' },
        length_ft: { type: 'number', description: 'Cable length in feet' },
      },
      required: ['cable_id', 'freq_mhz', 'length_ft'],
    },
  },
  {
    name: 'link_budget',
    description:
      'Build a full link budget: TX power → cable IL → connectors → free-space path loss → cable IL → RX. Returns received power, link margin vs RX sensitivity, and a per-stage breakdown. Use for any "will this radio reach X meters" question.',
    input_schema: {
      type: 'object',
      properties: {
        tx_dbm: { type: 'number', description: 'Transmit power in dBm' },
        rx_sensitivity_dbm: { type: 'number', description: 'Receiver sensitivity in dBm (negative number)' },
        freq_mhz: { type: 'number', description: 'Operating frequency in MHz' },
        distance_m: { type: 'number', description: 'Distance between TX and RX antennas, in meters. Set 0 for wired link.' },
        tx_antenna_gain_dbi: { type: 'number', description: 'TX antenna gain in dBi (default 0 = isotropic)' },
        rx_antenna_gain_dbi: { type: 'number', description: 'RX antenna gain in dBi (default 0 = isotropic)' },
        tx_cable_id: { type: 'string', description: 'TX-side cable id (optional)' },
        tx_cable_ft: { type: 'number', description: 'TX-side cable length in feet (optional)' },
        rx_cable_id: { type: 'string', description: 'RX-side cable id (optional)' },
        rx_cable_ft: { type: 'number', description: 'RX-side cable length in feet (optional)' },
        connector_count: { type: 'number', description: 'Total number of connectors in the chain (default 4)' },
        connector_il_db: { type: 'number', description: 'Per-connector IL (default 0.15 dB)' },
      },
      required: ['tx_dbm', 'rx_sensitivity_dbm', 'freq_mhz'],
    },
  },
  {
    name: 'free_space_path_loss',
    description:
      'Compute free-space path loss (FSPL) given frequency and distance. Formula: FSPL_dB = 32.45 + 20·log₁₀(f_MHz) + 20·log₁₀(d_km).',
    input_schema: {
      type: 'object',
      properties: {
        freq_mhz: { type: 'number', description: 'Frequency in MHz' },
        distance_m: { type: 'number', description: 'Distance in meters' },
      },
      required: ['freq_mhz', 'distance_m'],
    },
  },
  {
    name: 'noise_figure_cascade',
    description:
      'Compute cascaded noise figure (Friis formula) for a chain of stages. NF_total = NF1 + (NF2-1)/G1 + (NF3-1)/(G1·G2) + ... All in linear ratios; convert from dB internally.',
    input_schema: {
      type: 'object',
      properties: {
        stages: {
          type: 'array',
          description: 'Ordered array of stages, each with NF (dB) and Gain (dB).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Stage label (e.g., "LNA", "filter", "mixer")' },
              nf_db: { type: 'number', description: 'Noise figure in dB' },
              gain_db: { type: 'number', description: 'Gain in dB (use negative for losses, e.g., a filter at -1 dB)' },
            },
            required: ['nf_db', 'gain_db'],
          },
        },
      },
      required: ['stages'],
    },
  },
  {
    name: 'vswr_to_rl',
    description:
      'Convert between VSWR, return loss (dB), and reflection coefficient |ρ|. Provide any one and you get the other two.',
    input_schema: {
      type: 'object',
      properties: {
        vswr: { type: 'number', description: 'VSWR (≥ 1)' },
        return_loss_db: { type: 'number', description: 'Return loss in dB (positive)' },
        rho: { type: 'number', description: 'Reflection coefficient magnitude (0–1)' },
      },
    },
  },
  {
    name: 'add_cable',
    description:
      'Save a new cable spec to the user\'s LOCAL library (browser localStorage). Survives close/reopen on this device. Use when the user gives you a datasheet or spec for a cable that\'s not in the built-in DB and asks you to remember it. Use a clear id (e.g. "rg-9", "company-spec-cable-A"). Required fields: id, name, z0; recommended: vf, od_mm, atten_db_per_100ft (object: { freq_mhz: dB }).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique slug identifier (e.g., "rg-9"). Lowercased automatically.' },
        name: { type: 'string', description: 'Display name (e.g., "RG-9/U")' },
        z0: { type: 'number', description: 'Characteristic impedance in Ω (typical 50 or 75)' },
        vf: { type: 'number', description: 'Velocity factor as fraction (e.g., 0.66 for solid PE)' },
        od_mm: { type: 'number', description: 'Cable outer diameter in mm' },
        fmax_ghz: { type: 'number', description: 'Maximum operating frequency in GHz' },
        atten_db_per_100ft: {
          type: 'object',
          description: 'Object mapping frequency (MHz) to attenuation (dB/100ft). Example: { "100": 4.4, "1000": 16.0 }',
          additionalProperties: { type: 'number' },
        },
        notes: { type: 'string', description: 'Free-form construction / application notes' },
        datasheet: { type: 'string', description: 'Optional URL to the manufacturer datasheet PDF or product page.' },
      },
      required: ['id', 'name', 'z0'],
    },
  },
  {
    name: 'list_custom_cables',
    description: 'List all user-added (local) RF cables saved on this device. Use when the user asks "what custom cables do I have?" or wants to review their additions.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_cable',
    description: 'Remove a previously-saved custom cable from the local library. Cannot delete built-in cables.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Cable id to delete' } },
      required: ['id'],
    },
  },
  {
    name: 'compare_cables',
    description:
      'Compare 2–4 cables side-by-side at a target frequency and length. Returns a per-cable row with Z₀, VF, OD, IL_dB at the freq, total IL over the length, and a delta vs the first cable. Use whenever the user asks "compare X vs Y" or "which is better at Z GHz".',
    input_schema: {
      type: 'object',
      properties: {
        cable_ids: { type: 'array', items: { type: 'string' }, description: 'Cable ids (use lookup_rf_cable to find them). 2–4 entries.' },
        freq_mhz: { type: 'number', description: 'Frequency for IL comparison (MHz)' },
        length_ft: { type: 'number', description: 'Length for total IL (ft)' },
      },
      required: ['cable_ids', 'freq_mhz', 'length_ft'],
    },
  },
  {
    name: 'cable_selector',
    description:
      'Rank cables in the database against requirements. Given target Z₀, frequency, length, max acceptable IL, and optional environment, returns the top candidates ranked by how well they satisfy the constraints. Use when the user asks "what cable should I use for…".',
    input_schema: {
      type: 'object',
      properties: {
        z0: { type: 'number', description: 'Target characteristic impedance (50 or 75)' },
        freq_mhz: { type: 'number', description: 'Operating frequency in MHz' },
        length_ft: { type: 'number', description: 'Cable length in feet' },
        max_il_db: { type: 'number', description: 'Maximum acceptable insertion loss in dB (optional)' },
        prefer_low_loss: { type: 'boolean', description: 'If true, weight by IL more heavily than OD/cost' },
      },
      required: ['z0', 'freq_mhz', 'length_ft'],
    },
  },
  {
    name: 'alternatives_finder',
    description:
      'Given a reference cable, return alternatives in the database with similar specs (same Z₀, comparable IL within tolerance) sorted by similarity. Use when the user asks "what else is like LMR-400" or "cheaper alternative to RG-213".',
    input_schema: {
      type: 'object',
      properties: {
        reference_id: { type: 'string', description: 'Reference cable id (use lookup_rf_cable to find)' },
        freq_mhz: { type: 'number', description: 'Frequency to evaluate IL similarity at (MHz). Default 1000.' },
        max_il_delta_db_per_100ft: { type: 'number', description: 'Max acceptable IL difference (dB/100ft). Default 1.5.' },
      },
      required: ['reference_id'],
    },
  },
  {
    name: 'coax_per_unit_length',
    description:
      'Compute distributed transmission-line parameters of a coaxial geometry: Z₀, capacitance C (pF/m), inductance L (nH/m), velocity factor VF, and propagation delay (ns/m). Use when the user wants line constants for circuit-level simulation or transmission-line equivalent models.',
    input_schema: {
      type: 'object',
      properties: {
        D_mm: { type: 'number', description: 'Dielectric outer diameter (mm)' },
        d_mm: { type: 'number', description: 'Inner conductor diameter (mm)' },
        er: { type: 'number', description: 'Relative permittivity εr' },
      },
      required: ['D_mm', 'd_mm', 'er'],
    },
  },
  {
    name: 'dc_resistance',
    description:
      'Compute the DC resistance of a wire (Ω total) given AWG, conductor material, and length. Round-trip = 2× this for a coax inner conductor + braid pair.',
    input_schema: {
      type: 'object',
      properties: {
        awg: { type: 'number', description: 'AWG of the conductor' },
        material: { type: 'string', description: 'One of: copper, silver, aluminum, tin_plated_cu, silver_plated_cu, nickel_plated_cu' },
        length_m: { type: 'number', description: 'Length in meters' },
        strand_count: { type: 'number', description: 'Number of strands in parallel (default 1)' },
      },
      required: ['awg', 'material', 'length_m'],
    },
  },
  {
    name: 'skin_depth',
    description:
      'Skin depth δ = √(2/(ω·μ·σ)) — depth at which RF current density drops to 1/e. Use to size conductor thickness; a few skin depths is enough for full conduction.',
    input_schema: {
      type: 'object',
      properties: {
        freq_mhz: { type: 'number', description: 'Frequency in MHz' },
        material: { type: 'string', description: 'Conductor material id (copper, silver, aluminum, …)' },
      },
      required: ['freq_mhz', 'material'],
    },
  },
  {
    name: 'reflection_from_z_step',
    description:
      'Compute reflection coefficient ρ, VSWR, and return loss from a Z₀ discontinuity (Z1 → Z2). Use to interpret TDR steps or estimate connector mismatch.',
    input_schema: {
      type: 'object',
      properties: {
        z1: { type: 'number', description: 'Source-side impedance (Ω)' },
        z2: { type: 'number', description: 'Load-side impedance (Ω)' },
      },
      required: ['z1', 'z2'],
    },
  },
  {
    name: 'microstrip_impedance',
    description:
      'Characteristic impedance of a microstrip trace (PCB on top of ground plane). Wheeler/IPC-2141 closed-form formulas. Use for designing PCB-mount RF transitions.',
    input_schema: {
      type: 'object',
      properties: {
        w_mm: { type: 'number', description: 'Trace width in mm' },
        h_mm: { type: 'number', description: 'Substrate height in mm' },
        t_mm: { type: 'number', description: 'Trace thickness in mm (e.g., 1 oz Cu = 0.035 mm)' },
        er: { type: 'number', description: 'Substrate relative permittivity (e.g., FR-4 ≈ 4.4, Rogers RO4350B ≈ 3.66)' },
      },
      required: ['w_mm', 'h_mm', 'er'],
    },
  },
  {
    name: 'stripline_impedance',
    description:
      'Characteristic impedance of a stripline trace (PCB embedded between two ground planes). IPC-2141 closed-form formula. Use for shielded inner-layer RF lines.',
    input_schema: {
      type: 'object',
      properties: {
        w_mm: { type: 'number', description: 'Trace width in mm' },
        b_mm: { type: 'number', description: 'Total dielectric thickness between planes (mm)' },
        t_mm: { type: 'number', description: 'Trace thickness (mm)' },
        er: { type: 'number', description: 'Dielectric εr' },
      },
      required: ['w_mm', 'b_mm', 'er'],
    },
  },
  {
    name: 'power_handling',
    description:
      'Estimate maximum CW power handling of a cable at a given frequency and ambient temperature. Uses cable IL × thermal-resistance approximation. Returns derated Pmax in W and the limiting mechanism (thermal vs voltage breakdown).',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id (use lookup_rf_cable)' },
        freq_mhz: { type: 'number', description: 'Operating frequency in MHz' },
        ambient_c: { type: 'number', description: 'Ambient temperature in °C (default 25)' },
        vswr: { type: 'number', description: 'Worst-case VSWR (1.0 = perfect match). Higher VSWR derates Pmax.' },
      },
      required: ['cable_id', 'freq_mhz'],
    },
  },
  {
    name: 'standard_lookup',
    description:
      'Look up information about an RF / cable standard (TIA-568.2-D, IEEE 802.3bq, SCTE 51, MIL-STD-1553B, IEC 61156, USB4, ECSS-50-12C). Returns scope, key clauses, and typical numerical limits where applicable.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Standard id (e.g., "tia-568.2-d", "ieee-802.3bq", "mil-std-1553b")' } },
      required: ['id'],
    },
  },
  {
    name: 'material_props',
    description:
      'Look up physical properties of a common RF cable material — εr, conductivity, density, max temp, loss tangent. Conductors and dielectrics both supported.',
    input_schema: {
      type: 'object',
      properties: { material: { type: 'string', description: 'Material id (copper, silver, ptfe, pe_solid, pe_foamed, fep, pfa, eptfe, pvc, air, …)' } },
      required: ['material'],
    },
  },
  {
    name: 'generate_touchstone',
    description:
      'Synthesize a Touchstone .s1p file for a given cable and length, including round-trip cable loss and an open termination at the far end. Useful as a sanity-check input to the VNA Lab tab. Returns the file content as a string the user can copy or save.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id (use lookup_rf_cable)' },
        length_ft: { type: 'number', description: 'Length in feet' },
        f_min_mhz: { type: 'number', description: 'Start frequency (MHz). Default 1.' },
        f_max_mhz: { type: 'number', description: 'Stop frequency (MHz). Default 3000.' },
        n_points: { type: 'number', description: 'Number of frequency points. Default 1601.' },
        defects: {
          type: 'array',
          description: 'Optional in-cable defect list. Each: { at_ft: number, rho: number }.',
          items: { type: 'object', properties: { at_ft: { type: 'number' }, rho: { type: 'number' } } },
        },
      },
      required: ['cable_id', 'length_ft'],
    },
  },
  {
    name: 'mismatch_loss',
    description:
      'Compute mismatch loss (dB) given two VSWRs (source and load) or directly the reflection coefficient.',
    input_schema: {
      type: 'object',
      properties: {
        vswr_a: { type: 'number', description: 'VSWR of port A (e.g., source)' },
        vswr_b: { type: 'number', description: 'VSWR of port B (e.g., load)' },
        rho: { type: 'number', description: 'Reflection coefficient magnitude (use this if you already have ρ)' },
      },
    },
  },
  {
    name: 'whatif_panel',
    description:
      'Render an interactive "what-if" panel inline in the chat with up to 4 sliders the engineer can drag to see live re-computation of a target quantity (Z₀, IL, link margin, etc.). The formula is JS-style. Use for exploratory questions: "how does FSPL change vs distance and freq", "Z₀ vs εᵣ sweep".',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        sliders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, label: { type: 'string' },
              min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
              value: { type: 'number' }, unit: { type: 'string' },
            },
            required: ['name', 'label', 'min', 'max', 'step', 'value'],
          },
        },
        outputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, formula: { type: 'string' }, unit: { type: 'string' }, decimals: { type: 'number' } },
            required: ['label', 'formula'],
          },
        },
        annotation: { type: 'string' },
      },
      required: ['title', 'sliders', 'outputs'],
    },
  },
  {
    name: 'generate_diagram',
    description:
      'Render an inline SVG diagram in the chat. Useful for visualising RF concepts the engineer asks about. Supported kinds: smith_chart (with optional impedance points), atten_curve (atten dB vs MHz), cross_section (concentric layers), eye_diagram (synthetic), z_step_chart (TDR Z vs distance), bargraph (categorical comparisons). Returns a tool result with `_inline_svg` so the chat renders the picture inline.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'smith_chart | atten_curve | cross_section | eye_diagram | z_step_chart | bargraph' },
        title: { type: 'string', description: 'Caption shown above the diagram' },
        impedances:    { type: 'array', description: 'For smith_chart: array of { real, imag, label } points (Z normalised to 50 Ω).' },
        atten_table:   { type: 'object', description: 'For atten_curve: { freq_MHz: dB_per_100ft } map.' },
        layers:        { type: 'array', description: 'For cross_section: array of { name, color, t_mm } from inner to outer.' },
        bars:          { type: 'array', description: 'For bargraph: array of { label, value, unit, color }.' },
        z_trace:       { type: 'array', description: 'For z_step_chart: array of { x_m, z_ohm } pairs.' },
        bit_rate_gbps: { type: 'number', description: 'For eye_diagram: bit rate in Gbps' },
        eye_jitter_ps: { type: 'number', description: 'For eye_diagram: total jitter peak-peak in ps' },
        annotation:    { type: 'string', description: 'One-line annotation under the diagram' },
      },
      required: ['kind', 'title'],
    },
  },
  {
    name: 'get_company_defaults',
    description:
      "Read the engineer's persistent company-wide defaults stored on this device. Includes copper / SPC / FEP price per kg, preferred jacket / conductor / dielectric materials, max line speed and anneal temp, default tolerances, and free-form company name + notes. Call this BEFORE quoting cost or recommending materials so your answer matches the engineer's company.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_company_defaults',
    description:
      'Write/merge company-wide defaults to local storage. Only the keys you pass are updated; omit a key to leave it alone. Use when the engineer says "remember Cu is $X/kg here" or "we always use FEP" — capture once, reuse forever.',
    input_schema: {
      type: 'object',
      properties: {
        cu_price_usd_kg:        { type: 'number', description: 'Copper rod price USD per kg' },
        spc_price_usd_kg:       { type: 'number', description: 'Silver-plated copper price USD per kg' },
        fep_price_usd_kg:       { type: 'number', description: 'FEP pellet price USD per kg' },
        preferred_jacket:       { type: 'string', description: 'pvc | lszh | tpu | pur | fep_jkt' },
        preferred_conductor:    { type: 'string', description: 'cu | spc | tc | npc' },
        preferred_dielectric:   { type: 'string', description: 'pe_solid | pe_foamed | ptfe | fep | fep_foamed | pfa | eptfe' },
        max_line_speed_m_min:   { type: 'number', description: 'Plant ceiling for extruder line speed (m/min)' },
        max_anneal_c:           { type: 'number', description: 'Plant ceiling for conductor annealing temperature (°C)' },
        z0_tol_pct:             { type: 'number', description: 'Default Z₀ tolerance window (%)' },
        od_tol_mm:              { type: 'number', description: 'Default outer-diameter tolerance (mm)' },
        company_name:           { type: 'string', description: 'Company / brand name' },
        factory_location:       { type: 'string', description: 'Factory location (city / country)' },
        notes:                  { type: 'string', description: 'Free-form notes the agent should remember about this site' },
      },
    },
  },
  {
    name: 'get_shop_memory',
    description:
      'Read approved and pending shop-process rules stored on this device. Call this before applying learned in-house process rules, especially for MI, PTFE taping, spiral shields, WTM settings, or material-selection questions.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_shop_rule',
    description:
      'Create a pending shop rule from an engineer correction or explicit "learn/remember this" instruction. This does NOT activate the rule; the engineer must approve it in Shop Memory before it affects future answers. Use for process rules, machine limits, MI layout mappings, preferred wrap/tension/pitch practices, and never/always shop constraints.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short label, e.g. "WTM minimum taping pitch".' },
        rule: { type: 'string', description: 'The exact reusable rule in plain language.' },
        category: { type: 'string', description: 'process | ptfe_taping | wtm_taping | mi_export | spc_spiral | material_selection | qc' },
        applies_to: { type: 'array', items: { type: 'string' }, description: 'Tags such as ptfe, mi, taping, spiral, wtm.' },
        reason: { type: 'string', description: 'Why the rule matters or what correction caused it.' },
        source_message: { type: 'string', description: 'Short quote or paraphrase of the engineer correction.' },
        confidence: { type: 'number', description: '0..1 confidence that this should become a reusable shop rule.' },
      },
      required: ['title', 'rule'],
    },
  },
  {
    name: 'parse_actual_test_report',
    description:
      'Normalize actual VNA/MI/test report values into RF Stack Lab measured-test fields. Use this after reading a screenshot/image or pasted OCR text of a test report. Extract Av. Z0, VP, final/outgoing OD, suckout/notch GHz, insertion loss, return loss/S11, VSWR, and capacitance pF/ft; the result exposes an Apply button that fills the Measured Test Correlator.',
    input_schema: {
      type: 'object',
      properties: {
        raw_text: { type: 'string', description: 'OCR or manually transcribed text from the report/image.' },
        cable_id: { type: 'string', description: 'MI/cable id if visible, e.g. MI-ST962-032-200.' },
        measured_z0_ohm: { type: 'number', description: 'Measured average impedance in ohms.' },
        measured_vp_pct: { type: 'number', description: 'Measured velocity percent, e.g. 78.5.' },
        suckout_ghz: { type: 'number', description: 'Measured suckout/notch/dip frequency in GHz.' },
        final_od_in: { type: 'number', description: 'Measured final or outgoing OD in inches.' },
        insertion_loss_db: { type: 'number', description: 'Measured insertion loss/attenuation at a stated frequency.' },
        return_loss_db: { type: 'number', description: 'Measured return loss/S11 in dB.' },
        vswr: { type: 'number', description: 'Measured VSWR.' },
        capacitance_pf_ft: { type: 'number', description: 'Measured capacitance in pF/ft.' },
        notes: { type: 'string', description: 'Any visible handwritten notes, operator/date, or uncertainty.' },
      },
    },
  },
  {
    name: 'design_dielectric_stack',
    description:
      'Design a PTFE tape dielectric stack for a coaxial RF cable to hit a target VP and/or Z₀. Picks tape densities (high-density 1.6 g/cm³ and/or low-density 0.7 g/cm³), tape thickness, overlap, and number of WTM passes. Default PTFE wrap is 2/3 to reduce shrink-back; use 1/2 only when the target OD needs the lower single-pass build. WTM taping pitch is OD-based and calibrated from MI-ST962-032-130 / 032-200, then clamped to the 0.0390 in/rev minimum. Returns a complete layer recipe + predicted final OD/εᵣ_eff/VP/Z₀ + a one-click apply preset that fills the RF Stack Lab tab + a filled shop MI .xlsx based on MI-ST962-032-130, with tape part numbers, OD after tape, pitch set-point, and tension filled into the Taping (3-Bay) sheets. Use this whenever the engineer asks "build me a cable with conductor X and target VP/Z₀". Manufacturing rule: when conductor_od ≤ 0.091" (2.311 mm), tape thickness is auto-clamped to ≤ 10 mil (0.254 mm) — thicker tape wrinkles on tight radii. The clamp is reported in the notes array.',
    input_schema: {
      type: 'object',
      properties: {
        conductor_od_mm:   { type: 'number', description: 'Inner conductor OD in millimetres. Provide either this or conductor_od_inch.' },
        conductor_od_inch: { type: 'number', description: 'Inner conductor OD in inches. Will be converted to mm. Common RF inner-conductor sizes: 0.020 / 0.032 / 0.045 / 0.057 inch.' },
        target_vp:         { type: 'number', description: 'Target velocity factor as a fraction (0.65 .. 0.92). e.g. 0.80 for 80% VP. Optional if target_z0_ohm is given.' },
        target_z0_ohm:     { type: 'number', description: 'Target characteristic impedance in ohms (typically 50, 75, 100). Optional if only sizing for VP.' },
        tape_part_number:  { type: 'string', description: 'Optional PTFE tape part number from Material Library, e.g. 962-96000-05L0750.' },
        tape_thickness_mm: { type: 'number', description: 'Nominal tape thickness in mm. Default 0.10 mm (typical PTFE skived tape).' },
        tape_width_mm:     { type: 'number', description: 'Tape width in mm. Default 0.635 mm (0.0250 inch).' },
        overlap:           { type: 'string', description: 'PTFE wrap mode: "1/2" / "2/3" / "3/4". Default is 2/3 shop preference to reduce shrink-back; use 1/2 only to hit a lower target OD. Valid settings are 50%, 66.7%, and 75%.' },
        tension_factor:    { type: 'number', description: 'WTM tension factor τ (0.7..1.0). Lower = tighter wrap, more compression. Default 0.92.' },
        tension_n:         { type: 'number', description: 'WTM tape tension in newtons for the MI sheet. Default 4.0 N.' },
        line_speed_ft_min:  { type: 'number', description: 'Line speed for the MI sheet. Default 7 ft/min.' },
        mi_number:         { type: 'string', description: 'Optional MI number/title for the Excel download.' },
        finished_part_number:{ type: 'string', description: 'Optional finished cable part number for the MI workbook.' },
        prepared_by:       { type: 'string', description: 'Prepared-by initials for the MI workbook.' },
        mi_date:           { type: 'string', description: 'Date to put in the MI workbook. Default today.' },
        prefer:            { type: 'string', description: '"hd" (all 1.6 g/cm³), "ld" (all 0.7 g/cm³), or "mix" (HD inside + LD outside). Default "mix".' },
      },
      required: [],
    },
  },
  {
    name: 'optimize_dielectric_stack',
    description:
      'Brute-force optimize a PTFE dielectric recipe against target Z0, VP, and optional dielectric OD before generating/applying an MI. Scans stocked 962-96000 PTFE tape widths/thicknesses, standard 1/2 / 2/3 / 3/4 wraps, HD/LD pass mixes, and tension factors, then returns ranked candidates validated by the same RF Stack Lab math. Use this before design_dielectric_stack when impedance or dielectric OD must land close.',
    input_schema: {
      type: 'object',
      properties: {
        conductor_od_mm: { type: 'number', description: 'Inner conductor OD in millimetres. Provide this or conductor_od_inch.' },
        conductor_od_inch: { type: 'number', description: 'Inner conductor OD in inches.' },
        target_z0_ohm: { type: 'number', description: 'Target characteristic impedance in ohms.' },
        target_vp: { type: 'number', description: 'Target velocity factor as fraction, e.g. 0.83.' },
        target_dielectric_od_mm: { type: 'number', description: 'Optional target dielectric OD in millimetres.' },
        target_dielectric_od_inch: { type: 'number', description: 'Optional target dielectric OD in inches.' },
        tape_part_number: { type: 'string', description: 'Optional PTFE tape part number to restrict the search.' },
        tape_thickness_mm: { type: 'number', description: 'Optional requested tape thickness to bias the search.' },
        tape_width_mm: { type: 'number', description: 'Optional requested tape width to bias the search.' },
        allowed_wraps: { type: 'array', items: { type: 'string' }, description: 'Optional wrap list, e.g. ["2/3","1/2"]. Defaults to 2/3, 1/2, 3/4.' },
        overlap: { type: 'string', description: 'Optional single wrap mode: 1/2, 2/3, or 3/4.' },
        tension_factor: { type: 'number', description: 'Optional fixed tension factor. If omitted the optimizer scans practical values.' },
        prefer: { type: 'string', description: '"mix" (default), "hd", or "ld".' },
        max_candidates: { type: 'number', description: 'Number of ranked candidates to return. Default 5.' },
      },
      required: [],
    },
  },
  {
    name: 'validate_recipe_against_rf_stack',
    description:
      'Validate a proposed PTFE tape recipe using the exact RF Stack Lab dielectric math before showing Apply. Returns final dielectric OD, effective epsilon, VP, Z0, OD after each layer, pitch set-points, and a preflight pass/fail. If preflight passes, this tool provides the one-click Apply preset; if it fails, Apply is held.',
    input_schema: {
      type: 'object',
      properties: {
        conductor_od_mm: { type: 'number', description: 'Inner conductor OD in millimetres. Provide this or conductor_od_inch.' },
        conductor_od_inch: { type: 'number', description: 'Inner conductor OD in inches.' },
        target_z0_ohm: { type: 'number', description: 'Target characteristic impedance in ohms.' },
        target_vp: { type: 'number', description: 'Target velocity factor as fraction.' },
        target_dielectric_od_mm: { type: 'number', description: 'Optional target dielectric OD in millimetres.' },
        target_dielectric_od_inch: { type: 'number', description: 'Optional target dielectric OD in inches.' },
        layers: {
          type: 'array',
          description: 'PTFE recipe layers, each with part_number or tape_thickness_mm/tape_width_mm, density/density_code, overlap, passes, and optional tension_factor.',
          items: { type: 'object' },
        },
        use_od_after_overrides: { type: 'boolean', description: 'Use provided OD_after_mm values as measured overrides. Default false for independent validation.' },
      },
      required: ['layers'],
    },
  },
  {
    name: 'design_shield_stack',
    description:
      'Design the RF shield stack after the dielectric OD is known. Use when the engineer says to add shields such as "first shield SPC spiral with 10% gap, second shield foil or flatwire helical, then braid". Calculates SPC spiral width from dielectric OD × pi / 8 bobbins minus the requested gap, snaps spiral/foil/helical materials to the Material Library, estimates OD after each shield, and proposes braid carriers/ends/picks/gauge/coverage. Returns a one-click apply preset that fills the RF Stack Lab shield layers.',
    input_schema: {
      type: 'object',
      properties: {
        dielectric_od_mm: { type: 'number', description: 'OD after dielectric/PTFE in millimetres. Provide this or dielectric_od_inch.' },
        dielectric_od_inch: { type: 'number', description: 'OD after dielectric/PTFE in inches. Converted to mm.' },
        shield_layers: {
          type: 'array',
          description: 'Optional ordered shield list. Each item type may be spiral, foil, helical/flatwire, braid, or jacket. If omitted, defaults to spiral + foil + braid.',
          items: { type: 'object' },
        },
        first_shield: { type: 'string', description: 'Default first layer when shield_layers is omitted. Usually spiral.' },
        second_shield: { type: 'string', description: 'Default second layer when shield_layers is omitted: foil, helical, flatwire, or none. Default foil.' },
        include_braid: { type: 'boolean', description: 'Whether to add braid after first/second shield. Default true.' },
        spiral_gap_pct: { type: 'number', description: 'Open gap between each of the 8 spiral flatwires. Shop default 10%.' },
        spiral_bobbins: { type: 'number', description: 'Number of spiral bobbins. Shop default 8.' },
        spiral_part_number: { type: 'string', description: 'Optional 962-96001 SPC spiral part number override.' },
        helical_part_number: { type: 'string', description: 'Optional 962-96004 SPC helical flatwire part number override.' },
        foil_part_number: { type: 'string', description: 'Optional 962-96003 ALK foil tape part number override.' },
        foil_overlap_pct: { type: 'number', description: 'Foil overlap percent. Default 25%.' },
        helical_overlap_pct: { type: 'number', description: 'Flatwire helical overlap percent. Default 45%.' },
        braid_coverage_pct: { type: 'number', description: 'Target optical braid coverage percent. Default 92%.' },
        braid_wire_awg: { type: 'number', description: 'Optional braid wire AWG. If omitted, selected from OD.' },
        braid_carriers: { type: 'number', description: 'Optional total braid carriers. If omitted, selected automatically.' },
        braid_ends_per_carrier: { type: 'number', description: 'Optional ends per carrier. If omitted, selected automatically.' },
        braid_angle_deg: { type: 'number', description: 'Nominal braid angle from cable axis. Default 45 degrees.' },
        freq_mhz: { type: 'number', description: 'Frequency used for rough shielding effectiveness estimate. Default 1000 MHz.' },
        jacket_od_mm: { type: 'number', description: 'Optional jacket OD. If provided, a jacket layer is included.' },
      },
      required: [],
    },
  },
  {
    name: 'compute_tape_notches',
    description:
      'Predict Bragg suckout (notch) frequencies caused by a tape-wrapped dielectric. Uses f_n = n · c · VP / (2 · P) where P is the OD-based WTM pitch set-point calibrated from shop MI data and clamped to the 0.0390 in/rev taping-head minimum. When multiple layers are stacked at the same pitch, the notch deepens; different pitches produce separate notches. Pass the existing layer stack to forecast which frequencies to watch on the VNA.',
    input_schema: {
      type: 'object',
      properties: {
        vp:         { type: 'number', description: 'Effective velocity factor of the cable (0..1). Use the VP predicted from the dielectric stack.' },
        layers:     { type: 'array',  description: 'Array of {tape_width_mm, overlap, OD_before_mm?, density_code?} (overlap = "butt"/"1/2"/"2/3"/"3/4" or numeric fraction 0..0.95).' },
        max_freq_ghz: { type: 'number', description: 'Highest frequency to scan (default 40 GHz).' },
        n_harmonics:  { type: 'number', description: 'Number of Bragg harmonics per pitch to report (default 3).' },
      },
      required: ['vp', 'layers'],
    },
  },
  {
    name: 'connector_launch_analyzer',
    description:
      'Analyze an RF connector launch from cable Z0 into pin / dielectric / ferrule geometry. Returns launch impedance, equivalent local Z-step, estimated return loss, VSWR, and practical fixes. Use for SMA/N/2.92/1.85 style launch prep, pin diameter changes, ferrule steps, or bad connector-launch troubleshooting.',
    input_schema: {
      type: 'object',
      properties: {
        connector_id:          { type: 'string', description: 'Optional connector id from lookup_connector, e.g. sma, n, bnc, 7-16.' },
        cable_z0_ohm:          { type: 'number', description: 'Cable characteristic impedance in ohms. Default 50.' },
        pin_diameter_mm:       { type: 'number', description: 'Center pin OD in the launch region.' },
        dielectric_diameter_mm:{ type: 'number', description: 'Inner diameter of grounded outer / dielectric OD around the pin.' },
        dielectric_er:         { type: 'number', description: 'Launch dielectric εr. PTFE/FEP usually ~2.05-2.10. Default 2.05.' },
        ferrule_step_mm:       { type: 'number', description: 'Abrupt OD/ID discontinuity at ferrule or solder cup in mm. 0 if unknown.' },
        launch_length_mm:      { type: 'number', description: 'Physical length of the suspect launch region. Default 3 mm.' },
        freq_ghz:              { type: 'number', description: 'Frequency of interest in GHz. Default 6 GHz.' },
      },
      required: [],
    },
  },
  {
    name: 'shielding_effectiveness_predictor',
    description:
      'Estimate coax shielding effectiveness from foil overlap, braid coverage, spiral gap, layer count, and frequency. Returns SE in dB, leak risk, weak layer, and build recommendations. Use for EMI / near-field / shield-leak questions before committing a shield stack.',
    input_schema: {
      type: 'object',
      properties: {
        freq_mhz:           { type: 'number', description: 'Test frequency in MHz. Default 1000.' },
        foil_overlap_pct:   { type: 'number', description: 'Foil overlap percent, 0-100. Higher helps seam leakage.' },
        braid_coverage_pct: { type: 'number', description: 'Optical braid coverage percent, 0-100.' },
        spiral_gap_pct:     { type: 'number', description: 'SPC spiral/flatwire shield open gap percent. 8-13% is common for spiral.' },
        layer_count:        { type: 'number', description: 'Number of shield layers, excluding jacket. Default inferred from supplied values.' },
        has_drain:          { type: 'boolean', description: 'True if a drain wire / bonded shield path is present.' },
        jacket_material:    { type: 'string', description: 'Optional jacket material note: PVC, LSZH, FEP, PE, TPU, etc.' },
      },
      required: [],
    },
  },
  {
    name: 'sparameter_cascade',
    description:
      'Cascade a chain of RF cable / connector / passive stages into a quick S-parameter budget. Accepts stages with cable_id+length_ft, connector_id+count, or explicit il_db / return_loss_db. Returns total S21 insertion loss, worst S11 return loss, VSWR, and the dominant stage.',
    input_schema: {
      type: 'object',
      properties: {
        freq_mhz: { type: 'number', description: 'Frequency in MHz for cable attenuation interpolation. Default 1000.' },
        z0_ohm:   { type: 'number', description: 'Reference impedance. Default 50.' },
        stages: {
          type: 'array',
          description: 'Array of stages. Each may include {name, cable_id, length_ft, connector_id, count, il_db, return_loss_db, vswr}.',
          items: { type: 'object' },
        },
      },
      required: ['stages'],
    },
  },
  {
    name: 'phase_delay_match',
    description:
      'Compare two RF cables for phase delay / skew at a frequency and recommend trim length. Use for phase-matched jumpers, antenna arrays, test leads, and differential/high-speed skew checks.',
    input_schema: {
      type: 'object',
      properties: {
        freq_mhz:           { type: 'number', description: 'Frequency for phase calculation in MHz. Default 1000.' },
        length_a_m:         { type: 'number', description: 'Cable A length in metres.' },
        length_b_m:         { type: 'number', description: 'Cable B length in metres.' },
        vf_a:               { type: 'number', description: 'Velocity factor for cable A, 0..1. Default 0.66.' },
        vf_b:               { type: 'number', description: 'Velocity factor for cable B, 0..1. Default = vf_a.' },
        target_skew_ps:     { type: 'number', description: 'Optional desired A-B skew in ps. Default 0.' },
        target_phase_deg:   { type: 'number', description: 'Optional desired A-B phase at freq, degrees. Default derived from target_skew_ps.' },
      },
      required: ['length_a_m', 'length_b_m'],
    },
  },
  {
    name: 'bend_crush_risk',
    description:
      'Estimate impedance disturbance, return loss, and manufacturing risk from bend radius or jacket/dielectric crush. Use when a coax is kinked, clamped, routed too tightly, or fails TDR/VSWR after installation.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id:        { type: 'string', description: 'Optional RF cable id from lookup_rf_cable to infer OD and Z0.' },
        od_mm:           { type: 'number', description: 'Cable outer diameter if no cable_id is provided.' },
        z0_ohm:          { type: 'number', description: 'Nominal impedance. Default cable z0 or 50.' },
        bend_radius_mm:  { type: 'number', description: 'Inside bend radius in mm.' },
        crush_pct:       { type: 'number', description: 'Estimated local diameter compression percent, 0-40.' },
        freq_mhz:        { type: 'number', description: 'Frequency for severity note. Default 1000.' },
      },
      required: [],
    },
  },
  {
    name: 'thermal_power_derating',
    description:
      'Estimate RF cable heating and power derating from frequency, length, ambient temperature, bundle count, VSWR, and cable attenuation. Returns dissipated watts, derated safe power, thermal margin, and whether the run is safe.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id:      { type: 'string', description: 'RF cable id from lookup_rf_cable.' },
        freq_mhz:      { type: 'number', description: 'Frequency in MHz.' },
        power_w:       { type: 'number', description: 'Applied CW RF input power in watts.' },
        length_ft:     { type: 'number', description: 'Cable length in feet. Default 100.' },
        ambient_c:     { type: 'number', description: 'Ambient temperature in C. Default 25.' },
        bundle_count:  { type: 'number', description: 'How many similar cables are bundled together. Default 1.' },
        airflow:       { type: 'string', description: 'still | normal | forced. Default normal.' },
        vswr:          { type: 'number', description: 'Load VSWR. Default 1.0.' },
      },
      required: ['cable_id', 'freq_mhz', 'power_w'],
    },
  },
  {
    name: 'highspeed_compliance_checker',
    description:
      'Check a high-speed cable/channel against common protocol-style limits: USB4/TB, PCIe, HDMI, Cat6A, Cat8, SpaceWire, or custom. Returns pass/fail checks for Z0, insertion loss, return loss, skew, NEXT, and eye opening. Useful when RF-style physical defects need to be translated into high-speed pass/fail language.',
    input_schema: {
      type: 'object',
      properties: {
        protocol:             { type: 'string', description: 'usb4 | tb4 | pcie5 | pcie6 | hdmi21 | cat6a | cat8 | spacewire | custom.' },
        length_m:             { type: 'number', description: 'Channel length in metres.' },
        z0_ohm:               { type: 'number', description: 'Measured impedance. Differential systems use differential Z0.' },
        insertion_loss_db:    { type: 'number', description: 'Measured total insertion loss at the relevant Nyquist/frequency.' },
        return_loss_db:       { type: 'number', description: 'Worst return loss in dB. Higher is better.' },
        skew_ps_per_m:        { type: 'number', description: 'Intra-pair or pair-to-pair skew in ps/m.' },
        next_db:              { type: 'number', description: 'Worst NEXT/crosstalk isolation in dB. Higher is better.' },
        eye_height_ui:        { type: 'number', description: 'Eye height/opening as fraction of UI, 0..1.' },
        custom_limits:        { type: 'object', description: 'Optional overrides: {z0, z_tol_pct, max_il_db, min_rl_db, max_skew_ps_per_m, min_next_db, min_eye_ui}.' },
      },
      required: ['protocol'],
    },
  },
]

// ── dispatcher ─────────────────────────────────────────
export async function dispatchRfTool(name, input) {
  try {
    if (isHiggsfieldTool(name)) return await dispatchHiggsfieldTool(name, input)
    switch (name) {
      case 'lookup_rf_cable': {
        const custom = getCustomRfCables()
        const combined = { ...RF_CABLE_DB, ...custom }
        const matches = searchDB(combined, input.query)
        if (matches.length === 0) return { matches: [], available_ids: Object.keys(combined), note: `No match for "${input.query}".` }
        return { matches: matches.slice(0, 6) }
      }
      case 'add_cable': {
        const { id, name, z0, vf, od_mm, fmax_ghz, atten_db_per_100ft, notes, datasheet } = input
        if (!id || !name || !(z0 > 0)) throw new Error('id, name, and z0 (>0) are required')
        const result = addCustomRfCable({ id, name, z0, vf, od_mm, fmax_ghz, atten_db_per_100ft, notes, datasheet })
        return {
          ok: true,
          id: result.id,
          stored_at: 'browser localStorage (this device only)',
          note: 'Visible in the RF Library tab and searchable via lookup_rf_cable. Use Library → Export to share with team.',
        }
      }
      case 'list_custom_cables': {
        const map = getCustomRfCables()
        const list = Object.values(map)
        return { count: list.length, cables: list }
      }
      case 'delete_cable': {
        if (!input.id) throw new Error('id required')
        const ok = deleteCustomRfCable(input.id)
        return ok ? { ok: true, deleted: input.id } : { ok: false, error: `No custom cable with id "${input.id}". Use list_custom_cables to see what\'s saved.` }
      }
      case 'lookup_connector': {
        const matches = searchDB(CONNECTOR_DB, input.query)
        if (matches.length === 0) return { matches: [], available_ids: Object.keys(CONNECTOR_DB), note: `No match for "${input.query}".` }
        return { matches: matches.slice(0, 6) }
      }
      case 'lookup_material_library': {
        return lookupMaterialLibrary(input)
      }
      case 'generate_blank_mi_template': {
        const filenameBase = String(input?.mi_number || 'MI-blank-template')
          .replace(/[^a-z0-9._-]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'MI-blank-template'
        const miWorkbook = await makeBlankMiWorkbook({
          miNumber: input?.mi_number || 'MI-ST962-____-___',
          partNumber: input?.part_number || '',
          by: input?.by || '',
          date: input?.date || new Date().toLocaleDateString('en-US'),
        })
        return {
          ok: true,
          label: 'Blank MI Excel template',
          template: miWorkbook.template || 'company_mi_blank',
          sheets: [
            'Cover Sheet',
            'Taping (3-Bay)',
            'Taping (3-Bay) (2)',
            'Tape Conditioning',
            'Spiral Shield',
            'Braiding',
            'Extrusion',
            'SI',
            'Package',
          ],
          warning: miWorkbook.warning,
          _download: {
            filename: `${filenameBase}.${miWorkbook.extension || 'xlsx'}`,
            mime: miWorkbook.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ...(miWorkbook.base64 ? { base64: miWorkbook.base64 } : { text: miWorkbook.text || '' }),
          },
        }
      }
      case 'compute_attenuation': {
        const { cable_id, freq_mhz, length_ft } = input
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const [resolvedId, cable] = findRfCable(merged, cable_id)
        if (!cable) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_rf_cable.`)
        if (!(freq_mhz > 0 && length_ft > 0)) throw new Error('freq_mhz and length_ft must be positive')
        const dbPer100 = interpAtten(cable.atten_db_per_100ft, freq_mhz)
        const total = (dbPer100 / 100) * length_ft
        return {
          cable_id: resolvedId,
          cable: cable.name,
          freq_mhz, length_ft,
          attenuation_db_per_100ft: num(dbPer100, 2),
          attenuation_db_total: num(total, 2),
          power_lost_percent: num((1 - Math.pow(10, -total / 10)) * 100, 1),
        }
      }
      case 'link_budget': {
        const {
          tx_dbm, rx_sensitivity_dbm, freq_mhz, distance_m = 0,
          tx_antenna_gain_dbi = 0, rx_antenna_gain_dbi = 0,
          tx_cable_id, tx_cable_ft = 0, rx_cable_id, rx_cable_ft = 0,
          connector_count = 4, connector_il_db = 0.15,
        } = input
        if (!(tx_dbm > -200 && rx_sensitivity_dbm < 50 && freq_mhz > 0)) throw new Error('Need tx_dbm, rx_sensitivity_dbm, freq_mhz')
        const stages = []
        let p = tx_dbm
        stages.push({ stage: 'TX', delta_db: 0, power_dbm: num(p, 2) })
        const cableDb = { ...RF_CABLE_DB, ...getCustomRfCables() }
        if (tx_cable_id && tx_cable_ft > 0) {
          const [, c] = findRfCable(cableDb, tx_cable_id)
          if (!c) throw new Error(`Unknown tx_cable_id "${tx_cable_id}"`)
          const il = (interpAtten(c.atten_db_per_100ft, freq_mhz) / 100) * tx_cable_ft
          p -= il
          stages.push({ stage: `${c.name}, ${tx_cable_ft} ft (TX side)`, delta_db: num(-il, 2), power_dbm: num(p, 2) })
        }
        const conn_il_total = connector_count * connector_il_db
        if (conn_il_total > 0) {
          p -= conn_il_total
          stages.push({ stage: `${connector_count} connectors`, delta_db: num(-conn_il_total, 2), power_dbm: num(p, 2) })
        }
        if (tx_antenna_gain_dbi !== 0) {
          p += tx_antenna_gain_dbi
          stages.push({ stage: `TX antenna gain ${tx_antenna_gain_dbi} dBi`, delta_db: num(tx_antenna_gain_dbi, 2), power_dbm: num(p, 2) })
        }
        let fspl = 0
        if (distance_m > 0) {
          const d_km = distance_m / 1000
          fspl = 32.45 + 20 * Math.log10(freq_mhz) + 20 * Math.log10(Math.max(d_km, 1e-9))
          p -= fspl
          stages.push({ stage: `Free-space path loss (${distance_m} m)`, delta_db: num(-fspl, 2), power_dbm: num(p, 2) })
        }
        if (rx_antenna_gain_dbi !== 0) {
          p += rx_antenna_gain_dbi
          stages.push({ stage: `RX antenna gain ${rx_antenna_gain_dbi} dBi`, delta_db: num(rx_antenna_gain_dbi, 2), power_dbm: num(p, 2) })
        }
        if (rx_cable_id && rx_cable_ft > 0) {
          const [, c] = findRfCable(cableDb, rx_cable_id)
          if (!c) throw new Error(`Unknown rx_cable_id "${rx_cable_id}"`)
          const il = (interpAtten(c.atten_db_per_100ft, freq_mhz) / 100) * rx_cable_ft
          p -= il
          stages.push({ stage: `${c.name}, ${rx_cable_ft} ft (RX side)`, delta_db: num(-il, 2), power_dbm: num(p, 2) })
        }
        const margin = p - rx_sensitivity_dbm
        const verdict = margin >= 20 ? 'STRONG'
          : margin >= 10 ? 'COMFORTABLE'
          : margin >= 3  ? 'TIGHT'
          : margin >= 0  ? 'MARGINAL'
          : 'INSUFFICIENT'
        return {
          stages,
          rx_power_dbm: num(p, 2),
          rx_sensitivity_dbm,
          link_margin_db: num(margin, 2),
          fspl_db: num(fspl, 2),
          verdict,
        }
      }
      case 'free_space_path_loss': {
        const { freq_mhz, distance_m } = input
        if (!(freq_mhz > 0 && distance_m > 0)) throw new Error('freq_mhz and distance_m must be positive')
        const d_km = distance_m / 1000
        const fspl = 32.45 + 20 * Math.log10(freq_mhz) + 20 * Math.log10(d_km)
        return {
          freq_mhz, distance_m,
          fspl_db: num(fspl, 2),
          formula: 'FSPL(dB) = 32.45 + 20·log₁₀(f_MHz) + 20·log₁₀(d_km)',
        }
      }
      case 'noise_figure_cascade': {
        const { stages } = input
        if (!Array.isArray(stages) || stages.length === 0) throw new Error('Need at least one stage')
        const f = stages.map((s) => Math.pow(10, s.nf_db / 10))
        const g = stages.map((s) => Math.pow(10, s.gain_db / 10))
        let nfTotal = f[0]
        let gAccum = g[0]
        for (let i = 1; i < f.length; i++) {
          nfTotal += (f[i] - 1) / gAccum
          gAccum *= g[i]
        }
        const nfTotal_db = 10 * Math.log10(nfTotal)
        const gainTotal_db = 10 * Math.log10(gAccum)
        return {
          stages: stages.map((s, i) => ({ ...s, contribution_to_nf: num(i === 0 ? f[0] : (f[i] - 1) / (g.slice(0, i).reduce((a, b) => a * b, 1)), 4) })),
          nf_total_linear: num(nfTotal, 3),
          nf_total_db: num(nfTotal_db, 3),
          total_gain_db: num(gainTotal_db, 2),
          notes: 'First-stage NF dominates (Friis). To improve overall NF, lower the first stage\'s NF or raise its gain.',
        }
      }
      case 'vswr_to_rl': {
        const { vswr, return_loss_db, rho } = input
        let r
        if (rho != null && rho >= 0 && rho < 1) r = rho
        else if (vswr != null && vswr >= 1) r = (vswr - 1) / (vswr + 1)
        else if (return_loss_db != null && return_loss_db >= 0) r = Math.pow(10, -return_loss_db / 20)
        else throw new Error('Provide one of: vswr, return_loss_db, or rho')
        const v = (1 + r) / (1 - r)
        const rl = r === 0 ? 999 : -20 * Math.log10(r)
        return { vswr: num(v, 3), return_loss_db: num(rl, 2), rho: num(r, 4), power_reflected_percent: num(r * r * 100, 2) }
      }
      case 'compare_cables': {
        const { cable_ids, freq_mhz, length_ft } = input
        if (!Array.isArray(cable_ids) || cable_ids.length < 2) throw new Error('Provide at least 2 cable_ids')
        if (!(freq_mhz > 0 && length_ft > 0)) throw new Error('freq_mhz and length_ft must be positive')
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const rows = cable_ids.map((id) => {
          const [resolvedId, c] = findRfCable(merged, id)
          if (!c) return { id, error: `not found` }
          const dbPer100 = interpAtten(c.atten_db_per_100ft, freq_mhz)
          const total = (dbPer100 / 100) * length_ft
          return {
            id: resolvedId || id, query_id: id, name: c.name, z0: c.z0, vf: c.vf, od_mm: c.od_mm, fmax_ghz: c.fmax_ghz,
            il_db_per_100ft: num(dbPer100, 2),
            total_il_db: num(total, 2),
          }
        })
        const ref = rows.find((r) => !r.error)
        if (ref) {
          rows.forEach((r) => {
            if (r.error || r === ref) return
            r.delta_il_db = num(r.total_il_db - ref.total_il_db, 2)
            r.delta_od_mm = r.od_mm != null && ref.od_mm != null ? num(r.od_mm - ref.od_mm, 2) : undefined
          })
        }
        const winner_il = rows.filter((r) => !r.error).reduce((a, b) => a.total_il_db < b.total_il_db ? a : b, { total_il_db: Infinity })
        return { freq_mhz, length_ft, rows, winner_lowest_il: winner_il.id }
      }
      case 'cable_selector': {
        const { z0, freq_mhz, length_ft, max_il_db, prefer_low_loss = true } = input
        if (!(z0 > 0 && freq_mhz > 0 && length_ft > 0)) throw new Error('z0, freq_mhz, length_ft must be positive')
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const candidates = []
        for (const [id, c] of Object.entries(merged)) {
          if (Math.abs((c.z0 || 0) - z0) > 2) continue
          const dbPer100 = interpAtten(c.atten_db_per_100ft, freq_mhz)
          const total = (dbPer100 / 100) * length_ft
          const passes_il = max_il_db == null || total <= max_il_db
          const score = (prefer_low_loss ? -total * 10 : 0) + (c.fmax_ghz && c.fmax_ghz * 1000 >= freq_mhz ? 5 : 0)
          candidates.push({ id, name: c.name, z0: c.z0, vf: c.vf, od_mm: c.od_mm, total_il_db: num(total, 2), passes_il, score: num(score, 2) })
        }
        candidates.sort((a, b) => b.score - a.score || a.total_il_db - b.total_il_db)
        const top = candidates.slice(0, 6)
        return { z0, freq_mhz, length_ft, max_il_db, candidates: top, recommendation: top.find((c) => c.passes_il)?.id || top[0]?.id }
      }
      case 'alternatives_finder': {
        const { reference_id, freq_mhz = 1000, max_il_delta_db_per_100ft = 1.5 } = input
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const [resolvedRefId, ref] = findRfCable(merged, reference_id)
        if (!ref) throw new Error(`Unknown reference cable "${reference_id}"`)
        const refIL = interpAtten(ref.atten_db_per_100ft, freq_mhz)
        const alternatives = []
        for (const [id, c] of Object.entries(merged)) {
          if (id === resolvedRefId) continue
          if ((c.z0 || 0) !== ref.z0) continue
          const il = interpAtten(c.atten_db_per_100ft, freq_mhz)
          const delta = il - refIL
          if (Math.abs(delta) > max_il_delta_db_per_100ft) continue
          alternatives.push({ id, name: c.name, il_db_per_100ft_at_freq: num(il, 2), delta_db: num(delta, 2), od_mm: c.od_mm, vf: c.vf })
        }
        alternatives.sort((a, b) => Math.abs(a.delta_db) - Math.abs(b.delta_db))
        return { reference: ref.name, freq_mhz, ref_il_db_per_100ft: num(refIL, 2), alternatives }
      }
      case 'coax_per_unit_length': {
        const { D_mm, d_mm, er } = input
        if (!(D_mm > 0 && d_mm > 0 && er > 0)) throw new Error('D, d, er must be positive')
        if (D_mm <= d_mm) throw new Error('D must be > d')
        const lnRatio = Math.log(D_mm / d_mm)
        const Z0 = (60 / Math.sqrt(er)) * lnRatio
        const L_nH_per_m = 200 * lnRatio
        const C_pF_per_m = (55.6 * er) / lnRatio
        const c_speed = 299792458
        const VF = 1 / Math.sqrt(er)
        const delay_ns_per_m = 1e9 / (VF * c_speed)
        return {
          inputs: { D_mm, d_mm, er },
          z0_ohm: num(Z0, 2),
          L_nH_per_m: num(L_nH_per_m, 2),
          C_pF_per_m: num(C_pF_per_m, 2),
          vf: num(VF, 4),
          delay_ns_per_m: num(delay_ns_per_m, 3),
          formula: 'L=μ₀/2π·ln(D/d) · C=2πε₀εr/ln(D/d) · Z₀=√(L/C)=(60/√εr)·ln(D/d)',
        }
      }
      case 'dc_resistance': {
        const { awg, material, length_m, strand_count = 1 } = input
        if (!(length_m > 0 && strand_count >= 1)) throw new Error('length_m > 0 and strand_count >= 1 required')
        const m = MATERIAL_DB[material]
        if (!m || m.rho_ohm_m == null) throw new Error(`Unknown conductor material "${material}". Try copper, silver, aluminum, tin_plated_cu, silver_plated_cu, nickel_plated_cu`)
        const d_mm = 0.127 * Math.pow(92, (36 - awg) / 39)
        const area_m2 = strand_count * Math.PI * Math.pow(d_mm * 1e-3 / 2, 2)
        const R = (m.rho_ohm_m * length_m) / area_m2
        return {
          awg, material: m.name, length_m, strand_count,
          wire_diameter_mm: num(d_mm, 4),
          resistance_ohm: num(R, 4),
          resistance_mohm_per_m: num(R / length_m * 1000, 3),
        }
      }
      case 'skin_depth': {
        const { freq_mhz, material } = input
        if (!(freq_mhz > 0)) throw new Error('freq_mhz must be positive')
        const m = MATERIAL_DB[material]
        if (!m || m.sigma_S_per_m == null) throw new Error(`No conductivity data for "${material}". Try copper, silver, aluminum, tin_plated_cu, silver_plated_cu, nickel_plated_cu`)
        const f = freq_mhz * 1e6
        const mu0 = 4 * Math.PI * 1e-7
        const mu = mu0 * (m.mu_r || 1)
        const delta_m = 1 / Math.sqrt(Math.PI * f * mu * m.sigma_S_per_m)
        return {
          freq_mhz, material: m.name,
          skin_depth_um: num(delta_m * 1e6, 3),
          skin_depth_mil: num(delta_m * 39370.1, 4),
          notes: 'A few skin depths (≥3) of plating is enough to fully carry RF current at this frequency.',
        }
      }
      case 'reflection_from_z_step': {
        const { z1, z2 } = input
        if (!(z1 > 0 && z2 > 0)) throw new Error('z1 and z2 must be positive')
        const rho = (z2 - z1) / (z2 + z1)
        const v = (1 + Math.abs(rho)) / (1 - Math.abs(rho))
        const rl_db = rho === 0 ? 999 : -20 * Math.log10(Math.abs(rho))
        return {
          z1, z2,
          rho: num(rho, 4),
          vswr: num(v, 3),
          return_loss_db: num(rl_db, 2),
          power_reflected_percent: num(rho * rho * 100, 2),
        }
      }
      case 'microstrip_impedance': {
        const { w_mm, h_mm, t_mm = 0.035, er } = input
        if (!(w_mm > 0 && h_mm > 0 && er > 0)) throw new Error('w, h, er must be positive')
        const wh = w_mm / h_mm
        const er_eff = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 / wh))
        let z0
        if (wh < 1) z0 = (60 / Math.sqrt(er_eff)) * Math.log(8 / wh + wh / 4)
        else z0 = (120 * Math.PI / Math.sqrt(er_eff)) / (wh + 1.393 + 0.667 * Math.log(wh + 1.444))
        return { inputs: { w_mm, h_mm, t_mm, er }, z0_ohm: num(z0, 2), er_effective: num(er_eff, 3), notes: 'IPC-2141 / Hammerstad–Jensen formulas; ±5% typical accuracy.' }
      }
      case 'stripline_impedance': {
        const { w_mm, b_mm, t_mm = 0.035, er } = input
        if (!(w_mm > 0 && b_mm > 0 && er > 0)) throw new Error('w, b, er must be positive')
        const we = w_mm + (t_mm / Math.PI) * (1 + Math.log((4 * Math.E * w_mm) / t_mm))
        const z0 = (60 / Math.sqrt(er)) * Math.log((4 * b_mm) / (Math.PI * we))
        return { inputs: { w_mm, b_mm, t_mm, er }, z0_ohm: num(z0, 2), notes: 'IPC-2141 stripline (centered between two ground planes).' }
      }
      case 'power_handling': {
        const { cable_id, freq_mhz, ambient_c = 25, vswr = 1.0 } = input
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const [, c] = findRfCable(merged, cable_id)
        if (!c) throw new Error(`Unknown cable "${cable_id}"`)
        if (!(freq_mhz > 0)) throw new Error('freq_mhz must be positive')
        const od = c.od_mm || 5
        const base_w = Math.pow(od / 5, 2) * 1500
        const tmax = 80
        const therm_factor = Math.max(0.1, (tmax - ambient_c) / (tmax - 25))
        const freq_factor = Math.sqrt(100 / Math.max(freq_mhz, 100))
        const vswr_factor = 1 / Math.max(1.0, vswr)
        const p_max_w = base_w * therm_factor * freq_factor * vswr_factor / 30
        return {
          cable: c.name, freq_mhz, ambient_c, vswr,
          max_cw_power_w: num(p_max_w, 0),
          max_cw_power_dbm: num(10 * Math.log10(p_max_w * 1000), 1),
          limiting_factor: vswr > 1.5 ? 'mismatch (heating at standing-wave peaks)' : freq_mhz > 1000 ? 'thermal (skin loss heats inner conductor)' : 'thermal (jacket Tmax)',
          notes: 'First-order estimate. For mission-critical use, consult datasheet Pmax(f, T) curves.',
        }
      }
      case 'standard_lookup': {
        const id = (input.id || '').toLowerCase()
        const std = STANDARDS_DB[id]
        if (!std) return { error: `Unknown standard "${input.id}"`, available: Object.keys(STANDARDS_DB) }
        return std
      }
      case 'material_props': {
        const m = MATERIAL_DB[(input.material || '').toLowerCase()]
        if (!m) return { error: `Unknown material "${input.material}"`, available: Object.keys(MATERIAL_DB) }
        return m
      }
      case 'generate_touchstone': {
        const { cable_id, length_ft, f_min_mhz = 1, f_max_mhz = 3000, n_points = 1601, defects = [] } = input
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const [resolvedId, c] = findRfCable(merged, cable_id)
        if (!c) throw new Error(`Unknown cable "${cable_id}"`)
        const length_m = length_ft / 3.28084
        const c_speed = 299792458
        const vf = c.vf || 0.66
        const tau_end = (2 * length_m) / (vf * c_speed)
        const lines = [`! Synthesized from rfTools.generate_touchstone`, `! Cable: ${c.name} (${resolvedId || cable_id}), VF=${vf}, length=${length_ft} ft`, `# MHz S MA R 50`]
        for (let i = 0; i < n_points; i++) {
          const f_mhz = f_min_mhz + ((f_max_mhz - f_min_mhz) * i) / (n_points - 1)
          const f = f_mhz * 1e6
          const w = 2 * Math.PI * f
          const dbPer100 = interpAtten(c.atten_db_per_100ft, f_mhz)
          const total_db = (dbPer100 / 100) * length_ft
          const round_trip_loss = Math.pow(10, -total_db / 20)
          let re = round_trip_loss * Math.cos(-w * tau_end)
          let im = round_trip_loss * Math.sin(-w * tau_end)
          for (const d of defects) {
            const dist_m = d.at_ft / 3.28084
            const tau_d = (2 * dist_m) / (vf * c_speed)
            const partial_loss = Math.pow(10, -((dbPer100 / 100) * d.at_ft) / 20)
            re += d.rho * partial_loss * Math.cos(-w * tau_d)
            im += d.rho * partial_loss * Math.sin(-w * tau_d)
          }
          const mag = Math.sqrt(re * re + im * im)
          const ang = Math.atan2(im, re) * 180 / Math.PI
          lines.push(`${f_mhz.toFixed(6)}  ${mag.toFixed(6)}  ${ang.toFixed(4)}`)
        }
        return {
          cable: c.name, length_ft, points: n_points, freq_range: `${f_min_mhz}–${f_max_mhz} MHz`,
          touchstone: lines.join('\n'),
          note: 'Copy or save as .s1p; load into VNA Lab to test the analysis pipeline.',
        }
      }
      case 'mismatch_loss': {
        const { vswr_a, vswr_b, rho } = input
        let rA = 0, rB = 0
        if (rho != null) rA = rho
        else {
          if (vswr_a != null) rA = (vswr_a - 1) / (vswr_a + 1)
          if (vswr_b != null) rB = (vswr_b - 1) / (vswr_b + 1)
        }
        // Worst-case mismatch when both are present: ML = -10·log10(1 - |Γ_total|²) where |Γ_total| = rA·rB
        const rTotal = vswr_a != null && vswr_b != null ? rA * rB : rA
        const ml_db = -10 * Math.log10(Math.max(1e-12, 1 - rTotal * rTotal))
        return {
          rho_total: num(rTotal, 4),
          mismatch_loss_db: num(ml_db, 3),
          notes: vswr_a != null && vswr_b != null
            ? 'Two-port mismatch loss: |Γ_total| ≈ |Γ_A| × |Γ_B| in worst-case interference.'
            : 'Single-port mismatch using provided ρ.',
        }
      }
      case 'get_company_defaults': {
        return { defaults: getCompanyDefaults(), stored_at: 'browser localStorage (this device only)' }
      }
      case 'set_company_defaults': {
        const updated = setCompanyDefaults(input || {})
        return { ok: true, defaults: updated, note: 'Saved to browser localStorage. Future sessions will see these values.' }
      }
      case 'get_shop_memory': {
        return getShopMemory()
      }
      case 'propose_shop_rule': {
        return proposeShopRule(input || {})
      }
      case 'parse_actual_test_report': {
        return parseActualTestReport(input || {})
      }
      case 'whatif_panel': {
        const { title, sliders, outputs, annotation } = input || {}
        if (!title || !Array.isArray(sliders) || !Array.isArray(outputs)) {
          throw new Error('title, sliders[], outputs[] required')
        }
        if (sliders.length > 4) throw new Error('max 4 sliders')
        if (outputs.length > 4) throw new Error('max 4 output rows')
        return {
          ok: true,
          title,
          annotation: annotation || '',
          spec: { title, sliders, outputs, annotation },
          _whatif_panel: { title, sliders, outputs, annotation },
        }
      }
      case 'generate_diagram': {
        const { kind, title } = input || {}
        if (!kind || !title) throw new Error('kind and title are required')
        const allowed = ['smith_chart', 'atten_curve', 'cross_section', 'eye_diagram', 'z_step_chart', 'bargraph']
        if (!allowed.includes(kind)) throw new Error(`Unsupported diagram kind "${kind}". Use one of: ${allowed.join(', ')}`)
        return {
          ok: true,
          kind,
          title,
          annotation: input.annotation || '',
          spec: input,
          _inline_svg: input,
        }
      }
      case 'design_dielectric_stack': {
        const result = await designDielectricStack(input)
        return result
      }
      case 'optimize_dielectric_stack': {
        return optimizeDielectricStack(input)
      }
      case 'validate_recipe_against_rf_stack': {
        return validateRecipeAgainstRfStack(input)
      }
      case 'design_shield_stack': {
        return designShieldStack(input)
      }
      case 'compute_tape_notches': {
        const result = computeTapeNotches(input)
        return result
      }
      case 'connector_launch_analyzer': {
        return analyzeConnectorLaunch(input)
      }
      case 'shielding_effectiveness_predictor': {
        return predictShieldingEffectiveness(input)
      }
      case 'sparameter_cascade': {
        return cascadeSParameters(input)
      }
      case 'phase_delay_match': {
        return matchPhaseDelay(input)
      }
      case 'bend_crush_risk': {
        return estimateBendCrushRisk(input)
      }
      case 'thermal_power_derating': {
        return estimateThermalDerating(input)
      }
      case 'highspeed_compliance_checker': {
        return checkHighspeedCompliance(input)
      }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: err.message || 'Tool execution failed' }
  }
}

// ─────────────────────────────────────────────────────────
// Dielectric stack solver
// ─────────────────────────────────────────────────────────

const _PTFE_SOLID_DENSITY = 2.15
const _PTFE_SOLID_EPS = 2.10

function _densityToEps(density) {
  if (!density || density <= 0) return 1
  const vf = Math.min(1, Math.max(0, density / _PTFE_SOLID_DENSITY))
  const eps_third = vf * Math.cbrt(_PTFE_SOLID_EPS) + (1 - vf)
  return Math.pow(eps_third, 3)
}

function _overlapFraction(o) {
  return ptfeWrapFraction(o)
}
function _overlapLayers(o) {
  return ptfeWrapLayers(o)
}

function _simulateTapePassPlan({ conductorOdMm, tapeThicknessMm, overlap, tensionFactor, hdPasses = 0, ldPasses = 0 }) {
  const d = Number(conductorOdMm)
  const perPass = Number(tapeThicknessMm) * _overlapLayers(overlap) * Number(tensionFactor)
  if (!(d > 0) || !(perPass > 0)) return null
  let r = d / 2
  let logTot = 0
  let weighted = 0
  for (const item of [
    { density: 1.6, passes: Math.max(0, Math.round(hdPasses)) },
    { density: 0.7, passes: Math.max(0, Math.round(ldPasses)) },
  ]) {
    if (!item.passes) continue
    const rNext = r + perPass * item.passes
    const dl = Math.log(rNext / r)
    logTot += dl
    weighted += dl / _densityToEps(item.density)
    r = rNext
  }
  if (!(logTot > 0) || !(weighted > 0)) return null
  const finalOdMm = 2 * r
  const epsEff = logTot / weighted
  const vp = 1 / Math.sqrt(epsEff)
  const z0 = (60 / Math.sqrt(epsEff)) * Math.log(finalOdMm / d)
  return { hdPasses, ldPasses, finalOdMm, epsEff, vp, z0, totalPasses: hdPasses + ldPasses }
}

function _findBestTapePassPlan({ conductorOdMm, tapeThicknessMm, overlap, tensionFactor, targetZ0, targetVp, targetOdMm, mode, fHD, dielectricThkTarget }) {
  const perPass = Number(tapeThicknessMm) * _overlapLayers(overlap) * Number(tensionFactor)
  const nominalPasses = perPass > 0 ? Math.max(1, Number(dielectricThkTarget) / perPass) : 1
  const maxPasses = Math.max(1, Math.min(48, Math.ceil(nominalPasses + 10)))
  const preferMode = String(mode || 'mix').toLowerCase()
  let best = null

  const scorePlan = (sim) => {
    if (!sim) return Infinity
    let score = 0
    if (targetZ0 != null) score += Math.pow((sim.z0 - targetZ0) / 0.75, 2)
    if (targetVp != null) score += Math.pow((sim.vp - targetVp) / 0.006, 2)
    if (targetOdMm != null) {
      const odTol = Math.max(0.06, targetOdMm * 0.012)
      score += Math.pow((sim.finalOdMm - targetOdMm) / odTol, 2)
      if (sim.finalOdMm < targetOdMm) score += Math.pow((targetOdMm - sim.finalOdMm) / odTol, 2) * 0.25
    }
    if (preferMode === 'mix' && sim.totalPasses > 0 && fHD > 0 && fHD < 1) {
      score += Math.pow((sim.hdPasses / sim.totalPasses - fHD) / 0.35, 2) * 0.12
    }
    return score
  }

  for (let total = 1; total <= maxPasses; total++) {
    const plans = []
    if (preferMode === 'hd') plans.push({ hdPasses: total, ldPasses: 0 })
    else if (preferMode === 'ld') plans.push({ hdPasses: 0, ldPasses: total })
    else {
      for (let hdPasses = 0; hdPasses <= total; hdPasses++) {
        plans.push({ hdPasses, ldPasses: total - hdPasses })
      }
    }
    for (const plan of plans) {
      const sim = _simulateTapePassPlan({
        conductorOdMm,
        tapeThicknessMm,
        overlap,
        tensionFactor,
        ...plan,
      })
      const score = scorePlan(sim)
      if (!best || score < best.score) best = { ...sim, score }
    }
  }

  return best || { hdPasses: 1, ldPasses: 0, totalPasses: 1 }
}

function _makePreflightValidation({ predicted, targetZ0, targetVp, targetOdMm }) {
  const checks = []
  const addCheck = ({ name, target, actual, tolerance, unit }) => {
    if (target == null || actual == null || !isFinite(target) || !isFinite(actual)) return
    const delta = actual - target
    checks.push({
      name,
      target: round(target, unit === 'mm' ? 3 : unit === 'VP' ? 4 : 2),
      actual: round(actual, unit === 'mm' ? 3 : unit === 'VP' ? 4 : 2),
      delta: round(delta, unit === 'mm' ? 3 : unit === 'VP' ? 4 : 2),
      tolerance,
      unit,
      pass: Math.abs(delta) <= tolerance,
    })
  }
  addCheck({ name: 'Z0', target: targetZ0, actual: predicted?.z0_ohm, tolerance: 1.5, unit: 'ohm' })
  addCheck({ name: 'VP', target: targetVp, actual: predicted?.vp, tolerance: 0.015, unit: 'VP' })
  addCheck({ name: 'Dielectric OD', target: targetOdMm, actual: predicted?.final_od_mm, tolerance: Math.max(0.18, (targetOdMm || 0) * 0.03), unit: 'mm' })
  const allowApply = checks.every((check) => check.pass)
  return {
    status: allowApply ? 'pass' : 'blocked',
    allow_apply: allowApply,
    checks,
    message: allowApply
      ? 'Preflight passed against the RF stack calculator targets; Apply is enabled.'
      : 'Preflight blocked Apply because the calculated stack does not match target Z0/VP/dielectric OD closely enough.',
  }
}

function _toolCheck(level, name, actual, target, message) {
  return { level, name, actual, target, pass: level !== 'block', message }
}

function _machineRuleGuardForRecipe({ conductorOdMm, layers = [], shieldLayers = [], requireDielectric = false }) {
  const checks = []
  const smallCore = Number(conductorOdMm) / 25.4 <= SMALL_CABLE_TAPE_OD_IN + 0.00001
  if (requireDielectric && !layers.length) {
    checks.push(_toolCheck('block', 'Dielectric stack', 'missing', 'PTFE recipe', 'Build or validate PTFE layers before Apply/MI.'))
  }
  layers.forEach((layer, index) => {
    const pitchIn = Number(layer.pitch_setpoint_in ?? layer.pitchSetpointIn ?? (layer.pitch_setpoint_mm != null ? Number(layer.pitch_setpoint_mm) / 25.4 : NaN))
    const widthIn = Number(layer.tape_width_in ?? layer.width_in ?? (layer.tape_width_mm != null ? Number(layer.tape_width_mm) / 25.4 : NaN))
    const overlapPct = Number(layer.overlap_pct ?? normalizePtfeWrap(layer.overlap).percent)
    const part = layer.part_number || layer.partNumber || ''
    checks.push(_toolCheck(
      Number.isFinite(pitchIn) && pitchIn < WTM_MIN_TAPING_PITCH_IN - 0.0001 ? 'block' : 'pass',
      `Tape #${index + 1} WTM pitch`,
      Number.isFinite(pitchIn) ? round(pitchIn, 4) : null,
      WTM_MIN_TAPING_PITCH_IN,
      'WTM taping-head pitch must not be below the machine minimum.',
    ))
    checks.push(_toolCheck(
      [50, 66.7, 75].some((v) => Math.abs(v - overlapPct) <= 0.6) ? 'pass' : 'block',
      `Tape #${index + 1} PTFE wrap`,
      round(overlapPct, 1),
      '50 / 66.7 / 75%',
      'PTFE wrap must be one of the three shop settings.',
    ))
    checks.push(_toolCheck(
      part ? 'pass' : 'block',
      `Tape #${index + 1} material`,
      part || 'missing',
      '962-96000 catalog',
      'Use a stocked PTFE tape part number instead of loose dimensions.',
    ))
    if (smallCore) {
      checks.push(_toolCheck(
        Number.isFinite(widthIn) && widthIn >= SMALL_CABLE_MAX_PTFE_WIDTH_IN - 0.00001 ? 'block' : 'pass',
        `Tape #${index + 1} small-core width`,
        Number.isFinite(widthIn) ? round(widthIn, 4) : null,
        `< ${SMALL_CABLE_MAX_PTFE_WIDTH_IN}`,
        'For OD <= 0.051 in, avoid 0.0375 in PTFE tape width.',
      ))
    }
  })
  shieldLayers.forEach((layer, index) => {
    const type = String(layer.type || '').toLowerCase()
    if (type === 'spiral') {
      const gap = Number(layer.gap ?? layer.gap_pct ?? layer.actual_gap_pct)
      const bobbins = Math.round(Number(layer.bobbins) || DEFAULT_SPIRAL_BOBBINS)
      checks.push(_toolCheck(
        bobbins === DEFAULT_SPIRAL_BOBBINS ? 'pass' : 'warn',
        `Shield #${index + 1} spiral bobbins`,
        bobbins,
        DEFAULT_SPIRAL_BOBBINS,
        'Shop SPC spiral width rule is calibrated for 8 bobbins.',
      ))
      checks.push(_toolCheck(
        Number.isFinite(gap) && gap < 1 ? 'block' : Number.isFinite(gap) && (gap < 6 || gap > 18) ? 'warn' : 'pass',
        `Shield #${index + 1} spiral gap`,
        Number.isFinite(gap) ? round(gap, 1) : null,
        'visible ~10%',
        'Spiral is separate flatwire, not overlap; keep a real between-wire gap.',
      ))
    }
    if (type === 'foil') {
      const overlap = Number(layer.overlap ?? layer.overlap_pct)
      checks.push(_toolCheck(
        Number.isFinite(overlap) && (overlap < 20 || overlap > 75) ? 'warn' : 'pass',
        `Shield #${index + 1} foil overlap`,
        Number.isFinite(overlap) ? round(overlap, 1) : null,
        'MI-confirmed',
        'Confirm foil 1/2 vs 2/3 wrap against the shop MI.',
      ))
    }
    if (type === 'braid') {
      const carriers = Number(layer.carriers)
      const ends = Number(layer.ends ?? layer.ends_per_carrier)
      const picks = Number(layer.picks ?? layer.picks_per_in)
      const coverage = Number(layer.coverage ?? layer.coverage_pct)
      checks.push(_toolCheck(
        carriers <= 0 || ends <= 0 || picks <= 0 ? 'block' : 'pass',
        `Shield #${index + 1} braid setup`,
        `${carriers || '?'}C x ${ends || '?'}E / ${round(picks, 1) || '?'} PPI`,
        'positive setup',
        'Carrier, end, and pick counts must be positive manufacturable values.',
      ))
      checks.push(_toolCheck(
        Number.isFinite(coverage) && (coverage < 90 || coverage > 99.5) ? 'warn' : 'pass',
        `Shield #${index + 1} braid coverage`,
        Number.isFinite(coverage) ? round(coverage, 1) : null,
        '90-99.5%',
        'Coverage outside the normal RF window needs engineer review.',
      ))
    }
  })
  const blocks = checks.filter((check) => check.level === 'block')
  const warnings = checks.filter((check) => check.level === 'warn')
  return { status: blocks.length ? 'blocked' : warnings.length ? 'review' : 'pass', checks, blocks, warnings }
}

function _toleranceForRecipe({ conductorOdMm, predicted = {} }) {
  const z0 = Number(predicted.z0_ohm)
  const vp = Number(predicted.vp)
  const finalOd = Number(predicted.final_od_mm)
  const eps = Number(predicted.eps_eff)
  const rows = []
  if (Number.isFinite(z0)) {
    const swing = Math.max(0.8, Math.abs(z0 - 50) * 0.25 + 0.7)
    rows.push({ label: 'Z0 worst case', min: round(z0 - swing, 2), nom: round(z0, 2), max: round(z0 + swing, 2), unit: 'ohm', level: z0 - swing < 48.5 || z0 + swing > 51.5 ? 'warn' : 'pass' })
  }
  if (Number.isFinite(vp)) {
    const swing = 0.012
    rows.push({ label: 'VP worst case', min: round((vp - swing) * 100, 2), nom: round(vp * 100, 2), max: round((vp + swing) * 100, 2), unit: '%', level: 'info' })
  }
  if (Number.isFinite(finalOd)) {
    const swing = Math.max(0.0015 * 25.4, finalOd * 0.015)
    rows.push({ label: 'Dielectric OD worst case', min: round(finalOd - swing, 4), nom: round(finalOd, 4), max: round(finalOd + swing, 4), unit: 'mm', level: 'info' })
  }
  if (Number.isFinite(predicted.bragg_notch_1_ghz)) {
    const notch = Number(predicted.bragg_notch_1_ghz)
    rows.push({ label: 'First suckout worst case', min: round(notch * 0.97, 2), nom: round(notch, 2), max: round(notch * 1.03, 2), unit: 'GHz', level: 'info' })
  }
  return {
    rows,
    assumptions: {
      conductor_tol_in: conductorOdMm ? 0.0003 : null,
      dielectric_od_tol_pct: 1.5,
      eps_eff_tol_pct: Number.isFinite(eps) ? 2.5 : null,
      pitch_tol_pct: 3,
    },
  }
}

function _miQaForRecipe({ miWorkbook = {}, layers = [], shieldLayers = [], requirePtfe = true }) {
  const checks = []
  if (requirePtfe) {
    checks.push(_toolCheck(layers.length ? 'pass' : 'block', 'MI taping rows', layers.length, '>=1', 'The MI must have at least one PTFE taping row.'))
    checks.push(_toolCheck(layers.length <= 6 ? 'pass' : 'warn', 'MI 3-Bay capacity', `${layers.length}/6`, '6 rows', 'The current shop template has two 3-Bay taping pages.'))
  } else {
    checks.push(_toolCheck(shieldLayers.length ? 'pass' : 'warn', 'Shield run sheet rows', shieldLayers.length, '>=1', 'Shield-only apply uses Stack Lab/run-sheet rows rather than PTFE MI pages.'))
  }
  const missingMaterial = layers.filter((layer) => !(layer.part_number || layer.partNumber)).length
  checks.push(_toolCheck(missingMaterial ? 'block' : 'pass', 'MI material cells', missingMaterial ? `${missingMaterial} missing` : 'complete', 'complete', 'Every MI row should use a real material part number.'))
  const missingPitch = layers.filter((layer) => !(Number(layer.pitch_setpoint_in) > 0 || Number(layer.pitch_setpoint_mm) > 0)).length
  checks.push(_toolCheck(missingPitch ? 'block' : 'pass', 'MI pitch cells', missingPitch ? `${missingPitch} missing` : 'complete', 'complete', 'Every PTFE row needs a pitch set-point.'))
  if (miWorkbook.template) {
    checks.push(_toolCheck(miWorkbook.template === 'MI-ST962-032-130.xlsx' ? 'pass' : 'warn', 'MI template', miWorkbook.template, 'MI-ST962-032-130.xlsx', 'Use the shop MI template as the layout source.'))
  }
  if (miWorkbook.warning) {
    checks.push(_toolCheck('warn', 'MI workbook warning', miWorkbook.warning, 'none', 'Review workbook generation warning before download.'))
  }
  if (shieldLayers.length) {
    checks.push(_toolCheck('pass', 'Shield rows', shieldLayers.length, 'run-sheet backed', 'Shield settings are available in the stack/run-sheet output.'))
  }
  const blocks = checks.filter((check) => check.level === 'block')
  const warnings = checks.filter((check) => check.level === 'warn')
  return { status: blocks.length ? 'blocked' : warnings.length ? 'review' : 'pass', checks, blocks, warnings }
}

function _miRenderTriplet(nominalIn, tol = 0.001) {
  const v = Number(nominalIn)
  if (!Number.isFinite(v) || v <= 0) return { min: '-', nom: '-', max: '-' }
  return { min: round(v - tol, 4), nom: round(v, 4), max: round(v + tol, 4) }
}

function _miRenderNominal(nominalIn) {
  const v = Number(nominalIn)
  if (!Number.isFinite(v) || v <= 0) return { min: '-', nom: '-', max: '-' }
  return { min: '-', nom: round(v, 4), max: '-' }
}

function _miRenderQaForRecipe({ miWorkbook = {}, conductorOdMm, layers = [], overlap = '2/3', tensionN = 4, lineSpeedFtMin = 7, miNumber = 'MI-ST962-AUTO' }) {
  const { conductorOdIn, entries } = buildPtfeMiEntries({ conductorOdMm, layers, overlap, tensionN, lineSpeedFtMin })
  const pages = []
  for (let i = 0; i < entries.length && i < 6; i += 3) {
    const chunk = entries.slice(i, i + 3)
    const incomingOdIn = i === 0 ? conductorOdIn : entries[i - 1]?.odAfterIn
    const finalOdIn = chunk[chunk.length - 1]?.odAfterIn
    const parameterRows = [
      { label: '"PO" LaserLink OD', ..._miRenderTriplet(incomingOdIn) },
      { label: 'Caterpillar Gap', min: '-', nom: 6.85, max: '-' },
    ]
    chunk.forEach((entry) => {
      parameterRows.push({ label: `Tape #${entry.pass}, Lay Direction`, min: '-', nom: entry.direction, max: '-' })
      parameterRows.push({ label: `Tape #${entry.pass}, Pitch Set-Point`, min: '-', nom: round(entry.pitchIn, 4), max: '-' })
      parameterRows.push({ label: `Tape #${entry.pass}, Overlap`, min: '-', nom: entry.overlapText, max: '-' })
      parameterRows.push({ label: `Tape #${entry.pass}, Tension (N)`, min: '-', nom: round(entry.tensionN, 1), max: '-' })
      parameterRows.push({ label: `Tape #${entry.pass}, Roller #1/#2 Position`, min: '-', nom: entry.rollerPosition || '-', max: '-' })
      parameterRows.push({ label: `"H${entry.pass}" LaserLink OD`, ..._miRenderNominal(entry.odAfterIn) })
    })
    parameterRows.push({ label: 'Line Speed (ft/min)', min: '-', nom: Number(lineSpeedFtMin || 7), max: '-' })
    parameterRows.push({ label: '"TU" LaserLink OD', ..._miRenderNominal(finalOdIn) })
    parameterRows.push({ label: 'Take-Up Spool Size', min: '', nom: 'AT12679', max: '' })
    pages.push({
      title: `SHEET ${Math.floor(i / 3) + 1} OF 12`,
      process: `Taping #${Math.floor(i / 3) + 1}`,
      machine: 'WTM 3-Bay',
      mi_number: miNumber,
      reference: 'AP96-007',
      materials: chunk.map((entry) => ({ description: `Tape #${entry.pass}`, part_number: entry.partNumber || '-' })),
      parameter_rows: parameterRows,
      actual_columns: ['Actual', 'Oper.', 'Date'],
    })
  }
  const checks = [
    _toolCheck(miWorkbook.template === 'MI-ST962-032-130.xlsx' ? 'pass' : 'warn', 'Rendered template', miWorkbook.template || 'preview only', 'MI-ST962-032-130.xlsx', 'Visual preview is keyed to the shop MI sheet layout.'),
    _toolCheck(entries.length ? 'pass' : 'block', 'Rendered taping rows', entries.length, '>=1', 'The render needs at least one taping row to verify the MI page.'),
    _toolCheck(entries.length <= 6 ? 'pass' : 'warn', 'Rendered 3-Bay capacity', `${Math.min(entries.length, 6)}/${entries.length}`, '<=6 visible rows', 'The visible shop template has two 3-Bay pages; extra rows remain in JSON/run-sheet.'),
    _toolCheck(entries.every((entry) => entry.partNumber) ? 'pass' : 'block', 'Rendered material cells', entries.filter((entry) => entry.partNumber).length, entries.length, 'Every visible tape row should carry a Material Library part number.'),
    _toolCheck(entries.every((entry) => Number.isFinite(entry.pitchIn) && Number.isFinite(entry.odAfterIn)) ? 'pass' : 'block', 'Rendered pitch / OD cells', 'complete', 'complete', 'Pitch set-point and OD after tape must appear in the rendered sheet.'),
    _toolCheck(pages.every((page) => page.actual_columns?.length === 3) ? 'pass' : 'block', 'Rendered Actual/Oper/Date boxes', 'visible', 'visible', 'Right-side signoff boxes must remain visible before download.'),
  ]
  const blocks = checks.filter((check) => check.level === 'block')
  const warnings = checks.filter((check) => check.level === 'warn')
  return {
    status: blocks.length ? 'blocked' : warnings.length ? 'review' : 'pass',
    template: miWorkbook.template || 'MI render preview',
    page_count: pages.length,
    omitted_rows: Math.max(0, entries.length - 6),
    pages,
    checks,
    blocks,
    warnings,
    message: blocks.length
      ? 'MI render QA found missing visible cells before download.'
      : warnings.length
        ? 'MI render QA produced a preview, but review the warning items before printing.'
        : 'MI render QA preview matches the expected shop MI visual blocks.',
  }
}

function _safetyAuditForResult({ preflight, machineGuard, tolerance, miQa }) {
  const blocks = []
  const warnings = []
  if (preflight && preflight.allow_apply === false) {
    blocks.push(_toolCheck('block', 'Calculator preflight', preflight.status || 'blocked', 'pass', preflight.message || 'Calculator preflight did not pass.'))
  }
  ;(machineGuard?.blocks || []).forEach((item) => blocks.push(item))
  ;(miQa?.blocks || []).forEach((item) => blocks.push(item))
  ;(machineGuard?.warnings || []).forEach((item) => warnings.push(item))
  ;(miQa?.warnings || []).forEach((item) => warnings.push(item))
  ;(tolerance?.rows || []).filter((row) => row.level === 'warn').forEach((row) => warnings.push(_toolCheck('warn', row.label, `${row.min}-${row.max} ${row.unit}`, 'inside tolerance', 'Worst-case tolerance window needs review.')))
  return {
    status: blocks.length ? 'blocked' : warnings.length ? 'review' : 'pass',
    allow_apply: blocks.length === 0,
    blocks,
    warnings,
    message: blocks.length
      ? 'Safety auditor held Apply until blocking machine/MI/calculator issues are corrected.'
      : warnings.length
        ? 'Safety auditor found review items; Apply remains available after engineer review.'
        : 'Safety auditor passed; no machine-rule or MI blockers found.',
  }
}

function _combinePreflightWithAudit(preflight, audit) {
  const allow = Boolean(preflight?.allow_apply) && Boolean(audit?.allow_apply)
  return {
    ...(preflight || { checks: [] }),
    status: allow ? 'pass' : 'blocked',
    allow_apply: allow,
    safety_status: audit?.status || 'unknown',
    message: allow
      ? preflight?.message || 'Preflight passed.'
      : audit?.message || preflight?.message || 'Apply held by safety auditor.',
  }
}

function _readRfCalibrationMemory() {
  try {
    if (typeof localStorage === 'undefined') return []
    const parsed = JSON.parse(localStorage.getItem(RF_CALIBRATION_MEMORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function _uniqueTruthy(items) {
  return Array.from(new Set((items || []).filter(Boolean)))
}

function _calibrationToolScore(sample, signature) {
  let score = 0
  const conductorDelta = Math.abs(Number(sample.conductorOdIn) - signature.conductorOdIn)
  if (Number.isFinite(conductorDelta)) {
    const pct = conductorDelta / Math.max(0.001, signature.conductorOdIn)
    score += Math.max(0, Math.min(30, 30 - pct * 150))
  }
  const sampleParts = new Set(sample.ptfeParts || [])
  const partHits = signature.ptfeParts.filter((part) => sampleParts.has(part)).length
  if (partHits) score += Math.min(30, partHits * 12)
  const sampleWraps = new Set(sample.ptfeWraps || [])
  const wrapHits = signature.ptfeWraps.filter((wrap) => sampleWraps.has(wrap)).length
  if (wrapHits) score += Math.min(18, wrapHits * 7)
  const sampleShields = new Set(sample.shieldTypes || [])
  const shieldHits = signature.shieldTypes.filter((type) => sampleShields.has(type)).length
  if (shieldHits) score += Math.min(18, shieldHits * 6)
  if ((sample.scope || 'dielectric') === (signature.shieldTypes.length ? 'full_stack' : 'dielectric')) score += 8
  return score
}

function _weightedCalibrationAverage(items, key) {
  let total = 0
  let weight = 0
  items.forEach((item) => {
    const value = Number(item.sample?.deltas?.[key])
    if (!Number.isFinite(value)) return
    const w = Math.max(1, Number(item.score) || 1)
    total += value * w
    weight += w
  })
  return weight ? total / weight : null
}

function _calibrationHintForRecipe({ conductorOdMm, layers = [], predicted = {}, shieldLayers = [] }) {
  const samples = _readRfCalibrationMemory().filter((sample) => sample?.deltas)
  const signature = {
    conductorOdIn: conductorOdMm / 25.4,
    ptfeParts: _uniqueTruthy(layers.map((layer) => layer.part_number || layer.partNumber)),
    ptfeWraps: _uniqueTruthy(layers.map((layer) => normalizePtfeWrap(layer.overlap).key)),
    shieldTypes: _uniqueTruthy(shieldLayers.map((layer) => layer.type)),
  }
  const scored = samples
    .map((sample) => ({ sample, score: _calibrationToolScore(sample, signature) }))
    .sort((a, b) => b.score - a.score)
  const matches = scored.filter((item) => item.score >= 22).slice(0, 8)
  const pool = matches.length ? matches : scored.slice(0, 8)
  const z0Bias = _weightedCalibrationAverage(pool, 'z0')
  const vpBias = _weightedCalibrationAverage(pool, 'vpPct')
  const odPool = signature.shieldTypes.length ? pool : pool.filter((item) => (item.sample.scope || 'dielectric') === 'dielectric')
  const odBiasIn = _weightedCalibrationAverage(odPool, 'odIn')
  const rawZ0 = Number(predicted.z0_ohm)
  const rawVp = Number(predicted.vp)
  const rawOdMm = Number(predicted.final_od_mm)
  const calibratedVpPct = Number.isFinite(rawVp) ? rawVp * 100 + (Number.isFinite(vpBias) ? vpBias : 0) : null
  const confidence = matches.length >= 3 ? 'high' : matches.length ? 'medium' : samples.length ? 'global' : 'none'
  return {
    sample_count: samples.length,
    matched_count: matches.length,
    confidence,
    bias: {
      z0_ohm: Number.isFinite(z0Bias) ? round(z0Bias, 3) : null,
      vp_pct_points: Number.isFinite(vpBias) ? round(vpBias, 3) : null,
      od_in: Number.isFinite(odBiasIn) ? round(odBiasIn, 5) : null,
    },
    raw_prediction: {
      z0_ohm: Number.isFinite(rawZ0) ? round(rawZ0, 3) : null,
      vp: Number.isFinite(rawVp) ? round(rawVp, 4) : null,
      final_od_mm: Number.isFinite(rawOdMm) ? round(rawOdMm, 4) : null,
    },
    calibrated_prediction: {
      z0_ohm: Number.isFinite(rawZ0) ? round(rawZ0 + (Number.isFinite(z0Bias) ? z0Bias : 0), 3) : null,
      vp: Number.isFinite(calibratedVpPct) ? round(calibratedVpPct / 100, 4) : null,
      vp_pct: Number.isFinite(calibratedVpPct) ? round(calibratedVpPct, 2) : null,
      final_od_mm: Number.isFinite(rawOdMm) ? round(rawOdMm + ((Number.isFinite(odBiasIn) ? odBiasIn : 0) * 25.4), 4) : null,
    },
    message: samples.length
      ? matches.length
        ? `Calibration Memory found ${matches.length} matching shop sample${matches.length === 1 ? '' : 's'}; compare raw vs calibrated prediction before Apply.`
        : 'Calibration Memory has samples, but none closely match this conductor/tape/shield process; using global bias only.'
      : 'No Calibration Memory samples yet. Save actual tested reels in RF Stack Lab to make future agent builds smarter.',
  }
}

function _parseFirstReportNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern)
    if (match) {
      const value = Number(String(match[1]).replace(/,/g, ''))
      if (Number.isFinite(value)) return value
    }
  }
  return null
}

function parseActualTestReport(input = {}) {
  const rawText = String(input.raw_text || input.report_text || input.text || '')
  const measured = {
    cableId: input.cable_id || input.mi_number || rawText.match(/\b(?:MI[-\w.]+|ST[-\w.]+|962[-\w.]+)/i)?.[0] || '',
    measuredZ0: input.measured_z0_ohm ?? input.z0_ohm ?? _parseFirstReportNumber(rawText, [
      /(?:av\.?\s*)?z(?:0|o)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /impedance[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]) ?? '',
    measuredVp: input.measured_vp_pct ?? input.vp_pct ?? (input.vp != null ? Number(input.vp) * (Number(input.vp) <= 1 ? 100 : 1) : null) ?? _parseFirstReportNumber(rawText, [
      /v(?:p|elocity)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*%/i,
      /velocity[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]) ?? '',
    measuredSuckoutGHz: input.suckout_ghz ?? input.notch_ghz ?? _parseFirstReportNumber(rawText, [
      /suck\s*out[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
      /notch[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:g|ghz)/i,
      /dip[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:g|ghz)/i,
    ]) ?? '',
    measuredFinalOdIn: input.final_od_in ?? input.final_od_inch ?? _parseFirstReportNumber(rawText, [
      /(?:final|outgoing|tu)?\s*o\.?d\.?[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|")/i,
      /(?:final|outgoing|tu)?\s*od[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]) ?? '',
    measuredIlDb: input.insertion_loss_db ?? input.loss_db ?? _parseFirstReportNumber(rawText, [
      /(?:insertion\s*loss|s21|attenuation)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*dB/i,
    ]) ?? '',
    measuredRlDb: input.return_loss_db ?? input.rl_db ?? input.s11_db ?? _parseFirstReportNumber(rawText, [
      /(?:return\s*loss|rl|s11)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*dB/i,
    ]) ?? '',
    measuredVswr: input.vswr ?? _parseFirstReportNumber(rawText, [/vswr[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i]) ?? '',
    measuredCapPfFt: input.capacitance_pf_ft ?? input.cap_pf_ft ?? _parseFirstReportNumber(rawText, [
      /(?:capacitance|cap\.?|pf\/ft)[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
      /([0-9]+(?:\.[0-9]+)?)\s*pF\s*\/\s*ft/i,
    ]) ?? '',
    notes: input.notes || rawText.slice(0, 500),
  }
  const filled = Object.entries(measured).filter(([, value]) => value !== '' && value != null).length
  return {
    ok: filled > 1,
    measured,
    raw_text: rawText,
    label: measured.cableId ? `Actual test ${measured.cableId}` : 'Actual test import',
    _section: 'stack-measured',
    _apply_preset: { measured, raw_text: rawText },
    _measured_test: {
      fields_detected: filled,
      z0_ohm: measured.measuredZ0 || null,
      vp_pct: measured.measuredVp || null,
      suckout_ghz: measured.measuredSuckoutGHz || null,
      final_od_in: measured.measuredFinalOdIn || null,
      message: filled > 1
        ? 'Click Apply to load these actual test values into RF Stack Lab.'
        : 'No reliable measured fields were found; ask the agent to read the image again or paste clearer OCR text.',
    },
    notes: [
      'This tool normalizes OCR/text extracted by the vision agent or pasted report text into the Measured Test Correlator fields.',
      'After Apply, save it as a golden recipe if the reel is a trusted baseline.',
    ],
  }
}

function _resolveDielectricTargets(input = {}) {
  const d = input.conductor_od_mm != null
    ? Number(input.conductor_od_mm)
    : input.conductor_od_inch != null
      ? Number(input.conductor_od_inch) * 25.4
      : NaN
  if (!(d > 0.05 && d < 30)) throw new Error('Need conductor_od_mm or conductor_od_inch.')

  let targetVp = input.target_vp != null ? Number(input.target_vp) : null
  let targetZ0 = input.target_z0_ohm != null ? Number(input.target_z0_ohm) : null
  let epsTarget = targetVp && targetVp > 0 && targetVp < 1 ? 1 / (targetVp * targetVp) : null
  if (!epsTarget && targetZ0) epsTarget = (_densityToEps(1.6) + _densityToEps(0.7)) / 2
  if (epsTarget && !targetZ0) targetZ0 = 50
  if (!epsTarget && !targetZ0) {
    targetZ0 = 50
    epsTarget = _densityToEps(1.6)
  }

  const explicitTargetOd = input.target_dielectric_od_mm != null
    ? Number(input.target_dielectric_od_mm)
    : input.target_dielectric_od_inch != null
      ? Number(input.target_dielectric_od_inch) * 25.4
      : input.dielectric_od_mm != null
        ? Number(input.dielectric_od_mm)
        : input.dielectric_od_inch != null
          ? Number(input.dielectric_od_inch) * 25.4
          : NaN
  const targetOdMm = explicitTargetOd > d
    ? explicitTargetOd
    : targetZ0 && epsTarget
      ? d * Math.exp((targetZ0 * Math.sqrt(epsTarget)) / 60)
      : NaN

  return {
    conductorOdMm: d,
    targetZ0,
    targetVp,
    epsTarget,
    targetOdMm: targetOdMm > d ? targetOdMm : null,
  }
}

function _densityFromLayer(layer = {}, fallbackTape = null) {
  const explicit = Number(layer.density ?? layer.density_gcc)
  if (explicit > 0) return explicit
  const code = String(layer.density_code || layer.densityCode || fallbackTape?.densityCode || '').toUpperCase()
  if (code === 'H') return 1.6
  if (code === 'L') return 0.7
  return Number(fallbackTape?.densityGcc) || 0.7
}

function _stackApplyPreset(conductorOdMm, targetZ0, stackOut) {
  return {
    conductor_od_mm: round(conductorOdMm, 4),
    target_z0: targetZ0,
    layers: stackOut.map((L) => ({
      preset: L.preset,
      part_number: L.part_number,
      material_id: L.material_id,
      density_code: L.density_code,
      density_label: L.density_label,
      density: L.density,
      tape_thickness_mm: L.tape_thickness_mm,
      tape_thickness_mil: L.tape_thickness_mil,
      tape_width_mm: L.tape_width_mm,
      tape_width_in: L.tape_width_in,
      pitch_setpoint_mm: L.pitch_setpoint_mm,
      pitch_setpoint_in: L.pitch_setpoint_in,
      OD_after_mm: L.OD_after_mm,
      OD_before_mm: L.OD_before_mm,
      overlap: L.overlap,
      tension_factor: L.tension_factor,
      passes: L.passes,
    })),
  }
}

function _simulatePtfeRecipe({ conductorOdMm, layers, targetZ0, targetVp, targetOdMm, useOdAfterOverrides = false }) {
  let r = Number(conductorOdMm) / 2
  const stackOut = []
  const builtLayers = []
  for (const rawLayer of layers || []) {
    const tape = findNearestPtfeTape({
      partNumber: rawLayer.part_number || rawLayer.partNumber || rawLayer.material_id,
      thicknessMm: rawLayer.tape_thickness_mm ?? rawLayer.thickness_mm,
      widthMm: rawLayer.tape_width_mm ?? rawLayer.width_mm,
      widthIn: rawLayer.tape_width_in ?? rawLayer.width_in,
      densityCode: rawLayer.density_code || rawLayer.densityCode,
      density: rawLayer.density,
      cableOdMm: conductorOdMm,
    })
    const overlap = normalizePtfeWrap(rawLayer.overlap || '2/3').key
    const passes = Math.max(1, Math.min(48, Math.round(Number(rawLayer.passes) || 1)))
    const tensionFactor = _clamp(Number(rawLayer.tension_factor ?? rawLayer.tensionFactor ?? 0.92) || 0.92, 0.65, 1.05)
    const tapeThicknessMm = Number(rawLayer.tape_thickness_mm ?? rawLayer.thickness_mm ?? tape?.thicknessMm)
    const tapeWidthMm = Number(rawLayer.tape_width_mm ?? rawLayer.width_mm ?? (rawLayer.tape_width_in ? Number(rawLayer.tape_width_in) * 25.4 : tape?.widthMm))
    const density = _densityFromLayer(rawLayer, tape)
    const odBeforeMm = 2 * r
    const requestedOdAfter = Number(rawLayer.OD_after_mm ?? rawLayer.od_after_mm ?? rawLayer.ODAfterMm)
    const calculatedRadial = tapeThicknessMm * _overlapLayers(overlap) * tensionFactor * passes
    const radial = useOdAfterOverrides && requestedOdAfter > odBeforeMm
      ? (requestedOdAfter - odBeforeMm) / 2
      : calculatedRadial
    const odAfterMm = odBeforeMm + radial * 2
    const pitchInfo = ptfeShopPitchSetpoint({
      cableOdMm: odBeforeMm,
      tapeWidthMm,
      overlap,
      density,
      densityCode: rawLayer.density_code || rawLayer.densityCode || tape?.densityCode,
      partNumber: rawLayer.part_number || rawLayer.partNumber || tape?.partNumber,
    })
    const eps_r = _densityToEps(density)
    const toolLayer = ptfeTapeToToolLayer(tape, {
      preset: rawLayer.preset || (density >= 1.1 ? 'high_density' : 'low_density'),
      density,
      density_code: density >= 1.1 ? 'H' : 'L',
      density_label: density >= 1.1 ? 'High density' : 'Low density',
      tape_thickness_mm: tapeThicknessMm,
      tape_thickness_mil: tapeThicknessMm / 0.0254,
      tape_width_mm: tapeWidthMm,
      tape_width_in: tapeWidthMm / 25.4,
      overlap,
      overlap_pct: normalizePtfeWrap(overlap).percent,
      tension_factor: tensionFactor,
      passes,
      OD_before_mm: round(odBeforeMm, 4),
      OD_after_mm: round(odAfterMm, 4),
      pitch_setpoint_in: round(pitchInfo.pitchIn, 4),
      pitch_setpoint_mm: round(pitchInfo.pitchMm, 4),
      requested_pitch_in: round(pitchInfo.calculatedPitchIn, 4),
      requested_pitch_mm: round(pitchInfo.calculatedPitchMm, 4),
      pitch_limited_by_wtm: pitchInfo.pitchLimited,
      thickness_mm: round(radial, 4),
      eps_r: round(eps_r, 4),
    })
    stackOut.push(toolLayer)
    builtLayers.push({ radial, eps_r })
    r += radial
  }

  let mixRadius = Number(conductorOdMm) / 2
  let logTot = 0
  let weighted = 0
  builtLayers.forEach((layer) => {
    const nextRadius = mixRadius + layer.radial
    if (nextRadius > mixRadius && layer.eps_r > 0) {
      const dl = Math.log(nextRadius / mixRadius)
      logTot += dl
      weighted += dl / layer.eps_r
    }
    mixRadius = nextRadius
  })
  const finalOD = 2 * r
  const epsEff = weighted > 0 ? logTot / weighted : 1
  const vp = 1 / Math.sqrt(epsEff)
  const z0 = (60 / Math.sqrt(epsEff)) * Math.log(finalOD / Number(conductorOdMm))
  const predicted = {
    final_od_mm: round(finalOD, 4),
    target_dielectric_od_mm: targetOdMm ? round(targetOdMm, 4) : null,
    eps_eff: round(epsEff, 4),
    vp: round(vp, 4),
    z0_ohm: round(z0, 3),
    delta_z0: targetZ0 != null ? round(z0 - targetZ0, 2) : null,
    delta_vp: targetVp != null ? round(vp - targetVp, 4) : null,
  }
  const preflight = _makePreflightValidation({ predicted, targetZ0, targetVp, targetOdMm })
  return { stackOut, predicted, preflight }
}

async function designDielectricStack(input) {
  const rawInput = input || {}
  const overlapWasSpecified = rawInput.overlap != null && rawInput.overlap !== ''
  let { conductor_od_mm, conductor_od_inch, target_vp, target_z0_ohm,
        tape_part_number,
        tape_thickness_mm = 0.10, tape_width_mm = 0.635,
        overlap, tension_factor = 0.92, prefer = 'mix',
        tension_n = 4.0, line_speed_ft_min = 7,
        mi_number = 'MI-ST962-AUTO', finished_part_number = '',
        prepared_by = '', mi_date } = rawInput

  if (conductor_od_mm == null && conductor_od_inch == null) {
    throw new Error('Need conductor_od_mm or conductor_od_inch.')
  }
  const d = conductor_od_mm != null ? conductor_od_mm : conductor_od_inch * 25.4
  if (!(d > 0.05 && d < 30)) throw new Error('Conductor OD looks wrong (expected 0.05–30 mm).')
  const wrapGuidance = recommendPtfeWrapForCable({
    cableOdMm: d,
    tapeWidthMm: tape_width_mm,
    overlap: overlapWasSpecified ? overlap : '2/3',
  })
  const requestedOverlap = overlap
  overlap = overlapWasSpecified ? normalizePtfeWrap(overlap).key : wrapGuidance.overlap
  let smallCableWidthClamp = null
  if (wrapGuidance.smallCable && tape_width_mm / 25.4 >= SMALL_CABLE_MAX_PTFE_WIDTH_IN - 0.00001) {
    smallCableWidthClamp = {
      original_width_in: tape_width_mm / 25.4,
      clamped_width_in: SMALL_CABLE_MAX_PTFE_WIDTH_IN,
    }
    tape_width_mm = Math.max(0.001, (SMALL_CABLE_MAX_PTFE_WIDTH_IN - 0.0001) * 25.4)
  }

  // Manufacturing rule: small conductors (≤ 0.091" = 2.311 mm) can't take
  // tape thicker than 10 mil — it wrinkles and won't conform to the tight
  // radius. Auto-clamp + record a note.
  const MIL = 0.0254
  const SMALL_OD_MM = 0.091 * 25.4   // 2.3114
  const SMALL_MAX_TAPE_MM = 10 * MIL // 0.254
  let smallCableClamp = null
  if (d <= SMALL_OD_MM + 0.001 && tape_thickness_mm > SMALL_MAX_TAPE_MM + 0.0005) {
    smallCableClamp = {
      original_mil: tape_thickness_mm / MIL,
      clamped_mil: SMALL_MAX_TAPE_MM / MIL,
    }
    tape_thickness_mm = SMALL_MAX_TAPE_MM
  }

  const requestedTape = { thickness_mm: tape_thickness_mm, width_mm: tape_width_mm }
  const maxThicknessMil = d <= SMALL_OD_MM + 0.001 ? 10 : Infinity
  const baseDensityCode = String(prefer).toLowerCase() === 'ld' ? 'L' : 'H'
  const baseTape = findNearestPtfeTape({
    partNumber: tape_part_number,
    thicknessMm: tape_thickness_mm,
    widthMm: tape_width_mm,
    densityCode: baseDensityCode,
    maxThicknessMil,
    cableOdMm: d,
  })
  if (baseTape) {
    tape_thickness_mm = baseTape.thicknessMm
    tape_width_mm = baseTape.widthMm
  }

  const eps_HD = _densityToEps(1.6)
  const eps_LD = _densityToEps(0.7)
  const eps_solid = _PTFE_SOLID_EPS

  // Solve for εᵣ_eff and final OD
  let eps_target = null
  if (target_vp && target_vp > 0 && target_vp < 1) {
    eps_target = 1 / (target_vp * target_vp)
  }

  let logRatio = null  // ln(D/d)
  if (target_z0_ohm && eps_target) {
    // Z₀ = (60/√εᵣ) · ln(D/d)
    logRatio = (target_z0_ohm * Math.sqrt(eps_target)) / 60
  } else if (target_z0_ohm && !eps_target) {
    // Pick a sensible εᵣ (mid-mix) and report
    eps_target = (eps_HD + eps_LD) / 2
    logRatio = (target_z0_ohm * Math.sqrt(eps_target)) / 60
  } else if (eps_target && !target_z0_ohm) {
    // Default to 50 Ω
    target_z0_ohm = 50
    logRatio = (target_z0_ohm * Math.sqrt(eps_target)) / 60
  } else {
    // No targets — default to 50 Ω, εᵣ_target = εᵣ_HD
    eps_target = eps_HD
    target_z0_ohm = 50
    logRatio = (target_z0_ohm * Math.sqrt(eps_target)) / 60
  }
  if (!(logRatio > 0 && logRatio < 5)) throw new Error('Solved ln(D/d) is unrealistic — check targets.')

  const D_target = d * Math.exp(logRatio)
  const dielectricThk_target = (D_target - d) / 2  // radial thickness needed

  // Compute fraction of HD vs LD (by ln-radius weight) needed for εᵣ_target
  // 1/εᵣ_eff = f_HD/εᵣ_HD + (1-f_HD)/εᵣ_LD
  let mode = prefer
  let f_HD = 0.5
  if (mode === 'mix') {
    if (eps_target >= eps_HD) mode = 'hd'
    else if (eps_target <= eps_LD) mode = 'ld'
    else {
      f_HD = (1/eps_target - 1/eps_LD) / (1/eps_HD - 1/eps_LD)
      f_HD = Math.min(1, Math.max(0, f_HD))
    }
  }
  if (mode === 'hd') f_HD = 1
  if (mode === 'ld') f_HD = 0

  // Per-pass radial build
  const ovr = overlap
  const n_overlap = _overlapLayers(ovr)
  const t_per_pass = tape_thickness_mm * n_overlap * tension_factor
  const initialPitch = ptfeShopPitchSetpoint({
    cableOdMm: d,
    tapeWidthMm: tape_width_mm,
    overlap: ovr,
    densityCode: baseDensityCode,
  })
  const requestedPitchMm = initialPitch.calculatedPitchMm
  const pitchSetpointMm = initialPitch.pitchMm
  const pitchLimitedByWtm = initialPitch.pitchLimited
  if (t_per_pass <= 0) throw new Error('Per-pass thickness is zero.')

  // Pick integer WTM passes by dry-running the same Z0/VP/OD calculation the
  // RF stack view uses. This avoids handing out an Apply preset that is visibly
  // low on dielectric OD and therefore low on impedance.
  const passPlan = _findBestTapePassPlan({
    conductorOdMm: d,
    tapeThicknessMm: tape_thickness_mm,
    overlap: ovr,
    tensionFactor: tension_factor,
    targetZ0: target_z0_ohm,
    targetVp: target_vp,
    targetOdMm: D_target,
    mode,
    fHD,
    dielectricThkTarget: dielectricThk_target,
  })
  const HD_passes = Math.max(0, Math.round(passPlan.hdPasses || 0))
  const LD_passes = Math.max(0, Math.round(passPlan.ldPasses || 0))

  // Build the layer recipe (HD goes inside since high-εᵣ closer to conductor lowers loss
  // contribution from peripheral E-field; LD outside lifts VP)
  const layers = []
  const makeMaterialLayer = (preset, density, passes) => {
    const tape = findNearestPtfeTape({
      thicknessMm: tape_thickness_mm,
      widthMm: tape_width_mm,
      densityCode: density >= 1.1 ? 'H' : 'L',
      maxThicknessMil,
      cableOdMm: d,
    })
    return ptfeTapeToToolLayer(tape, {
      preset,
      overlap: ovr,
      tension_factor,
      passes,
    })
  }
  if (HD_passes > 0) layers.push(makeMaterialLayer('high_density', 1.6, HD_passes))
  if (LD_passes > 0) layers.push(makeMaterialLayer('low_density', 0.7, LD_passes))
  // If everything rounded to zero (very thin dielectric), force at least one pass
  if (layers.length === 0) {
    layers.push(makeMaterialLayer('high_density', 1.6, 1))
  }

  // Predict actual achieved geometry from the chosen integer passes
  let r = d / 2
  const stackOut = []
  for (const L of layers) {
    const odBeforeMm = 2 * r
    const pitchInfo = ptfeShopPitchSetpoint({
      cableOdMm: odBeforeMm,
      tapeWidthMm: L.tape_width_mm,
      overlap: L.overlap,
      densityCode: L.density_code,
      density: L.density,
      partNumber: L.part_number,
    })
    const t_total = L.tape_thickness_mm * _overlapLayers(L.overlap) * L.tension_factor * L.passes
    const eps_r = _densityToEps(L.density)
    stackOut.push({
      preset: L.preset,
      part_number: L.part_number,
      material_id: L.material_id,
      density_code: L.density_code,
      density_label: L.density_label,
      density: L.density,
      overlap: L.overlap,
      overlap_pct: normalizePtfeWrap(L.overlap).percent,
      tension_factor: L.tension_factor,
      passes: L.passes,
      tape_thickness_mm: round(L.tape_thickness_mm, 4),
      tape_thickness_mil: L.tape_thickness_mil,
      tape_width_mm: round(L.tape_width_mm, 3),
      tape_width_in: L.tape_width_in,
      OD_before_mm: round(odBeforeMm, 4),
      pitch_setpoint_in: round(pitchInfo.pitchIn, 4),
      pitch_setpoint_mm: round(pitchInfo.pitchMm, 4),
      requested_pitch_in: round(pitchInfo.calculatedPitchIn, 4),
      requested_pitch_mm: round(pitchInfo.calculatedPitchMm, 4),
      pitch_limited_by_wtm: pitchInfo.pitchLimited,
      thickness_mm: round(t_total, 4), eps_r: round(eps_r, 4),
      OD_after_mm: round(2 * (r + t_total), 4),
    })
    r += t_total
  }
  const finalOD = 2 * r
  let logTot = 0, weighted = 0
  let r2 = d / 2
  for (const L of layers) {
    const t = L.tape_thickness_mm * _overlapLayers(L.overlap) * L.tension_factor * L.passes
    const r3 = r2 + t
    const dl = Math.log(r3 / r2)
    logTot += dl
    weighted += dl / _densityToEps(L.density)
    r2 = r3
  }
  const eps_eff_actual = weighted > 0 ? logTot / weighted : 1
  const VP_actual = 1 / Math.sqrt(eps_eff_actual)
  const Z0_actual = (60 / Math.sqrt(eps_eff_actual)) * Math.log(finalOD / d)

  // Predict tape Bragg notches
  const notch1 = (() => {
    const P_axial = pitchSetpointMm
    if (P_axial <= 0) return null
    const f_GHz = (299792458 * VP_actual) / (2 * P_axial * 1e-3 * 1e9)
    return round(f_GHz, 2)
  })()

  const selectedParts = Array.from(new Set(layers.map((L) => L.part_number).filter(Boolean)))
  const snappedTape = baseTape && (
    Math.abs(baseTape.thicknessMm - requestedTape.thickness_mm) > 0.002
    || Math.abs(baseTape.widthMm - requestedTape.width_mm) > 0.2
  )

  const predicted = {
    final_od_mm: round(finalOD, 4),
    target_dielectric_od_mm: round(D_target, 4),
    eps_eff: round(eps_eff_actual, 4),
    vp: round(VP_actual, 4),
    z0_ohm: round(Z0_actual, 3),
    delta_z0: round(Z0_actual - (target_z0_ohm || 0), 2),
    delta_vp: target_vp != null ? round(VP_actual - target_vp, 4) : null,
    bragg_notch_1_ghz: notch1,
  }
  const preflight = _makePreflightValidation({
    predicted,
    targetZ0: target_z0_ohm,
    targetVp: target_vp,
    targetOdMm: D_target,
  })
  const machineGuard = _machineRuleGuardForRecipe({ conductorOdMm: d, layers: stackOut, requireDielectric: true })
  const tolerance = _toleranceForRecipe({ conductorOdMm: d, predicted })
  const targetSummary = `${target_z0_ohm ? `${round(target_z0_ohm, 2)} ohm` : ''}${target_vp ? ` ${round(target_vp * 100, 1)}% VP` : ''} conductor ${round(d / 25.4, 4)} in`.trim()
  const miWorkbook = await makePtfeMiWorkbook({
    miNumber: mi_number || 'MI-ST962-AUTO',
    partNumber: finished_part_number || '',
    by: prepared_by || '',
    date: mi_date || new Date().toLocaleDateString('en-US'),
    targetSummary,
    conductorOdMm: d,
    layers,
    overlap,
    tensionN: tension_n,
    lineSpeedFtMin: line_speed_ft_min,
    predicted,
  })
  const miQa = _miQaForRecipe({ miWorkbook, layers: stackOut })
  const miRenderQa = _miRenderQaForRecipe({ miWorkbook, conductorOdMm: d, layers: stackOut, overlap, tensionN: tension_n, lineSpeedFtMin: line_speed_ft_min, miNumber: mi_number || 'MI-ST962-AUTO' })
  const safetyAudit = _safetyAuditForResult({ preflight, machineGuard, tolerance, miQa })
  const guardedPreflight = _combinePreflightWithAudit(preflight, safetyAudit)
  const calibrationHint = _calibrationHintForRecipe({ conductorOdMm: d, layers: stackOut, predicted })
  const miFilename = `${String(mi_number || 'MI-ST962-AUTO').replace(/[^a-z0-9._-]+/gi, '-')}-${round(d / 25.4, 4)}in-${Math.round((target_vp || VP_actual) * 100)}vp.${miWorkbook.extension || 'xlsx'}`

  return {
    targets: {
      conductor_od_mm: round(d, 4),
      target_vp: target_vp != null ? round(target_vp, 3) : null,
      target_z0_ohm: target_z0_ohm != null ? round(target_z0_ohm, 2) : null,
      eps_target: round(eps_target, 3),
      dielectric_od_mm: round(D_target, 4),
    },
    composition: {
      mode,
      f_HD_by_log_radius: round(f_HD, 3),
      eps_HD: round(eps_HD, 3),
      eps_LD: round(eps_LD, 3),
    },
    layers: stackOut,
    predicted,
    _preflight: guardedPreflight,
    _machine_guard: machineGuard,
    _tolerance: tolerance,
    _mi_qa: miQa,
    _mi_render_qa: miRenderQa,
    _safety_audit: safetyAudit,
    _calibration_hint: calibrationHint,
    label: `${target_z0_ohm ? `${target_z0_ohm} Ω` : ''}${target_vp ? ` · ${(target_vp*100).toFixed(0)}% VP` : ''} · d=${d.toFixed(3)} mm`.trim(),
    _section: 'stack',
    ...(guardedPreflight.allow_apply ? { _apply_preset: {
      conductor_od_mm: round(d, 4),
      target_z0: target_z0_ohm,
      layers: stackOut.map((L) => ({
        preset: L.preset,
        part_number: L.part_number,
        material_id: L.material_id,
        density_code: L.density_code,
        density_label: L.density_label,
        density: L.density,
        tape_thickness_mm: L.tape_thickness_mm,
        tape_thickness_mil: L.tape_thickness_mil,
        tape_width_mm: L.tape_width_mm,
        tape_width_in: L.tape_width_in,
        pitch_setpoint_mm: L.pitch_setpoint_mm,
        pitch_setpoint_in: L.pitch_setpoint_in,
        OD_after_mm: L.OD_after_mm,
        OD_before_mm: L.OD_before_mm,
        overlap: L.overlap,
        tension_factor: L.tension_factor,
        passes: L.passes,
      })),
    } } : { _apply_blocked: guardedPreflight.message }),
    _download: {
      filename: miFilename,
      mime: miWorkbook.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(miWorkbook.base64 ? { base64: miWorkbook.base64 } : { text: miWorkbook.text || '' }),
      label: 'Download filled MI Excel',
    },
    notes: [
      selectedParts.length
        ? `Material Library: selected ${selectedParts.join(', ')} from the 962-96000 PTFE tape catalog.`
        : null,
      miWorkbook.template === 'MI-ST962-032-130.xlsx'
        ? `MI workbook uses shop template ${miWorkbook.template}; filled ${miWorkbook.filledTapingEntries || 0} taping station row${miWorkbook.filledTapingEntries === 1 ? '' : 's'} with tape, OD after tape, pitch set-point, and tension.`
        : null,
      miWorkbook.omittedTapingEntries
        ? `MI template has two 3-bay taping sheets, so ${miWorkbook.omittedTapingEntries} extra taping pass${miWorkbook.omittedTapingEntries === 1 ? '' : 'es'} were kept in the JSON recipe but not placed in the shop MI workbook.`
        : null,
      miWorkbook.warning || null,
      `Preflight: target dielectric OD ${D_target.toFixed(3)} mm; dry-run recipe gives ${finalOD.toFixed(3)} mm, ${Z0_actual.toFixed(1)} ohm, ${(VP_actual * 100).toFixed(1)}% VP.`,
      `MI render QA: ${miRenderQa.message}`,
      calibrationHint.sample_count
        ? `Calibration Memory: ${calibrationHint.message} Calibrated prediction ${calibrationHint.calibrated_prediction.z0_ohm} ohm, ${calibrationHint.calibrated_prediction.vp_pct}% VP, OD ${calibrationHint.calibrated_prediction.final_od_mm} mm.`
        : calibrationHint.message,
      !guardedPreflight.allow_apply
        ? 'Apply is held until the recipe matches the RF stack calculator targets closely enough.'
        : null,
      snappedTape
        ? `Tape request snapped to stocked material: ${baseTape.partNumber} (${baseTape.thicknessMil} mil, ${baseTape.densityCode}, ${baseTape.widthIn.toFixed(3)} in).`
        : null,
      smallCableClamp
        ? `⚠ Small-conductor rule: d=${(d/25.4).toFixed(3)}" ≤ 0.091". Auto-clamped tape from ${smallCableClamp.original_mil.toFixed(1)} mil → ${smallCableClamp.clamped_mil.toFixed(1)} mil (thicker tape wrinkles on tight radii).`
        : null,
      smallCableWidthClamp
        ? `Small-cable taping rule: OD ${(d / 25.4).toFixed(4)}" ≤ ${SMALL_CABLE_TAPE_OD_IN.toFixed(3)}"; avoided ${smallCableWidthClamp.original_width_in.toFixed(4)}" PTFE tape and selected stocked tape below ${smallCableWidthClamp.clamped_width_in.toFixed(4)}".`
        : null,
      !overlapWasSpecified
        ? 'PTFE taping rule: defaulted to 2/3 wrap to reduce shrink-back. Use 1/2 wrap only when the target OD requires the lower single-pass build; one 2/3 wrap builds 3 tape thicknesses, smaller than two 1/2 wraps at 4 tape thicknesses.'
        : null,
      pitchLimitedByWtm
        ? `WTM taping-head rule: calculated pitch ${(requestedPitchMm / 25.4).toFixed(4)} in/rev is below the machine minimum, so MI pitch set-point is clamped to ${WTM_MIN_TAPING_PITCH_IN.toFixed(4)} in/rev.`
        : null,
      overlapWasSpecified && requestedOverlap !== overlap
        ? `PTFE wrap snapped to stocked shop setting: ${normalizePtfeWrap(requestedOverlap).percent}% (${overlap}). Valid PTFE settings are 50%, 66.7%, and 75%.`
        : null,
      mode === 'mix' && f_HD > 0 && f_HD < 1
        ? `HD inside (${(f_HD*100).toFixed(0)}% of log-radius), LD outside lowers VP-weighted losses while lifting VP.`
        : mode === 'hd' ? 'All HD — εᵣ_target ≥ εᵣ_HD, can\'t go higher with PTFE.'
        : mode === 'ld' ? 'All LD — εᵣ_target ≤ εᵣ_LD, can\'t go lower without ePTFE.'
        : null,
      Math.abs(Z0_actual - (target_z0_ohm || 0)) > 1
        ? `Achieved Z₀ ${Z0_actual.toFixed(1)} Ω is off target by ${(Z0_actual - (target_z0_ohm || 0)).toFixed(1)} Ω due to integer-pass rounding. Tune tension or tape thickness in the UI to dial it in.`
        : null,
      notch1 && notch1 < 40
        ? `First Bragg notch from ${ovr} wrap with ${tape_width_mm.toFixed(2)} mm (${(tape_width_mm / MIL).toFixed(0)} mil) tape and ${pitchSetpointMm.toFixed(3)} mm pitch predicted at ~${notch1} GHz. Use compute_tape_notches for full harmonic table.`
        : null,
    ].filter(Boolean),
  }
}

function _resolveModeForTarget(prefer, epsTarget) {
  let mode = String(prefer || 'mix').toLowerCase()
  const epsHD = _densityToEps(1.6)
  const epsLD = _densityToEps(0.7)
  let fHD = 0.5
  if (mode === 'mix') {
    if (epsTarget >= epsHD) mode = 'hd'
    else if (epsTarget <= epsLD) mode = 'ld'
    else {
      fHD = (1 / epsTarget - 1 / epsLD) / (1 / epsHD - 1 / epsLD)
      fHD = Math.min(1, Math.max(0, fHD))
    }
  }
  if (mode === 'hd') fHD = 1
  if (mode === 'ld') fHD = 0
  return { mode, fHD, epsHD, epsLD }
}

function _ptfePhysicalCandidates(input = {}, conductorOdMm) {
  const requestedPart = findPtfeTapeByPart(input.tape_part_number || input.part_number)
  const smallCable = conductorOdMm / 25.4 <= SMALL_CABLE_TAPE_OD_IN + 0.00001
  const maxThicknessMil = conductorOdMm <= 0.091 * 25.4 + 0.001 ? 10 : Infinity
  const map = new Map()
  PTFE_TAPE_MATERIALS.forEach((tape) => {
    if (requestedPart && tape.thicknessMil !== requestedPart.thicknessMil) return
    if (requestedPart && Math.abs(tape.widthIn - requestedPart.widthIn) > 0.00001) return
    if (tape.thicknessMil > maxThicknessMil + 0.0001) return
    if (smallCable && tape.widthIn >= SMALL_CABLE_MAX_PTFE_WIDTH_IN - 0.00001) return
    const key = `${tape.thicknessMil}-${tape.widthIn.toFixed(5)}`
    const existing = map.get(key) || {
      thicknessMil: tape.thicknessMil,
      thicknessMm: tape.thicknessMm,
      widthIn: tape.widthIn,
      widthMm: tape.widthMm,
      densities: new Set(),
    }
    existing.densities.add(tape.densityCode)
    map.set(key, existing)
  })

  const desiredThicknessMm = Number(input.tape_thickness_mm)
  const desiredWidthMm = Number(input.tape_width_mm)
  return Array.from(map.values())
    .map((item) => {
      const thicknessPenalty = Number.isFinite(desiredThicknessMm) ? Math.abs(item.thicknessMm - desiredThicknessMm) * 4 : 0
      const widthPenalty = Number.isFinite(desiredWidthMm) ? Math.abs(item.widthMm - desiredWidthMm) : 0
      const densityPenalty = item.densities.has('H') && item.densities.has('L') ? 0 : 1.5
      return { ...item, score: thicknessPenalty + widthPenalty + densityPenalty }
    })
    .sort((a, b) => a.score - b.score || a.thicknessMil - b.thicknessMil || a.widthMm - b.widthMm)
}

function _layersFromPassPlan({ candidate, overlap, tensionFactor, hdPasses, ldPasses, conductorOdMm }) {
  const layers = []
  if (hdPasses > 0) {
    const tape = findNearestPtfeTape({
      thicknessMm: candidate.thicknessMm,
      widthMm: candidate.widthMm,
      densityCode: 'H',
      cableOdMm: conductorOdMm,
    })
    layers.push(ptfeTapeToToolLayer(tape, {
      preset: 'high_density',
      overlap,
      tension_factor: tensionFactor,
      passes: hdPasses,
    }))
  }
  if (ldPasses > 0) {
    const tape = findNearestPtfeTape({
      thicknessMm: candidate.thicknessMm,
      widthMm: candidate.widthMm,
      densityCode: 'L',
      cableOdMm: conductorOdMm,
    })
    layers.push(ptfeTapeToToolLayer(tape, {
      preset: 'low_density',
      overlap,
      tension_factor: tensionFactor,
      passes: ldPasses,
    }))
  }
  return layers
}

function _preflightScore(preflight) {
  if (!preflight?.checks?.length) return 0
  return preflight.checks.reduce((sum, check) => {
    const tolerance = Number(check.tolerance) || 1
    return sum + Math.pow((Number(check.delta) || 0) / tolerance, 2)
  }, 0)
}

function optimizeDielectricStack(input) {
  const raw = input || {}
  const targets = _resolveDielectricTargets(raw)
  const { mode, fHD, epsHD, epsLD } = _resolveModeForTarget(raw.prefer, targets.epsTarget)
  const wraps = raw.overlap
    ? [normalizePtfeWrap(raw.overlap).key]
    : Array.isArray(raw.allowed_wraps) && raw.allowed_wraps.length
      ? Array.from(new Set(raw.allowed_wraps.map((item) => normalizePtfeWrap(item).key)))
      : ['2/3', '1/2', '3/4']
  const tensionFactors = raw.tension_factor != null
    ? [_clamp(Number(raw.tension_factor) || 0.92, 0.65, 1.05)]
    : [0.88, 0.9, 0.92, 0.94, 0.96, 1.0]
  const candidates = _ptfePhysicalCandidates(raw, targets.conductorOdMm)
  if (!candidates.length) throw new Error('No stocked PTFE tape candidates match the requested constraints.')

  const dielectricThkTarget = targets.targetOdMm
    ? Math.max(0.001, (targets.targetOdMm - targets.conductorOdMm) / 2)
    : Math.max(0.001, targets.conductorOdMm * 0.5)
  const ranked = []
  candidates.forEach((candidate) => {
    wraps.forEach((overlap) => {
      tensionFactors.forEach((tensionFactor) => {
        const plan = _findBestTapePassPlan({
          conductorOdMm: targets.conductorOdMm,
          tapeThicknessMm: candidate.thicknessMm,
          overlap,
          tensionFactor,
          targetZ0: targets.targetZ0,
          targetVp: targets.targetVp,
          targetOdMm: targets.targetOdMm,
          mode,
          fHD,
          dielectricThkTarget,
        })
        const layers = _layersFromPassPlan({
          candidate,
          overlap,
          tensionFactor,
          hdPasses: Math.max(0, Math.round(plan.hdPasses || 0)),
          ldPasses: Math.max(0, Math.round(plan.ldPasses || 0)),
          conductorOdMm: targets.conductorOdMm,
        })
        const evaluated = _simulatePtfeRecipe({
          conductorOdMm: targets.conductorOdMm,
          layers,
          targetZ0: targets.targetZ0,
          targetVp: targets.targetVp,
          targetOdMm: targets.targetOdMm,
        })
        const totalPasses = layers.reduce((sum, layer) => sum + (Number(layer.passes) || 0), 0)
        const score = _preflightScore(evaluated.preflight)
          + totalPasses * 0.015
          + (overlap === '2/3' ? 0 : 0.2)
          + candidate.score * 0.02
        ranked.push({ score, candidate, overlap, tensionFactor, totalPasses, layers: evaluated.stackOut, predicted: evaluated.predicted, preflight: evaluated.preflight })
      })
    })
  })
  ranked.sort((a, b) => a.score - b.score)
  const best = ranked[0]
  const limit = Math.max(1, Math.min(12, Math.round(Number(raw.max_candidates) || 5)))
  const options = ranked.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    score: round(item.score, 3),
    tape: {
      thickness_mil: item.candidate.thicknessMil,
      width_in: round(item.candidate.widthIn, 4),
      width_mm: round(item.candidate.widthMm, 3),
    },
    overlap: item.overlap,
    tension_factor: round(item.tensionFactor, 3),
    total_passes: item.totalPasses,
    hd_passes: item.layers.find((layer) => layer.density_code === 'H')?.passes || 0,
    ld_passes: item.layers.find((layer) => layer.density_code === 'L')?.passes || 0,
    predicted: item.predicted,
    preflight_status: item.preflight.status,
  }))
  const machineGuard = _machineRuleGuardForRecipe({ conductorOdMm: targets.conductorOdMm, layers: best.layers, requireDielectric: true })
  const tolerance = _toleranceForRecipe({ conductorOdMm: targets.conductorOdMm, predicted: best.predicted })
  const miQa = _miQaForRecipe({ layers: best.layers })
  const miRenderQa = _miRenderQaForRecipe({ miWorkbook: {}, conductorOdMm: targets.conductorOdMm, layers: best.layers })
  const safetyAudit = _safetyAuditForResult({ preflight: best.preflight, machineGuard, tolerance, miQa })
  const guardedPreflight = _combinePreflightWithAudit(best.preflight, safetyAudit)
  const calibrationHint = _calibrationHintForRecipe({ conductorOdMm: targets.conductorOdMm, layers: best.layers, predicted: best.predicted })

  return {
    targets: {
      conductor_od_mm: round(targets.conductorOdMm, 4),
      target_z0_ohm: targets.targetZ0 != null ? round(targets.targetZ0, 2) : null,
      target_vp: targets.targetVp != null ? round(targets.targetVp, 4) : null,
      target_dielectric_od_mm: targets.targetOdMm ? round(targets.targetOdMm, 4) : null,
    },
    search: {
      tapes_checked: candidates.length,
      wraps,
      tension_factors: tensionFactors,
      mode,
      f_HD_by_log_radius: round(fHD, 3),
      eps_HD: round(epsHD, 3),
      eps_LD: round(epsLD, 3),
    },
    recommended: options[0],
    candidates: options,
    layers: best.layers,
    predicted: best.predicted,
    _preflight: guardedPreflight,
    _machine_guard: machineGuard,
    _tolerance: tolerance,
    _mi_qa: miQa,
    _mi_render_qa: miRenderQa,
    _safety_audit: safetyAudit,
    _calibration_hint: calibrationHint,
    label: `Optimized ${targets.targetZ0 || ''} Ω ${targets.targetVp ? `${round(targets.targetVp * 100, 1)}% VP` : ''}`.trim(),
    _section: 'stack',
    ...(guardedPreflight.allow_apply ? { _apply_preset: _stackApplyPreset(targets.conductorOdMm, targets.targetZ0, best.layers) } : { _apply_blocked: guardedPreflight.message }),
    notes: [
      `Optimizer checked ${ranked.length} tape/wrap/tension combinations using stocked 962-96000 PTFE tape.`,
      guardedPreflight.allow_apply
        ? 'Best candidate passed RF Stack Lab preflight; Apply is enabled.'
        : 'Best candidate is still outside tolerance; Apply is held. Consider a different tape thickness, tension target, or measured OD constraint.',
      calibrationHint.sample_count
        ? `Calibration Memory: ${calibrationHint.message} Calibrated best candidate ${calibrationHint.calibrated_prediction.z0_ohm} ohm, ${calibrationHint.calibrated_prediction.vp_pct}% VP.`
        : calibrationHint.message,
      `MI render QA: ${miRenderQa.message}`,
      'For a printable MI, call design_dielectric_stack with the recommended tape/wrap/tension settings after choosing the candidate.',
    ],
  }
}

function validateRecipeAgainstRfStack(input) {
  const raw = input || {}
  const targets = _resolveDielectricTargets(raw)
  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    throw new Error('layers[] is required for validation.')
  }
  const evaluated = _simulatePtfeRecipe({
    conductorOdMm: targets.conductorOdMm,
    layers: raw.layers,
    targetZ0: targets.targetZ0,
    targetVp: targets.targetVp,
    targetOdMm: targets.targetOdMm,
    useOdAfterOverrides: Boolean(raw.use_od_after_overrides),
  })
  const machineGuard = _machineRuleGuardForRecipe({ conductorOdMm: targets.conductorOdMm, layers: evaluated.stackOut, requireDielectric: true })
  const tolerance = _toleranceForRecipe({ conductorOdMm: targets.conductorOdMm, predicted: evaluated.predicted })
  const miQa = _miQaForRecipe({ layers: evaluated.stackOut })
  const miRenderQa = _miRenderQaForRecipe({ miWorkbook: {}, conductorOdMm: targets.conductorOdMm, layers: evaluated.stackOut })
  const safetyAudit = _safetyAuditForResult({ preflight: evaluated.preflight, machineGuard, tolerance, miQa })
  const guardedPreflight = _combinePreflightWithAudit(evaluated.preflight, safetyAudit)
  const calibrationHint = _calibrationHintForRecipe({ conductorOdMm: targets.conductorOdMm, layers: evaluated.stackOut, predicted: evaluated.predicted })
  return {
    targets: {
      conductor_od_mm: round(targets.conductorOdMm, 4),
      target_z0_ohm: targets.targetZ0 != null ? round(targets.targetZ0, 2) : null,
      target_vp: targets.targetVp != null ? round(targets.targetVp, 4) : null,
      target_dielectric_od_mm: targets.targetOdMm ? round(targets.targetOdMm, 4) : null,
    },
    layers: evaluated.stackOut,
    predicted: evaluated.predicted,
    _preflight: guardedPreflight,
    _machine_guard: machineGuard,
    _tolerance: tolerance,
    _mi_qa: miQa,
    _mi_render_qa: miRenderQa,
    _safety_audit: safetyAudit,
    _calibration_hint: calibrationHint,
    label: `Validated ${evaluated.predicted.z0_ohm} Ω · ${(evaluated.predicted.vp * 100).toFixed(1)}% VP`,
    _section: 'stack',
    ...(guardedPreflight.allow_apply ? { _apply_preset: _stackApplyPreset(targets.conductorOdMm, targets.targetZ0, evaluated.stackOut) } : { _apply_blocked: guardedPreflight.message }),
    notes: [
      guardedPreflight.allow_apply
        ? 'Recipe passed RF Stack Lab validation; Apply is enabled.'
        : 'Recipe failed RF Stack Lab validation; Apply is held until Z0/VP/dielectric OD are corrected.',
      raw.use_od_after_overrides
        ? 'Validation used provided OD_after values as measured overrides.'
        : 'Validation independently calculated OD from tape thickness, wrap, tension, and passes.',
      calibrationHint.sample_count
        ? `Calibration Memory: ${calibrationHint.message} Calibrated validation ${calibrationHint.calibrated_prediction.z0_ohm} ohm, ${calibrationHint.calibrated_prediction.vp_pct}% VP.`
        : calibrationHint.message,
      `MI render QA: ${miRenderQa.message}`,
    ],
  }
}

function designShieldStack(input) {
  const raw = input || {}
  const dielectricOdMm = _finiteNumber(raw.dielectric_od_mm ?? raw.dielectricOdMm, (
    raw.dielectric_od_inch != null ? _finiteNumber(raw.dielectric_od_inch) * 25.4
      : raw.dielectricOdIn != null ? _finiteNumber(raw.dielectricOdIn) * 25.4
        : NaN
  ))
  if (!(dielectricOdMm > 0.05 && dielectricOdMm < 100)) {
    throw new Error('Need dielectric_od_mm or dielectric_od_inch for the shield stack.')
  }

  const requests = _normaliseShieldRequests(raw)
  const steps = []
  const applyLayers = []
  let currentOdMm = dielectricOdMm
  const seen = { spiral: null, foil: null, braid: null }

  for (const req of requests) {
    if (req.type === 'spiral') {
      const layer = _designSpiralShield(req, raw, currentOdMm)
      currentOdMm = layer.od_after_mm
      seen.spiral = layer
      layer.step.layer = steps.length + 1
      steps.push(layer.step)
      applyLayers.push(layer.apply)
    } else if (req.type === 'foil') {
      const layer = _designFoilShield(req, raw, currentOdMm)
      currentOdMm = layer.od_after_mm
      seen.foil = layer
      layer.step.layer = steps.length + 1
      steps.push(layer.step)
      applyLayers.push(layer.apply)
    } else if (req.type === 'flatwire') {
      const layer = _designHelicalFlatwireShield(req, raw, currentOdMm)
      currentOdMm = layer.od_after_mm
      layer.step.layer = steps.length + 1
      steps.push(layer.step)
      applyLayers.push(layer.apply)
    } else if (req.type === 'braid') {
      const layer = _designBraidShield(req, raw, currentOdMm)
      currentOdMm = layer.od_after_mm
      seen.braid = layer
      layer.step.layer = steps.length + 1
      steps.push(layer.step)
      applyLayers.push(layer.apply)
    } else if (req.type === 'jacket') {
      const jacketOdMm = _finiteNumber(req.od_mm ?? raw.jacket_od_mm ?? raw.jacketOdMm)
      if (jacketOdMm > currentOdMm) {
        const apply = {
          type: 'jacket',
          label: 'Jacket',
          od: round(jacketOdMm, 3),
          opacity: 0.82,
        }
        steps.push({
          layer: steps.length + 1,
          type: 'jacket',
          od_before_mm: round(currentOdMm, 4),
          od_after_mm: round(jacketOdMm, 4),
          jacket_wall_mm: round((jacketOdMm - currentOdMm) / 2, 4),
        })
        currentOdMm = jacketOdMm
        applyLayers.push(apply)
      }
    }
  }

  const se = predictShieldingEffectiveness({
    freq_mhz: _finiteNumber(raw.freq_mhz, 1000),
    foil_overlap_pct: seen.foil?.step?.overlap_pct || 0,
    braid_coverage_pct: seen.braid?.step?.coverage_pct || 0,
    spiral_gap_pct: seen.spiral?.step?.actual_gap_pct ?? seen.spiral?.step?.gap_pct ?? 100,
    layer_count: steps.filter((step) => step.type !== 'jacket').length,
  })
  const machineGuard = _machineRuleGuardForRecipe({ shieldLayers: applyLayers })
  const tolerance = {
    rows: [
      { label: 'Final shield OD worst case', min: round((currentOdMm - Math.max(0.04, currentOdMm * 0.01)), 4), nom: round(currentOdMm, 4), max: round((currentOdMm + Math.max(0.04, currentOdMm * 0.01)), 4), unit: 'mm', level: 'info' },
      { label: 'Shielding estimate window', min: round((se.se_db || 0) - 4, 1), nom: round(se.se_db || 0, 1), max: round((se.se_db || 0) + 2, 1), unit: 'dB', level: 'info' },
    ],
    assumptions: { shield_od_tol_pct: 1, shielding_estimate_db: '-4/+2' },
  }
  const miQa = _miQaForRecipe({ layers: [], shieldLayers: applyLayers, requirePtfe: false })
  const basePreflight = {
    status: machineGuard.blocks.length ? 'blocked' : 'pass',
    allow_apply: machineGuard.blocks.length === 0,
    checks: machineGuard.checks,
    message: machineGuard.blocks.length ? 'Shield stack has blocking machine-rule issues.' : 'Shield machine-rule guard passed.',
  }
  const safetyAudit = _safetyAuditForResult({ preflight: basePreflight, machineGuard, tolerance, miQa })
  const guardedPreflight = _combinePreflightWithAudit(basePreflight, safetyAudit)

  return {
    dielectric_od_mm: round(dielectricOdMm, 4),
    dielectric_od_in: round(dielectricOdMm / 25.4, 5),
    final_shield_od_mm: round(currentOdMm, 4),
    final_shield_od_in: round(currentOdMm / 25.4, 5),
    shield_layers: steps,
    braid_setup: seen.braid?.step?.braid_setup || null,
    shielding_estimate: se,
    label: `${steps.map((step) => step.type).join(' + ') || 'shield'} OD ${round(currentOdMm / 25.4, 4)} in`,
    _section: 'stack',
    _preflight: guardedPreflight,
    _machine_guard: machineGuard,
    _tolerance: tolerance,
    _mi_qa: miQa,
    _safety_audit: safetyAudit,
    ...(guardedPreflight.allow_apply ? { _apply_preset: {
      dielectric_od_mm: round(dielectricOdMm, 4),
      shield_layers: applyLayers,
      jacket_od_mm: applyLayers.find((layer) => layer.type === 'jacket')?.od || null,
    } } : { _apply_blocked: guardedPreflight.message }),
    notes: [
      seen.spiral
        ? `SPC spiral rule applied: dielectric OD × pi / ${seen.spiral.step.bobbins} bobbins × ${(100 - seen.spiral.step.gap_pct).toFixed(1)}% coverage. Requested ${seen.spiral.step.gap_pct}% gap; selected ${seen.spiral.step.part_number} gives ${seen.spiral.step.actual_gap_pct}% actual gap.`
        : null,
      seen.braid
        ? `Braid setup is estimated from SCTE-style coverage math K=(2F-F^2)×100 using ${seen.braid.step.braid_setup.carriers} carriers, ${seen.braid.step.braid_setup.ends_per_carrier} ends/carrier, AWG ${seen.braid.step.braid_setup.wire_awg}, and ${seen.braid.step.braid_setup.picks_per_in} picks/in.`
        : null,
      'Click Apply to fill these shield layers into RF Stack Lab. Use measured OD feedback from the line to fine-tune braid compression and final jacket OD.',
    ].filter(Boolean),
  }
}

function _normaliseShieldRequests(raw) {
  const explicit = Array.isArray(raw.shield_layers) && raw.shield_layers.length
    ? raw.shield_layers
    : Array.isArray(raw.layers) && raw.layers.length
      ? raw.layers
      : null

  if (explicit) {
    return explicit
      .map((item) => (typeof item === 'string'
        ? { type: _normaliseShieldType(item) }
        : { ...(item || {}), type: _normaliseShieldType(item?.type || item?.shield || item?.kind || item?.name) }))
      .filter((item) => item.type && item.type !== 'none')
  }

  const first = _normaliseShieldType(raw.first_shield || raw.firstShield || 'spiral')
  const second = _normaliseShieldType(raw.second_shield || raw.secondShield || (_settingIsFalse(raw.include_foil) ? 'none' : 'foil'))
  const includeBraid = raw.include_braid == null ? true : !_settingIsFalse(raw.include_braid)
  const includeJacket = raw.jacket_od_mm != null || _settingIsTrue(raw.include_jacket)
  return [
    first ? { type: first } : null,
    second && second !== first ? { type: second } : null,
    includeBraid ? { type: 'braid' } : null,
    includeJacket ? { type: 'jacket', od_mm: raw.jacket_od_mm } : null,
  ].filter(Boolean)
}

function _finiteNumber(value, fallback = NaN) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '')
    const n = Number(cleaned)
    if (Number.isFinite(n)) return n
    const parsed = parseFloat(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function _settingIsFalse(value) {
  if (value === false) return true
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'false' || text === '0' || text === 'no' || text === 'none'
}

function _settingIsTrue(value) {
  if (value === true) return true
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'yes'
}

function _normaliseShieldType(value) {
  const t = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!t || t === 'none' || t === 'no' || t === 'false') return 'none'
  if (t.includes('spiral')) return 'spiral'
  if (t.includes('foil')) return 'foil'
  if (t.includes('helical') || t.includes('flatwire')) return 'flatwire'
  if (t.includes('braid')) return 'braid'
  if (t.includes('jacket') || t.includes('extrusion')) return 'jacket'
  return t
}

function _designSpiralShield(req, raw, odBeforeMm) {
  const bobbins = Math.max(1, Math.min(24, Math.round(_finiteNumber(req.bobbins ?? raw.spiral_bobbins ?? raw.spiralBobbins, DEFAULT_SPIRAL_BOBBINS))))
  const gapPct = _clamp(_finiteNumber(req.gap_pct ?? req.gap ?? raw.spiral_gap_pct ?? raw.spiralGapPct, DEFAULT_SPIRAL_GAP_PCT), 0, 50)
  const widthRule = spiralFlatwireWidthFromDielectricOd({ dielectricOdMm: odBeforeMm, bobbins, gapPct })
  const material = findNearestSpcFlatwire({
    partNumber: req.part_number || req.partNumber || raw.spiral_part_number,
    use: 'spiral',
    thicknessMil: _finiteNumber(req.thickness_mil ?? raw.spiral_thickness_mil, 2.5),
    widthMm: widthRule.widthMm,
  })
  const selectedWidthMm = Number(material?.widthMm ?? widthRule.widthMm)
  const selectedThicknessMm = _finiteNumber(material?.thicknessMm ?? req.thickness_mm, 2.5 * 0.0254)
  const coveragePct = _clamp((bobbins * selectedWidthMm) / Math.max(0.001, Math.PI * odBeforeMm) * 100, 0, 100)
  const actualGapPct = _clamp(100 - coveragePct, 0, 100)
  const radialBuildMm = selectedThicknessMm
  const odAfterMm = odBeforeMm + 2 * radialBuildMm
  const pitchMm = _spiralPitchFromGap(gapPct, selectedWidthMm)
  const step = {
    layer: 0,
    type: 'spiral',
    od_before_mm: round(odBeforeMm, 4),
    od_after_mm: round(odAfterMm, 4),
    part_number: material?.partNumber || null,
    bobbins,
    gap_pct: round(gapPct, 2),
    actual_gap_pct: round(actualGapPct, 2),
    coverage_pct: round(coveragePct, 2),
    calculated_width_mm: round(widthRule.widthMm, 4),
    calculated_width_in: round(widthRule.widthIn, 5),
    selected_width_mm: round(selectedWidthMm, 4),
    selected_width_in: round(selectedWidthMm / 25.4, 5),
    thickness_mil: material?.thicknessMil ?? round(selectedThicknessMm / 0.0254, 2),
    pitch_mm: round(pitchMm, 3),
    direction: String(req.direction || raw.spiral_direction || 'Z').toUpperCase().startsWith('S') ? 'S' : 'Z',
  }
  const apply = spcFlatwireToToolLayer(material, {
    type: 'spiral',
    label: 'SPC flatwire spiral',
    direction: step.direction,
    length: _finiteNumber(req.length_mm ?? raw.spiral_length_mm, 155),
    width: selectedWidthMm,
    pitch: pitchMm,
    bobbins,
    gap: gapPct,
  })
  return { step, apply, od_after_mm: odAfterMm }
}

function _designFoilShield(req, raw, odBeforeMm) {
  const overlapPct = _clamp(_finiteNumber(req.overlap_pct ?? req.overlap ?? raw.foil_overlap_pct, 25), 0, 80)
  const widthIn = _finiteNumber(req.width_in ?? raw.foil_width_in)
  const widthMm = _finiteNumber(req.width_mm ?? raw.foil_width_mm, Number.isFinite(widthIn) && widthIn > 0 ? widthIn * 25.4 : _defaultFoilWidthIn(odBeforeMm) * 25.4)
  const material = findNearestFoilTape({
    partNumber: req.part_number || req.partNumber || raw.foil_part_number,
    thicknessMil: _finiteNumber(req.thickness_mil ?? raw.foil_thickness_mil, 1.4),
    widthMm,
  })
  const selectedWidthMm = Number(material?.widthMm ?? widthMm)
  const selectedThicknessMm = _finiteNumber(material?.thicknessMm ?? req.thickness_mm, 1.4 * 0.0254)
  const radialBuildMm = selectedThicknessMm * (1 + overlapPct / 100 * 0.25)
  const odAfterMm = odBeforeMm + 2 * radialBuildMm
  const step = {
    layer: 0,
    type: 'foil',
    od_before_mm: round(odBeforeMm, 4),
    od_after_mm: round(odAfterMm, 4),
    part_number: material?.partNumber || null,
    overlap_pct: round(overlapPct, 2),
    width_mm: round(selectedWidthMm, 4),
    width_in: round(selectedWidthMm / 25.4, 5),
    thickness_mil: material?.thicknessMil ?? round(selectedThicknessMm / 0.0254, 2),
    thickness_mm: round(selectedThicknessMm, 4),
  }
  const apply = foilTapeToToolLayer(material, {
    type: 'foil',
    label: 'Foil shield',
    length: _finiteNumber(req.length_mm ?? raw.foil_length_mm, 152),
    overlap: overlapPct,
  })
  return { step, apply, od_after_mm: odAfterMm }
}

function _designHelicalFlatwireShield(req, raw, odBeforeMm) {
  const overlapPct = _clamp(_finiteNumber(req.overlap_pct ?? req.overlap ?? raw.helical_overlap_pct, 45), 0, 80)
  const widthIn = _finiteNumber(req.width_in ?? raw.helical_width_in)
  const widthMm = _finiteNumber(req.width_mm ?? raw.helical_width_mm, Number.isFinite(widthIn) && widthIn > 0 ? widthIn * 25.4 : _defaultHelicalWidthIn(odBeforeMm) * 25.4)
  const material = findNearestSpcFlatwire({
    partNumber: req.part_number || req.partNumber || raw.helical_part_number || raw.flatwire_part_number,
    use: 'helical',
    thicknessMil: _finiteNumber(req.thickness_mil ?? raw.helical_thickness_mil, 2.5),
    widthMm,
  })
  const selectedWidthMm = Number(material?.widthMm ?? widthMm)
  const selectedThicknessMm = _finiteNumber(material?.thicknessMm ?? req.thickness_mm, 2.5 * 0.0254)
  const radialBuildMm = selectedThicknessMm * (1 + overlapPct / 100 * 0.35)
  const odAfterMm = odBeforeMm + 2 * radialBuildMm
  const pitchMm = _helicalPitchFromOverlap(overlapPct, selectedWidthMm)
  const step = {
    layer: 0,
    type: 'flatwire',
    od_before_mm: round(odBeforeMm, 4),
    od_after_mm: round(odAfterMm, 4),
    part_number: material?.partNumber || null,
    overlap_pct: round(overlapPct, 2),
    width_mm: round(selectedWidthMm, 4),
    width_in: round(selectedWidthMm / 25.4, 5),
    thickness_mil: material?.thicknessMil ?? round(selectedThicknessMm / 0.0254, 2),
    pitch_mm: round(pitchMm, 3),
    direction: String(req.direction || raw.helical_direction || 'S').toUpperCase().startsWith('Z') ? 'Z' : 'S',
  }
  const apply = spcFlatwireToToolLayer(material, {
    type: 'flatwire',
    label: 'SPC flatwire helical',
    direction: step.direction,
    length: _finiteNumber(req.length_mm ?? raw.helical_length_mm, 150),
    width: selectedWidthMm,
    pitch: pitchMm,
    overlap: overlapPct,
  })
  return { step, apply, od_after_mm: odAfterMm }
}

function _designBraidShield(req, raw, odBeforeMm) {
  const targetCoverage = _clamp(_finiteNumber(req.coverage_pct ?? req.coverage ?? raw.braid_coverage_pct, 92), 70, 99)
  const angleDeg = _clamp(_finiteNumber(req.angle_deg ?? raw.braid_angle_deg, 45), 25, 70)
  const setup = _selectBraidSetup({
    odMm: odBeforeMm,
    targetCoverage,
    angleDeg,
    carriers: _finiteNumber(req.carriers ?? raw.braid_carriers),
    ends: _finiteNumber(req.ends_per_carrier ?? req.ends ?? raw.braid_ends_per_carrier),
    awg: _finiteNumber(req.wire_awg ?? req.awg ?? raw.braid_wire_awg),
  })
  const radialBuildMm = setup.wire_diameter_mm * 1.6
  const odAfterMm = odBeforeMm + 2 * radialBuildMm
  const step = {
    layer: 0,
    type: 'braid',
    od_before_mm: round(odBeforeMm, 4),
    od_after_mm: round(odAfterMm, 4),
    coverage_pct: round(setup.coverage_pct, 2),
    braid_setup: setup,
  }
  const apply = {
    type: 'braid',
    label: 'SPC braid',
    length: _finiteNumber(req.length_mm ?? raw.braid_length_mm, 142),
    carriers: setup.carriers,
    ends: setup.ends_per_carrier,
    picks: setup.picks_per_in,
    gauge: setup.wire_awg,
    coverage: setup.coverage_pct,
  }
  return { step, apply, od_after_mm: odAfterMm }
}

function _selectBraidSetup({ odMm, targetCoverage, angleDeg, carriers, ends, awg }) {
  const carrierPool = Number.isFinite(carriers) && carriers > 0 ? [Math.round(carriers)] : [16, 24, 32, 36, 40, 48]
  const endPool = Number.isFinite(ends) && ends > 0 ? [Math.round(ends)] : [3, 4, 5, 6, 8]
  const awgPool = Number.isFinite(awg) && awg > 0
    ? [Math.round(awg)]
    : odMm <= 1.8 ? [40, 38, 36]
      : odMm <= 3.5 ? [38, 36, 34]
        : [36, 34, 32]
  const angleRad = angleDeg * Math.PI / 180
  const odIn = odMm / 25.4
  let best = null
  for (const c of carrierPool) {
    for (const e of endPool) {
      for (const g of awgPool) {
        const dMm = _awgDiameterMm(g)
        const fill = _clamp((c * e * dMm) / (Math.PI * odMm * Math.sin(angleRad)), 0, 0.995)
        const coverage = (2 * fill - fill * fill) * 100
        const picks = (c * Math.tan(angleRad)) / Math.max(0.001, Math.PI * odIn)
        const shortfallPenalty = coverage < targetCoverage ? (targetCoverage - coverage) * 7 : 0
        const overshootPenalty = Math.max(0, coverage - targetCoverage) * 0.65
        const complexityPenalty = c * 0.015 + e * 0.25 + Math.max(0, 36 - g) * 0.2
        const score = Math.abs(coverage - targetCoverage) + shortfallPenalty + overshootPenalty + complexityPenalty
        const candidate = {
          carriers: c,
          ends_per_carrier: e,
          wire_awg: g,
          wire_diameter_mm: round(dMm, 4),
          braid_angle_deg: round(angleDeg, 1),
          picks_per_in: round(picks, 1),
          fill_factor: round(fill, 4),
          coverage_pct: round(_clamp(coverage, 0, 99), 2),
          target_coverage_pct: round(targetCoverage, 2),
        }
        if (!best || score < best.score) best = { ...candidate, score }
      }
    }
  }
  const { score, ...out } = best
  return out
}

function _awgDiameterMm(awg) {
  return 0.127 * Math.pow(92, (36 - Number(awg)) / 39)
}

function _defaultFoilWidthIn(odMm) {
  if (odMm <= 1.8) return 0.0311
  if (odMm <= 3.5) return 0.0750
  return 0.1250
}

function _defaultHelicalWidthIn(odMm) {
  if (odMm <= 1.8) return 0.0300
  if (odMm <= 3.5) return 0.0600
  return 0.0750
}

function _spiralPitchFromGap(gapPct, widthMm) {
  return _clamp(Math.max(widthMm, 0.1) * 14 * (1 + _clamp(gapPct, 0, 28) / 100), 1, 140)
}

function _helicalPitchFromOverlap(overlapPct, widthMm) {
  return _clamp(Math.max(widthMm, 0.1) * 10 * (1 - _clamp(overlapPct, 0, 80) / 100), 0.8, 140)
}

function computeTapeNotches(input) {
  const { vp = 0.7, layers = [], max_freq_ghz = 40, n_harmonics = 3 } = input || {}
  if (!(vp > 0 && vp < 1)) throw new Error('vp must be 0..1.')
  if (!Array.isArray(layers) || layers.length === 0) throw new Error('layers must be a non-empty array.')

  const c = 299792458
  // For each layer: pitch P follows the shop MI-calibrated WTM set point.
  const perLayer = layers.map((L, i) => {
    const W = L.tape_width_mm || L.W || 6.35
    const o = L.overlap ?? '2/3'
    const explicitPitchMm = Number(L.pitch_setpoint_mm || L.pitch_mm || 0)
    const pitchInfo = ptfeShopPitchSetpoint({
      cableOdMm: L.OD_before_mm || L.od_before_mm || L.incoming_od_mm || L.cable_od_mm,
      tapeWidthMm: W,
      overlap: o,
      densityCode: L.density_code || L.densityCode,
      density: L.density,
      partNumber: L.part_number || L.partNumber,
    })
    const fallbackRequestedPitchMm = W * (1 - _overlapFraction(o))
    const requestedPitchMm = explicitPitchMm > 0
      ? explicitPitchMm
      : (pitchInfo.calculatedPitchMm > 0 ? pitchInfo.calculatedPitchMm : fallbackRequestedPitchMm)
    const pitch_mm = explicitPitchMm > 0
      ? Math.max(WTM_MIN_TAPING_PITCH_MM, explicitPitchMm)
      : (pitchInfo.pitchMm > 0 ? pitchInfo.pitchMm : Math.max(WTM_MIN_TAPING_PITCH_MM, fallbackRequestedPitchMm))
    const P_m = pitch_mm * 1e-3
    const harmonics = []
    for (let n = 1; n <= n_harmonics; n++) {
      const f_hz = (n * c * vp) / (2 * P_m)
      const f_ghz = f_hz / 1e9
      if (f_ghz <= max_freq_ghz) harmonics.push({ n, f_ghz: round(f_ghz, 2), pitch_mm: round(pitch_mm, 3) })
    }
    return {
      layer_index: i,
      tape_width_mm: round(W, 3),
      overlap: o,
      requested_pitch_mm: round(requestedPitchMm, 3),
      pitch_mm: round(pitch_mm, 3),
      pitch_limited_by_wtm: requestedPitchMm > 0 && requestedPitchMm < WTM_MIN_TAPING_PITCH_MM,
      harmonics,
    }
  })

  // Aggregate: bin harmonic frequencies; layers with the same pitch deepen
  // the same notch, so count them.
  const bins = {}
  for (const L of perLayer) {
    for (const h of L.harmonics) {
      const key = h.f_ghz.toFixed(1)
      bins[key] = bins[key] || { f_ghz: h.f_ghz, contributing_layers: [], pitches: new Set() }
      bins[key].contributing_layers.push(L.layer_index)
      bins[key].pitches.add(L.pitch_mm)
    }
  }
  const aggregated = Object.values(bins)
    .map((b) => ({
      f_ghz: b.f_ghz,
      contributing_layers: b.contributing_layers,
      depth_qual: b.contributing_layers.length >= 2 && b.pitches.size === 1
        ? 'STRONG (stacked layers same pitch — coherent)'
        : b.contributing_layers.length >= 2
          ? 'MEDIUM (stacked layers different pitches — partial coherence)'
          : 'WEAK (single tape layer)',
    }))
    .sort((a, b) => a.f_ghz - b.f_ghz)

  return {
    formula: `f_n = n · c · VP / (2 · P_axial),  P_axial = max(W · (1 − overlap), ${WTM_MIN_TAPING_PITCH_IN.toFixed(4)} in)`,
    inputs: { vp: round(vp, 3), n_harmonics, max_freq_ghz },
    per_layer: perLayer,
    aggregated_notches: aggregated,
    notes: [
      `Predicted ${aggregated.length} potential notch frequenc${aggregated.length === 1 ? 'y' : 'ies'} below ${max_freq_ghz} GHz.`,
      aggregated.some((a) => a.depth_qual.startsWith('STRONG'))
        ? 'STRONG notches: 2+ tape layers share the same pitch — perturbations add coherently. Stagger pitches or vary tape widths to break the periodicity.'
        : null,
    ].filter(Boolean),
  }
}

function _clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x))
}

function _mergedRfCables() {
  return { ...RF_CABLE_DB, ...getCustomRfCables() }
}

function _rhoFromReturnLoss(rl_db) {
  return Math.pow(10, -Math.max(0, rl_db) / 20)
}

function _returnLossFromRho(rho) {
  const r = Math.abs(rho)
  return r <= 0 ? 999 : -20 * Math.log10(Math.min(0.999999, r))
}

function _vswrFromRho(rho) {
  const r = Math.min(0.999999, Math.abs(rho))
  return (1 + r) / (1 - r)
}

function _rlFromZStep(z0, zLocal) {
  const rho = (zLocal - z0) / (zLocal + z0)
  return { rho, return_loss_db: _returnLossFromRho(rho), vswr: _vswrFromRho(rho) }
}

function _protocolLimits(protocol, length_m, custom_limits = {}) {
  const p = String(protocol || 'custom').toLowerCase().replace(/[\s_-]/g, '')
  const presets = {
    usb4:      { name: 'USB4 passive cable', z0: 100, z_tol_pct: 10, max_il_db: 23, min_rl_db: 10, max_skew_ps_per_m: 5,  min_next_db: 26, min_eye_ui: 0.25 },
    tb4:       { name: 'Thunderbolt / USB4 passive cable', z0: 100, z_tol_pct: 10, max_il_db: 23, min_rl_db: 10, max_skew_ps_per_m: 5,  min_next_db: 26, min_eye_ui: 0.25 },
    thunderbolt4:{ name: 'Thunderbolt / USB4 passive cable', z0: 100, z_tol_pct: 10, max_il_db: 23, min_rl_db: 10, max_skew_ps_per_m: 5, min_next_db: 26, min_eye_ui: 0.25 },
    pcie5:     { name: 'PCIe Gen5 cable/channel', z0: 85,  z_tol_pct: 10, max_il_db: 28, min_rl_db: 10, max_skew_ps_per_m: 5,  min_next_db: 30, min_eye_ui: 0.20 },
    pcie6:     { name: 'PCIe Gen6 cable/channel', z0: 85,  z_tol_pct: 10, max_il_db: 36, min_rl_db: 8,  max_skew_ps_per_m: 3,  min_next_db: 32, min_eye_ui: 0.16 },
    hdmi21:    { name: 'HDMI 2.1 Ultra High Speed', z0: 100, z_tol_pct: 10, max_il_db: 30, min_rl_db: 10, max_skew_ps_per_m: 15, min_next_db: 25, min_eye_ui: 0.22 },
    cat6a:     { name: 'Cat 6A channel', z0: 100, z_tol_pct: 15, il_db_per_100m: 30.5, min_rl_db: 8, max_skew_ps_per_m: 45, min_next_db: 39.9, min_eye_ui: 0.30 },
    cat8:      { name: 'Cat 8 channel', z0: 100, z_tol_pct: 15, il_db_per_100m: 67.0, min_rl_db: 8, max_skew_ps_per_m: 25, min_next_db: 13.1, min_eye_ui: 0.24 },
    spacewire: { name: 'SpaceWire LVDS cable', z0: 100, z_tol_pct: 10, max_il_db: 6, min_rl_db: 14, max_skew_ps_per_m: 100, min_next_db: 30, min_eye_ui: 0.40 },
    custom:    { name: 'Custom high-speed limit', z0: 100, z_tol_pct: 10, max_il_db: 20, min_rl_db: 10, max_skew_ps_per_m: 10, min_next_db: 25, min_eye_ui: 0.25 },
  }
  const base = { ...(presets[p] || presets.custom), ...custom_limits }
  if (base.il_db_per_100m != null && length_m > 0 && base.max_il_db == null) {
    base.max_il_db = base.il_db_per_100m * (length_m / 100)
  }
  if (base.max_il_db == null && base.il_db_per_100m != null) base.max_il_db = base.il_db_per_100m
  return base
}

function checkHighspeedCompliance(input) {
  const {
    protocol = 'custom', length_m = 1, z0_ohm, insertion_loss_db, return_loss_db,
    skew_ps_per_m, next_db, eye_height_ui, custom_limits = {},
  } = input || {}
  const limits = _protocolLimits(protocol, length_m, custom_limits)
  const checks = []
  const add = (metric, measured, limit, pass, margin, unit, note) => {
    if (measured == null || !isFinite(measured)) return
    checks.push({
      metric, measured: round(measured, 3), limit, pass,
      margin: round(margin, 3), unit, note,
    })
  }

  if (z0_ohm != null) {
    const tol = (limits.z_tol_pct || 10) / 100
    const lo = limits.z0 * (1 - tol)
    const hi = limits.z0 * (1 + tol)
    add('Impedance', z0_ohm, `${round(lo, 1)}-${round(hi, 1)} Ω`, z0_ohm >= lo && z0_ohm <= hi, Math.min(z0_ohm - lo, hi - z0_ohm), 'Ω', 'Measured Z0 must stay inside the protocol impedance window.')
  }
  add('Insertion loss', insertion_loss_db, `≤ ${round(limits.max_il_db, 2)} dB`, insertion_loss_db <= limits.max_il_db, limits.max_il_db - insertion_loss_db, 'dB', 'Lower insertion loss leaves more receiver equalization margin.')
  add('Return loss', return_loss_db, `≥ ${round(limits.min_rl_db, 2)} dB`, return_loss_db >= limits.min_rl_db, return_loss_db - limits.min_rl_db, 'dB', 'Low return loss usually points to impedance bumps, bad launch, or local crush.')
  add('Skew', skew_ps_per_m, `≤ ${round(limits.max_skew_ps_per_m, 2)} ps/m`, skew_ps_per_m <= limits.max_skew_ps_per_m, limits.max_skew_ps_per_m - skew_ps_per_m, 'ps/m', 'Tight twist symmetry and matched dielectric keep timing aligned.')
  add('NEXT', next_db, `≥ ${round(limits.min_next_db, 2)} dB`, next_db >= limits.min_next_db, next_db - limits.min_next_db, 'dB', 'Higher isolation means less pair-to-pair noise.')
  add('Eye opening', eye_height_ui, `≥ ${round(limits.min_eye_ui, 3)} UI`, eye_height_ui >= limits.min_eye_ui, eye_height_ui - limits.min_eye_ui, 'UI', 'Eye opening summarizes jitter/noise margin at the receiver.')

  const failing = checks.filter((c) => !c.pass)
  const verdict = failing.length === 0 ? 'PASS' : failing.some((c) => c.margin < -3 || (c.unit === 'UI' && c.margin < -0.05)) ? 'FAIL' : 'MARGINAL'
  const first_fix = failing[0]?.metric === 'Insertion loss' ? 'Shorten the run, increase conductor size, or use lower-loss dielectric.'
    : failing[0]?.metric === 'Return loss' ? 'Inspect local geometry: connector launch, crush, shield step, dielectric eccentricity.'
    : failing[0]?.metric === 'Skew' ? 'Tighten pair lay control and match dielectric around both conductors.'
    : failing[0]?.metric === 'NEXT' ? 'Improve pair spacing, foil continuity, and bundle symmetry.'
    : failing[0]?.metric === 'Eye opening' ? 'Reduce jitter/noise or raise bandwidth before chasing cosmetic construction changes.'
    : 'All measured limits clear the selected profile.'

  return {
    protocol,
    profile: limits.name,
    length_m,
    verdict,
    checks,
    failing_metrics: failing.map((c) => c.metric),
    first_fix,
    _section: 'si',
  }
}

function analyzeConnectorLaunch(input) {
  const {
    connector_id, cable_z0_ohm = 50, pin_diameter_mm, dielectric_diameter_mm,
    dielectric_er = 2.05, ferrule_step_mm = 0, launch_length_mm = 3, freq_ghz = 6,
  } = input || {}
  if (!(cable_z0_ohm > 0)) throw new Error('cable_z0_ohm must be positive')
  const conn = connector_id ? CONNECTOR_DB[String(connector_id).toLowerCase()] : null
  let zLaunch = cable_z0_ohm
  let geometry_note = 'No pin/dielectric geometry provided; using ferrule-step estimate only.'
  if (pin_diameter_mm > 0 && dielectric_diameter_mm > pin_diameter_mm && dielectric_er > 0) {
    zLaunch = (60 / Math.sqrt(dielectric_er)) * Math.log(dielectric_diameter_mm / pin_diameter_mm)
    geometry_note = 'Coax launch impedance from Z0=(60/sqrt(er))*ln(D/d).'
  }
  const bareStepOhm = (zLaunch - cable_z0_ohm) + ferrule_step_mm * 7 * (cable_z0_ohm / 50)
  const vf = 1 / Math.sqrt(Math.max(1, dielectric_er || 2.05))
  const wavelength_mm = (299792458 * vf) / (Math.max(0.001, freq_ghz) * 1e9) * 1000
  const electrical_len_deg = 360 * (launch_length_mm / wavelength_mm)
  const shortStepFactor = _clamp(electrical_len_deg / 45, 0.15, 1)
  const zLocal = Math.max(1, cable_z0_ohm + bareStepOhm * shortStepFactor)
  const refl = _rlFromZStep(cable_z0_ohm, zLocal)
  const verdict = refl.return_loss_db >= 24 ? 'CLEAN'
    : refl.return_loss_db >= 18 ? 'USABLE'
    : refl.return_loss_db >= 12 ? 'MARGINAL'
    : 'FAIL'
  return {
    connector: conn ? conn.name : connector_id || 'custom launch',
    freq_ghz,
    cable_z0_ohm: round(cable_z0_ohm, 2),
    launch_z0_ohm: round(zLaunch, 2),
    effective_local_z0_ohm: round(zLocal, 2),
    local_step_ohm: round(zLocal - cable_z0_ohm, 2),
    electrical_length_deg: round(electrical_len_deg, 1),
    return_loss_db: round(refl.return_loss_db, 2),
    vswr: round(refl.vswr, 3),
    rho: round(refl.rho, 4),
    verdict,
    connector_datasheet_rl_db: conn?.return_loss_db,
    fixes: [
      Math.abs(zLaunch - cable_z0_ohm) > 2 ? 'Resize pin or dielectric bore to pull launch Z0 back toward cable Z0.' : null,
      Math.abs(ferrule_step_mm) > 0.05 ? 'Reduce ferrule/solder-cup step; taper the transition instead of an abrupt shoulder.' : null,
      electrical_len_deg > 30 ? 'Shorten the exposed launch region; long discontinuities become visible at this band.' : null,
      'Keep braid/foil termination 360° around the connector body and avoid pigtail drain launches.',
    ].filter(Boolean),
    notes: [geometry_note, conn && freq_ghz > conn.fmax_ghz ? `${conn.name} is above its nominal ${conn.fmax_ghz} GHz range.` : null].filter(Boolean),
  }
}

function predictShieldingEffectiveness(input) {
  const {
    freq_mhz = 1000, foil_overlap_pct = 0, braid_coverage_pct = 0,
    spiral_gap_pct = 100, layer_count, has_drain = false, jacket_material,
  } = input || {}
  const foil = _clamp(foil_overlap_pct, 0, 100)
  const braid = _clamp(braid_coverage_pct, 0, 100)
  const gap = _clamp(spiral_gap_pct, 0, 100)
  const inferredLayers = layer_count ?? [foil > 5, braid > 5, gap < 95].filter(Boolean).length
  const freqPenalty = Math.max(0, 8 * Math.log10(Math.max(1, freq_mhz) / 1000))
  let se = 18 + 0.42 * foil + 0.58 * braid + (100 - gap) * 0.18 + Math.max(0, inferredLayers - 1) * 7
  if (has_drain) se += 3
  if (foil <= 5) se -= 10
  if (braid <= 20) se -= 12
  se -= freqPenalty
  se = _clamp(se, 10, 125)
  const leakRisk = _clamp(105 - se * 0.78 + gap * 0.35 + freqPenalty * 1.5, 1, 95)
  const weak_layer = foil < 20 ? 'foil seam / no foil'
    : braid < 70 ? 'braid optical coverage'
    : gap > 13 ? 'SPC spiral gap'
    : freqPenalty > 8 ? 'high-frequency transfer impedance'
    : 'none obvious'
  const verdict = se >= 95 ? 'EXCELLENT'
    : se >= 75 ? 'STRONG'
    : se >= 55 ? 'OK'
    : 'LEAK RISK'
  return {
    freq_mhz,
    shielding_effectiveness_db: round(se, 1),
    leak_risk_percent: round(leakRisk, 1),
    weak_layer,
    verdict,
    inputs: { foil_overlap_pct: foil, braid_coverage_pct: braid, spiral_gap_pct: gap, layer_count: inferredLayers, has_drain, jacket_material },
    recommendations: [
      foil < 25 ? 'Add bonded foil with 25-40% overlap before braid for seam control.' : null,
      braid < 85 ? 'Raise braid coverage or use smaller wire / higher picks to close optical windows.' : null,
      gap > 13 ? 'For SPC spiral, bring gap toward 8-13%; for helical flatwire, use overlap instead of gap.' : null,
      freq_mhz > 6000 ? 'At microwave bands, connector backshell bonding can dominate the shield stack.' : null,
    ].filter(Boolean),
  }
}

function cascadeSParameters(input) {
  const { freq_mhz = 1000, z0_ohm = 50, stages = [] } = input || {}
  if (!Array.isArray(stages) || stages.length === 0) throw new Error('stages must be a non-empty array')
  const cables = _mergedRfCables()
  let totalIl = 0
  let worstRl = Infinity
  const rows = stages.map((stage, i) => {
    const count = Math.max(1, Number(stage.count) || 1)
    let il = Number(stage.il_db) || 0
    let rl = Number(stage.return_loss_db) || null
    let label = stage.name || `Stage ${i + 1}`
    if (stage.cable_id) {
      const [, c] = findRfCable(cables, stage.cable_id)
      if (!c) throw new Error(`Unknown cable_id "${stage.cable_id}"`)
      const length_ft = Number(stage.length_ft) || 0
      il += (interpAtten(c.atten_db_per_100ft, freq_mhz) / 100) * length_ft
      rl = rl || 26
      label = stage.name || `${c.name} ${round(length_ft, 2)} ft`
    }
    if (stage.connector_id) {
      const conn = CONNECTOR_DB[String(stage.connector_id).toLowerCase()]
      if (!conn) throw new Error(`Unknown connector_id "${stage.connector_id}"`)
      il += (conn.il_db || 0) * count
      rl = rl || conn.return_loss_db || 20
      label = stage.name || `${count}× ${conn.name}`
    }
    if (stage.vswr != null && !rl) {
      const rho = (stage.vswr - 1) / (stage.vswr + 1)
      rl = _returnLossFromRho(rho)
    }
    rl = rl || 30
    totalIl += il
    worstRl = Math.min(worstRl, rl)
    return { stage: label, il_db: round(il, 3), return_loss_db: round(rl, 2) }
  })
  const rho = _rhoFromReturnLoss(worstRl)
  const dominant = rows.reduce((a, b) => (b.il_db || 0) > (a.il_db || 0) ? b : a, rows[0])
  return {
    freq_mhz,
    z0_ohm,
    stages: rows,
    s21_db: round(-totalIl, 3),
    total_insertion_loss_db: round(totalIl, 3),
    worst_s11_return_loss_db: round(worstRl, 2),
    worst_vswr: round(_vswrFromRho(rho), 3),
    dominant_loss_stage: dominant.stage,
    verdict: worstRl >= 20 && totalIl < 3 ? 'CLEAN' : worstRl >= 14 ? 'USABLE' : 'REFLECTION RISK',
  }
}

function matchPhaseDelay(input) {
  const {
    freq_mhz = 1000, length_a_m, length_b_m, vf_a = 0.66, vf_b = vf_a,
    target_skew_ps = 0, target_phase_deg,
  } = input || {}
  if (!(length_a_m >= 0 && length_b_m >= 0)) throw new Error('length_a_m and length_b_m are required')
  if (!(vf_a > 0 && vf_a <= 1 && vf_b > 0 && vf_b <= 1)) throw new Error('vf_a/vf_b must be 0..1')
  const c = 299792458
  const delayAps = length_a_m / (vf_a * c) * 1e12
  const delayBps = length_b_m / (vf_b * c) * 1e12
  const skewPs = delayAps - delayBps
  const phaseDeg = 360 * (freq_mhz * 1e6) * (skewPs * 1e-12)
  const wrapped = ((phaseDeg + 180) % 360 + 360) % 360 - 180
  const targetPs = target_phase_deg != null
    ? (target_phase_deg / 360) / (freq_mhz * 1e6) * 1e12
    : target_skew_ps
  const excessPs = skewPs - targetPs
  const trimAmm = excessPs > 0 ? excessPs * 1e-12 * vf_a * c * 1000 : 0
  const trimBmm = excessPs < 0 ? -excessPs * 1e-12 * vf_b * c * 1000 : 0
  return {
    freq_mhz,
    delay_a_ps: round(delayAps, 2),
    delay_b_ps: round(delayBps, 2),
    skew_a_minus_b_ps: round(skewPs, 2),
    phase_a_minus_b_deg: round(phaseDeg, 2),
    wrapped_phase_deg: round(wrapped, 2),
    trim_to_target: {
      target_skew_ps: round(targetPs, 2),
      trim_a_mm: round(trimAmm, 3),
      trim_b_mm: round(trimBmm, 3),
      instruction: trimAmm > 0 ? 'Trim cable A' : trimBmm > 0 ? 'Trim cable B' : 'Already at target within rounding',
    },
  }
}

function estimateBendCrushRisk(input) {
  const { cable_id, od_mm, z0_ohm, bend_radius_mm, crush_pct = 0, freq_mhz = 1000 } = input || {}
  const [, cable] = cable_id ? findRfCable(_mergedRfCables(), cable_id) : [null, null]
  if (cable_id && !cable) throw new Error(`Unknown cable_id "${cable_id}"`)
  const od = od_mm || cable?.od_mm
  const z0 = z0_ohm || cable?.z0 || 50
  if (!(od > 0)) throw new Error('Provide od_mm or a cable_id with OD data')
  const ratio = bend_radius_mm > 0 ? bend_radius_mm / od : null
  const crush = _clamp(crush_pct, 0, 40)
  const bendStep = ratio == null ? 0 : Math.max(0, 15 - ratio) * 0.28
  const crushStep = crush * 0.22
  const zLocal = Math.max(5, z0 - bendStep - crushStep)
  const refl = _rlFromZStep(z0, zLocal)
  const risk = ratio != null && ratio < 5 || crush > 15 ? 'HIGH'
    : ratio != null && ratio < 10 || crush > 7 ? 'MEDIUM'
    : 'LOW'
  return {
    cable: cable?.name || 'custom cable',
    freq_mhz,
    od_mm: round(od, 3),
    bend_radius_mm: bend_radius_mm ?? null,
    bend_radius_x_od: ratio != null ? round(ratio, 2) : null,
    recommended_static_radius_mm: round(10 * od, 1),
    recommended_dynamic_radius_mm: round(15 * od, 1),
    crush_pct: crush,
    estimated_local_z0_ohm: round(zLocal, 2),
    z_step_ohm: round(zLocal - z0, 2),
    return_loss_db: round(refl.return_loss_db, 2),
    vswr: round(refl.vswr, 3),
    risk,
    first_fix: risk === 'HIGH' ? 'Open the bend radius, remove clamp pressure, then re-run TDR/VSWR before shipping.' : 'Keep bend above 10×OD static / 15×OD dynamic and avoid hard tie points.',
  }
}

function estimateThermalDerating(input) {
  const {
    cable_id, freq_mhz, power_w, length_ft = 100, ambient_c = 25,
    bundle_count = 1, airflow = 'normal', vswr = 1,
  } = input || {}
  const [, cable] = findRfCable(_mergedRfCables(), cable_id)
  if (!cable) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_rf_cable.`)
  if (!(freq_mhz > 0 && power_w > 0 && length_ft > 0)) throw new Error('freq_mhz, power_w, and length_ft must be positive')
  const od = cable.od_mm || 5
  const ilDb = (interpAtten(cable.atten_db_per_100ft, freq_mhz) / 100) * length_ft
  const pOut = power_w * Math.pow(10, -ilDb / 10)
  const pDiss = Math.max(0, power_w - pOut)
  const airflowFactor = airflow === 'forced' ? 1.35 : airflow === 'still' ? 0.72 : 1
  const ambientFactor = _clamp((90 - ambient_c) / (90 - 25), 0.12, 1.15)
  const bundleFactor = 1 / (1 + 0.16 * Math.max(0, bundle_count - 1))
  const vswrFactor = 1 / Math.max(1, Math.sqrt(vswr || 1))
  const freqFactor = Math.sqrt(1000 / Math.max(100, freq_mhz))
  const safePower = Math.pow(od / 5, 1.75) * 42 * ambientFactor * bundleFactor * airflowFactor * vswrFactor * freqFactor
  const thermalR = (18 / Math.pow(od / 5, 1.15)) / airflowFactor * (1 + 0.08 * Math.max(0, bundle_count - 1))
  const tempRiseC = pDiss * thermalR / Math.max(1, length_ft / 10)
  const conductorTempC = ambient_c + tempRiseC
  const margin = safePower - power_w
  const verdict = margin >= power_w * 0.25 && conductorTempC < 75 ? 'SAFE'
    : margin >= 0 && conductorTempC < 90 ? 'WARM'
    : 'DERATE'
  return {
    cable: cable.name,
    freq_mhz,
    length_ft,
    input_power_w: round(power_w, 2),
    insertion_loss_db: round(ilDb, 2),
    output_power_w: round(pOut, 2),
    dissipated_power_w: round(pDiss, 2),
    estimated_safe_cw_power_w: round(safePower, 1),
    thermal_margin_w: round(margin, 1),
    estimated_conductor_temp_c: round(conductorTempC, 1),
    verdict,
    limiting_factor: ambient_c > 60 ? 'ambient temperature' : bundle_count > 3 ? 'bundle heating' : vswr > 1.8 ? 'standing-wave hot spots' : 'cable attenuation heat',
    note: 'First-order derating for engineering triage; verify mission-critical runs against manufacturer Pmax curves.',
  }
}

function round(x, n) {
  if (x == null || !isFinite(x)) return x
  const p = Math.pow(10, n || 2)
  return Math.round(x * p) / p
}

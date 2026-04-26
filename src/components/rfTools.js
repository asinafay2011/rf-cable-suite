// Tools exposed to the RF agent. Pure-math + small DBs, client-side dispatch.

// ── RF cable database (50 Ω + 75 Ω) ─────────────────────
export const RF_CABLE_DB = {
  'rg-58':   { name: 'RG-58/U',      z0: 50, vf: 0.66, od_mm: 4.95, fmax_ghz: 1.0,
    atten_db_per_100ft: { 30: 2.5, 100: 4.4, 450: 9.9, 900: 14.8, 1000: 16.0, 2400: 26.0 } },
  'rg-174':  { name: 'RG-174/U',     z0: 50, vf: 0.66, od_mm: 2.79, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 8.8, 400: 18.0, 900: 28.5, 1000: 30.0, 2400: 50.0, 3000: 56.0 } },
  'rg-178':  { name: 'RG-178B/U',    z0: 50, vf: 0.69, od_mm: 1.83, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 14.0, 400: 29.0, 1000: 46.0, 3000: 84.0 } },
  'rg-213':  { name: 'RG-213/U',     z0: 50, vf: 0.66, od_mm: 10.3, fmax_ghz: 3.0,
    atten_db_per_100ft: { 30: 1.0, 100: 1.9, 400: 4.1, 900: 6.4, 1000: 6.9, 2400: 11.5 } },
  'lmr-100': { name: 'LMR-100A',     z0: 50, vf: 0.66, od_mm: 2.79, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 7.4, 400: 15.6, 1000: 25.5, 2400: 39.5, 5800: 64.0 } },
  'lmr-240': { name: 'LMR-240',      z0: 50, vf: 0.84, od_mm: 6.10, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 3.0, 400: 6.4, 1000: 10.5, 2400: 16.5, 5800: 26.5 } },
  'lmr-400': { name: 'LMR-400',      z0: 50, vf: 0.85, od_mm: 10.29, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 1.5, 400: 3.0, 1000: 4.8, 2400: 7.6, 5800: 12.5 } },
  'lmr-600': { name: 'LMR-600',      z0: 50, vf: 0.87, od_mm: 14.99, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 0.96, 400: 1.96, 1000: 3.1, 2400: 5.0, 5800: 8.2 } },
  'heliax-ldf4-50a': { name: 'Heliax LDF4-50A', z0: 50, vf: 0.88, od_mm: 12.7, fmax_ghz: 8.8,
    atten_db_per_100ft: { 30: 0.36, 100: 0.66, 400: 1.36, 1000: 2.18, 2400: 3.5, 5800: 5.7 } },
  'rg-59':   { name: 'RG-59/U',      z0: 75, vf: 0.66, od_mm: 6.15, fmax_ghz: 1.5,
    atten_db_per_100ft: { 100: 3.6, 400: 7.5, 900: 11.4, 1500: 14.6 } },
  'ut-141':  { name: 'UT-141',       z0: 50, vf: 0.70, od_mm: 3.58, fmax_ghz: 22,
    atten_db_per_100ft: { 1000: 14.0, 6000: 36.0, 18000: 67.0, 22000: 75.0 } },
}

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
  const q = (query || '').toLowerCase().replace(/[\s-/]/g, '')
  const out = []
  for (const [id, item] of Object.entries(db)) {
    const hay = (id + ' ' + item.name).toLowerCase().replace(/[\s-/]/g, '')
    if (hay.includes(q)) out.push({ id, ...item })
  }
  return out
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
]

// ── dispatcher ─────────────────────────────────────────
export function dispatchRfTool(name, input) {
  try {
    switch (name) {
      case 'lookup_rf_cable': {
        const matches = searchDB(RF_CABLE_DB, input.query)
        if (matches.length === 0) return { matches: [], available_ids: Object.keys(RF_CABLE_DB), note: `No match for "${input.query}".` }
        return { matches: matches.slice(0, 6) }
      }
      case 'lookup_connector': {
        const matches = searchDB(CONNECTOR_DB, input.query)
        if (matches.length === 0) return { matches: [], available_ids: Object.keys(CONNECTOR_DB), note: `No match for "${input.query}".` }
        return { matches: matches.slice(0, 6) }
      }
      case 'compute_attenuation': {
        const { cable_id, freq_mhz, length_ft } = input
        const cable = RF_CABLE_DB[cable_id]
        if (!cable) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_rf_cable.`)
        if (!(freq_mhz > 0 && length_ft > 0)) throw new Error('freq_mhz and length_ft must be positive')
        const dbPer100 = interpAtten(cable.atten_db_per_100ft, freq_mhz)
        const total = (dbPer100 / 100) * length_ft
        return {
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
        if (tx_cable_id && tx_cable_ft > 0) {
          const c = RF_CABLE_DB[tx_cable_id]
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
          const c = RF_CABLE_DB[rx_cable_id]
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
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: err.message || 'Tool execution failed' }
  }
}

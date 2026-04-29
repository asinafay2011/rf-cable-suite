// Tools exposed to the RF agent. Pure-math + small DBs, client-side dispatch.
import { getCustomRfCables, addCustomRfCable, deleteCustomRfCable } from './customCableStore.js'
import { getCompanyDefaults, setCompanyDefaults, resetCompanyDefaults } from './companyDefaults.js'

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

// ── RF cable database (50 Ω + 75 Ω) ─────────────────────
// `datasheet` is an optional URL to the manufacturer datasheet PDF.
export const RF_CABLE_DB = {
  'rg-58':   { name: 'RG-58/U',      z0: 50, vf: 0.66, od_mm: 4.95, fmax_ghz: 1.0,
    atten_db_per_100ft: { 30: 2.5, 100: 4.4, 450: 9.9, 900: 14.8, 1000: 16.0, 2400: 26.0 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg58' },
  'rg-174':  { name: 'RG-174/U',     z0: 50, vf: 0.66, od_mm: 2.79, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 8.8, 400: 18.0, 900: 28.5, 1000: 30.0, 2400: 50.0, 3000: 56.0 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg174' },
  'rg-178':  { name: 'RG-178B/U',    z0: 50, vf: 0.69, od_mm: 1.83, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 14.0, 400: 29.0, 1000: 46.0, 3000: 84.0 },
    datasheet: 'https://www.pasternack.com/images/ProductPDF/RG178B-U.pdf' },
  'rg-213':  { name: 'RG-213/U',     z0: 50, vf: 0.66, od_mm: 10.3, fmax_ghz: 3.0,
    atten_db_per_100ft: { 30: 1.0, 100: 1.9, 400: 4.1, 900: 6.4, 1000: 6.9, 2400: 11.5 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg213' },
  'rg-316':  { name: 'RG-316/U',     z0: 50, vf: 0.69, od_mm: 2.49, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 9.0, 400: 18.5, 1000: 31.0, 3000: 60.0 },
    datasheet: 'https://www.pasternack.com/images/ProductPDF/RG316-U.pdf' },
  'rg-393':  { name: 'RG-393/U',     z0: 50, vf: 0.70, od_mm: 9.91, fmax_ghz: 12.4,
    atten_db_per_100ft: { 1000: 6.8, 5000: 16.2, 10000: 24.5, 12400: 28.0 },
    datasheet: 'https://www.pasternack.com/images/ProductPDF/RG393-U.pdf' },
  'lmr-100': { name: 'LMR-100A',     z0: 50, vf: 0.66, od_mm: 2.79, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 7.4, 400: 15.6, 1000: 25.5, 2400: 39.5, 5800: 64.0 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-100A.pdf' },
  'lmr-200': { name: 'LMR-200',      z0: 50, vf: 0.83, od_mm: 4.95, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 3.9, 400: 8.0, 1000: 12.7, 2400: 20.5, 5800: 33.0 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-200.pdf' },
  'lmr-240': { name: 'LMR-240',      z0: 50, vf: 0.84, od_mm: 6.10, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 3.0, 400: 6.4, 1000: 10.5, 2400: 16.5, 5800: 26.5 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-240.pdf' },
  'lmr-400': { name: 'LMR-400',      z0: 50, vf: 0.85, od_mm: 10.29, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 1.5, 400: 3.0, 1000: 4.8, 2400: 7.6, 5800: 12.5 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-400.pdf' },
  'lmr-600': { name: 'LMR-600',      z0: 50, vf: 0.87, od_mm: 14.99, fmax_ghz: 5.8,
    atten_db_per_100ft: { 100: 0.96, 400: 1.96, 1000: 3.1, 2400: 5.0, 5800: 8.2 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-600.pdf' },
  'lmr-900': { name: 'LMR-900',      z0: 50, vf: 0.87, od_mm: 22.10, fmax_ghz: 5.0,
    atten_db_per_100ft: { 100: 0.66, 400: 1.36, 1000: 2.16, 2400: 3.6, 5000: 5.4 },
    datasheet: 'https://timesmicrowave.com/DataSheets/CableProducts/LMR-900.pdf' },
  'heliax-ldf4-50a': { name: 'Heliax LDF4-50A (1/2")', z0: 50, vf: 0.88, od_mm: 12.7, fmax_ghz: 8.8,
    atten_db_per_100ft: { 30: 0.36, 100: 0.66, 400: 1.36, 1000: 2.18, 2400: 3.5, 5800: 5.7 },
    datasheet: 'https://www.commscope.com/globalassets/digizuite/2719-ldf4-50a-external.pdf' },
  'heliax-ldf5-50a': { name: 'Heliax LDF5-50A (7/8")', z0: 50, vf: 0.89, od_mm: 22.0, fmax_ghz: 5.0,
    atten_db_per_100ft: { 100: 0.36, 400: 0.74, 1000: 1.20, 2400: 1.94, 4000: 2.54 },
    datasheet: 'https://www.commscope.com/globalassets/digizuite/2723-ldf5-50a-external.pdf' },
  'rg-59':   { name: 'RG-59/U',      z0: 75, vf: 0.66, od_mm: 6.15, fmax_ghz: 1.5,
    atten_db_per_100ft: { 100: 3.6, 400: 7.5, 900: 11.4, 1500: 14.6 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg59' },
  'rg-6':    { name: 'RG-6/U (CATV)', z0: 75, vf: 0.83, od_mm: 6.86, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 2.0, 400: 4.0, 900: 5.7, 1000: 6.0, 2400: 9.8 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg6' },
  'rg-11':   { name: 'RG-11/U (75 Ω)', z0: 75, vf: 0.84, od_mm: 10.30, fmax_ghz: 3.0,
    atten_db_per_100ft: { 100: 1.4, 400: 3.0, 1000: 5.5, 2400: 9.5 },
    datasheet: 'https://www.belden.com/products/cable/coaxial/rg11' },
  'ut-141':  { name: 'UT-141 Semi-Rigid', z0: 50, vf: 0.70, od_mm: 3.58, fmax_ghz: 22,
    atten_db_per_100ft: { 1000: 14.0, 6000: 36.0, 18000: 67.0, 22000: 75.0 },
    datasheet: 'https://www.minicircuits.com/pdfs/UT141.pdf' },
  'ut-085':  { name: 'UT-085 Semi-Rigid', z0: 50, vf: 0.70, od_mm: 2.20, fmax_ghz: 33,
    atten_db_per_100ft: { 1000: 22.0, 6000: 56.0, 18000: 100.0, 33000: 138.0 },
    datasheet: 'https://www.minicircuits.com/pdfs/UT085.pdf' },
  'sucoflex-104': { name: 'Sucoflex 104 (HF Test)', z0: 50, vf: 0.77, od_mm: 6.50, fmax_ghz: 26.5,
    atten_db_per_100ft: { 1000: 7.7, 10000: 26.5, 18000: 36.4, 26500: 45.7 },
    datasheet: 'https://www.hubersuhner.com/en/documents-repository/technologies/pdf/data-sheets-rf/sucoflex-104.pdf' },
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
    name: 'design_dielectric_stack',
    description:
      'Design a PTFE tape dielectric stack for a coaxial RF cable to hit a target VP and/or Z₀. Picks tape densities (high-density 1.6 g/cm³ and/or low-density 0.7 g/cm³), tape thickness, overlap, and number of WTM passes. Returns a complete layer recipe + the predicted final OD/εᵣ_eff/VP/Z₀ + a one-click apply preset that fills the Dielectric Stack Designer tab. Use this whenever the engineer asks "build me a cable with conductor X and target VP/Z₀".',
    input_schema: {
      type: 'object',
      properties: {
        conductor_od_mm:   { type: 'number', description: 'Inner conductor OD in millimetres. Provide either this or conductor_od_inch.' },
        conductor_od_inch: { type: 'number', description: 'Inner conductor OD in inches. Will be converted to mm. Common RF inner-conductor sizes: 0.020 / 0.032 / 0.045 / 0.057 inch.' },
        target_vp:         { type: 'number', description: 'Target velocity factor as a fraction (0.65 .. 0.92). e.g. 0.80 for 80% VP. Optional if target_z0_ohm is given.' },
        target_z0_ohm:     { type: 'number', description: 'Target characteristic impedance in ohms (typically 50, 75, 100). Optional if only sizing for VP.' },
        tape_thickness_mm: { type: 'number', description: 'Nominal tape thickness in mm. Default 0.10 mm (typical PTFE skived tape).' },
        tape_width_mm:     { type: 'number', description: 'Tape width in mm. Default 6.35 mm (1/4 inch).' },
        overlap:           { type: 'string', description: 'Overlap mode: "butt" / "1/2" / "2/3" / "3/4". Default "1/2".' },
        tension_factor:    { type: 'number', description: 'WTM tension factor τ (0.7..1.0). Lower = tighter wrap, more compression. Default 0.92.' },
        prefer:            { type: 'string', description: '"hd" (all 1.6 g/cm³), "ld" (all 0.7 g/cm³), or "mix" (HD inside + LD outside). Default "mix".' },
      },
      required: [],
    },
  },
  {
    name: 'compute_tape_notches',
    description:
      'Predict Bragg suckout (notch) frequencies caused by a tape-wrapped dielectric. Uses f_n = n · c · VP / (2 · P) where P is the WTM pitch (axial period of the tape wrap). When multiple layers are stacked at the same pitch, the notch deepens; different pitches produce separate notches. Pass the existing layer stack to forecast which frequencies to watch on the VNA.',
    input_schema: {
      type: 'object',
      properties: {
        vp:         { type: 'number', description: 'Effective velocity factor of the cable (0..1). Use the VP predicted from the dielectric stack.' },
        layers:     { type: 'array',  description: 'Array of {tape_width_mm, overlap} (overlap = "butt"/"1/2"/"2/3"/"3/4" or numeric fraction 0..0.95).' },
        max_freq_ghz: { type: 'number', description: 'Highest frequency to scan (default 40 GHz).' },
        n_harmonics:  { type: 'number', description: 'Number of Bragg harmonics per pitch to report (default 3).' },
      },
      required: ['vp', 'layers'],
    },
  },
]

// ── dispatcher ─────────────────────────────────────────
export function dispatchRfTool(name, input) {
  try {
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
      case 'compute_attenuation': {
        const { cable_id, freq_mhz, length_ft } = input
        const merged = { ...RF_CABLE_DB, ...getCustomRfCables() }
        const cable = merged[cable_id]
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
          const c = ({ ...RF_CABLE_DB, ...getCustomRfCables() })[tx_cable_id]
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
          const c = ({ ...RF_CABLE_DB, ...getCustomRfCables() })[rx_cable_id]
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
          const c = merged[id]
          if (!c) return { id, error: `not found` }
          const dbPer100 = interpAtten(c.atten_db_per_100ft, freq_mhz)
          const total = (dbPer100 / 100) * length_ft
          return {
            id, name: c.name, z0: c.z0, vf: c.vf, od_mm: c.od_mm, fmax_ghz: c.fmax_ghz,
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
        const ref = merged[reference_id]
        if (!ref) throw new Error(`Unknown reference cable "${reference_id}"`)
        const refIL = interpAtten(ref.atten_db_per_100ft, freq_mhz)
        const alternatives = []
        for (const [id, c] of Object.entries(merged)) {
          if (id === reference_id) continue
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
        const c = merged[cable_id]
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
        const c = merged[cable_id]
        if (!c) throw new Error(`Unknown cable "${cable_id}"`)
        const length_m = length_ft / 3.28084
        const c_speed = 299792458
        const vf = c.vf || 0.66
        const tau_end = (2 * length_m) / (vf * c_speed)
        const lines = [`! Synthesized from rfTools.generate_touchstone`, `! Cable: ${c.name} (${cable_id}), VF=${vf}, length=${length_ft} ft`, `# MHz S MA R 50`]
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
        const result = designDielectricStack(input)
        return result
      }
      case 'compute_tape_notches': {
        const result = computeTapeNotches(input)
        return result
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

const _OVERLAP_MAP = { butt: 0, '1/2': 0.5, '2/3': 0.667, '3/4': 0.75 }
function _overlapFraction(o) {
  if (typeof o === 'number') return Math.min(0.95, Math.max(0, o))
  return _OVERLAP_MAP[o] ?? 0.5
}
function _overlapLayers(o) {
  const f = _overlapFraction(o)
  if (f <= 0.0001) return 1
  return Math.max(1, Math.round(1 / (1 - f)))
}

function designDielectricStack(input) {
  let { conductor_od_mm, conductor_od_inch, target_vp, target_z0_ohm,
        tape_thickness_mm = 0.10, tape_width_mm = 6.35,
        overlap = '1/2', tension_factor = 0.92, prefer = 'mix' } = input || {}

  if (conductor_od_mm == null && conductor_od_inch == null) {
    throw new Error('Need conductor_od_mm or conductor_od_inch.')
  }
  const d = conductor_od_mm != null ? conductor_od_mm : conductor_od_inch * 25.4
  if (!(d > 0.05 && d < 30)) throw new Error('Conductor OD looks wrong (expected 0.05–30 mm).')

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
  if (t_per_pass <= 0) throw new Error('Per-pass thickness is zero.')

  // Split target dielectric thickness between HD and LD layers
  const HD_thk_target = dielectricThk_target * f_HD
  const LD_thk_target = dielectricThk_target * (1 - f_HD)
  const HD_passes = Math.max(0, Math.round(HD_thk_target / t_per_pass))
  const LD_passes = Math.max(0, Math.round(LD_thk_target / t_per_pass))

  // Build the layer recipe (HD goes inside since high-εᵣ closer to conductor lowers loss
  // contribution from peripheral E-field; LD outside lifts VP)
  const layers = []
  if (HD_passes > 0) {
    layers.push({
      preset: 'high_density',
      density: 1.6,
      tape_thickness_mm,
      tape_width_mm,
      overlap: ovr,
      tension_factor,
      passes: HD_passes,
    })
  }
  if (LD_passes > 0) {
    layers.push({
      preset: 'low_density',
      density: 0.7,
      tape_thickness_mm,
      tape_width_mm,
      overlap: ovr,
      tension_factor,
      passes: LD_passes,
    })
  }
  // If everything rounded to zero (very thin dielectric), force at least one pass
  if (layers.length === 0) {
    layers.push({
      preset: 'high_density', density: 1.6,
      tape_thickness_mm, tape_width_mm, overlap: ovr, tension_factor,
      passes: 1,
    })
  }

  // Predict actual achieved geometry from the chosen integer passes
  let r = d / 2
  const stackOut = []
  for (const L of layers) {
    const t_total = L.tape_thickness_mm * _overlapLayers(L.overlap) * L.tension_factor * L.passes
    const eps_r = _densityToEps(L.density)
    stackOut.push({
      preset: L.preset, density: L.density, passes: L.passes,
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
    const P_axial = tape_width_mm * (1 - _overlapFraction(ovr))  // mm/rev
    if (P_axial <= 0) return null
    const f_GHz = (1e3 * 299792458 * VP_actual) / (2 * P_axial * 1e-3 * 1e9)
    return round(f_GHz, 2)
  })()

  return {
    targets: {
      conductor_od_mm: round(d, 4),
      target_vp: target_vp != null ? round(target_vp, 3) : null,
      target_z0_ohm: target_z0_ohm != null ? round(target_z0_ohm, 2) : null,
      eps_target: round(eps_target, 3),
    },
    composition: {
      mode,
      f_HD_by_log_radius: round(f_HD, 3),
      eps_HD: round(eps_HD, 3),
      eps_LD: round(eps_LD, 3),
    },
    layers: stackOut,
    predicted: {
      final_od_mm: round(finalOD, 4),
      eps_eff: round(eps_eff_actual, 4),
      vp: round(VP_actual, 4),
      z0_ohm: round(Z0_actual, 3),
      delta_z0: round(Z0_actual - (target_z0_ohm || 0), 2),
      delta_vp: target_vp != null ? round(VP_actual - target_vp, 4) : null,
      bragg_notch_1_ghz: notch1,
    },
    label: `${target_z0_ohm ? `${target_z0_ohm} Ω` : ''}${target_vp ? ` · ${(target_vp*100).toFixed(0)}% VP` : ''} · d=${d.toFixed(3)} mm`.trim(),
    _section: 'dielectric',
    _apply_preset: {
      conductor_od_mm: round(d, 4),
      target_z0: target_z0_ohm,
      layers: layers.map((L) => ({
        preset: L.preset,
        density: L.density,
        tape_thickness_mm: L.tape_thickness_mm,
        tape_width_mm: L.tape_width_mm,
        overlap: L.overlap,
        tension_factor: L.tension_factor,
        passes: L.passes,
      })),
    },
    notes: [
      mode === 'mix' && f_HD > 0 && f_HD < 1
        ? `HD inside (${(f_HD*100).toFixed(0)}% of log-radius), LD outside lowers VP-weighted losses while lifting VP.`
        : mode === 'hd' ? 'All HD — εᵣ_target ≥ εᵣ_HD, can\'t go higher with PTFE.'
        : mode === 'ld' ? 'All LD — εᵣ_target ≤ εᵣ_LD, can\'t go lower without ePTFE.'
        : null,
      Math.abs(Z0_actual - (target_z0_ohm || 0)) > 1
        ? `Achieved Z₀ ${Z0_actual.toFixed(1)} Ω is off target by ${(Z0_actual - (target_z0_ohm || 0)).toFixed(1)} Ω due to integer-pass rounding. Tune tension or tape thickness in the UI to dial it in.`
        : null,
      notch1 && notch1 < 40
        ? `First Bragg notch from ${ovr} wrap with ${tape_width_mm} mm tape predicted at ~${notch1} GHz. Use compute_tape_notches for full harmonic table.`
        : null,
    ].filter(Boolean),
  }
}

function computeTapeNotches(input) {
  const { vp = 0.7, layers = [], max_freq_ghz = 40, n_harmonics = 3 } = input || {}
  if (!(vp > 0 && vp < 1)) throw new Error('vp must be 0..1.')
  if (!Array.isArray(layers) || layers.length === 0) throw new Error('layers must be a non-empty array.')

  const c = 299792458
  // For each layer: pitch P = W × (1 − overlap). Then f_n = n × c × VP / (2 × P)
  const perLayer = layers.map((L, i) => {
    const W = L.tape_width_mm || L.W || 6.35
    const o = L.overlap ?? '1/2'
    const f = _overlapFraction(o)
    const pitch_mm = W * (1 - f)
    const P_m = pitch_mm * 1e-3
    const harmonics = []
    for (let n = 1; n <= n_harmonics; n++) {
      const f_hz = (n * c * vp) / (2 * P_m)
      const f_ghz = f_hz / 1e9
      if (f_ghz <= max_freq_ghz) harmonics.push({ n, f_ghz: round(f_ghz, 2), pitch_mm: round(pitch_mm, 3) })
    }
    return { layer_index: i, tape_width_mm: round(W, 3), overlap: o, pitch_mm: round(pitch_mm, 3), harmonics }
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
    formula: 'f_n = n · c · VP / (2 · P_axial),  P_axial = W · (1 − overlap)',
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

function round(x, n) {
  if (x == null || !isFinite(x)) return x
  const p = Math.pow(10, n || 2)
  return Math.round(x * p) / p
}

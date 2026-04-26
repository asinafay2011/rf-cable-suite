// Tools exposed to the Cable agent. Pure-math + small DB, client-side dispatch.
import { getCustomCableCables, addCustomCableCable, deleteCustomCableCable } from './customCableStore.js'

// ── Compact cable database (key high-speed / RF coax + datacable specs) ────
// Sources: Belden / Times Microwave / CommScope datasheets, Glenair Series 963.
// Atten[freq_mhz, dB_per_100ft]; vf as fraction; impedance Ω; capacitance pF/ft.
export const CABLE_DB = {
  'rg-58':   { name: 'RG-58/U',     family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 4.95,
    atten_db_per_100ft: { 100: 4.4, 400: 9.4, 900: 14.8, 1000: 16.0, 2400: 26.0 },
    notes: 'General-purpose RF jumper. Stranded center, single tinned-Cu braid. Solid PE dielectric.' },
  'rg-174':  { name: 'RG-174/U',    family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 2.79,
    atten_db_per_100ft: { 100: 8.8, 400: 18.0, 900: 28.5, 1000: 30.0, 2400: 50.0 },
    notes: 'Miniature RF, low power. Used for pigtails and intra-equipment.' },
  'rg-213':  { name: 'RG-213/U',    family: 'RG · 50 Ω', z0: 50, vf: 0.66, cap_pf_ft: 30.8, od_mm: 10.3,
    atten_db_per_100ft: { 100: 1.9, 400: 4.1, 900: 6.4, 1000: 6.9, 2400: 11.5 },
    notes: 'Higher-power RG-class. 7-strand center, double braid. Replaces RG-8.' },
  'lmr-100': { name: 'LMR-100A',    family: 'LMR · Wireless', z0: 50, vf: 0.66, cap_pf_ft: 25.0, od_mm: 2.79,
    atten_db_per_100ft: { 100: 7.4, 400: 15.6, 900: 24.1, 1000: 25.5, 2400: 39.5 },
    notes: 'Low-loss flexible 100 series. Better than RG-174 in same form factor.' },
  'lmr-240': { name: 'LMR-240',     family: 'LMR · Wireless', z0: 50, vf: 0.84, cap_pf_ft: 24.2, od_mm: 6.10,
    atten_db_per_100ft: { 100: 3.0, 400: 6.4, 900: 9.9, 1000: 10.5, 2400: 16.5 },
    notes: 'Lower-loss alternative to RG-58. Solid foam-PE, foil + braid.' },
  'lmr-400': { name: 'LMR-400',     family: 'LMR · Wireless', z0: 50, vf: 0.85, cap_pf_ft: 23.9, od_mm: 10.29,
    atten_db_per_100ft: { 100: 1.5, 400: 3.0, 900: 4.6, 1000: 4.8, 2400: 7.6 },
    notes: 'Industry-standard low-loss outdoor cable. Foam-PE dielectric, Al foil + tinned-Cu braid.' },
  'lmr-600': { name: 'LMR-600',     family: 'LMR · Wireless', z0: 50, vf: 0.87, cap_pf_ft: 23.0, od_mm: 14.99,
    atten_db_per_100ft: { 100: 0.96, 400: 1.96, 900: 3.0, 1000: 3.1, 2400: 5.0 },
    notes: 'Long-run low-loss for tower-top installs.' },
  'heliax-ldf4-50a': { name: 'Heliax LDF4-50A', family: 'Heliax · Rigid', z0: 50, vf: 0.88, cap_pf_ft: 22.8, od_mm: 12.7,
    atten_db_per_100ft: { 100: 0.66, 400: 1.36, 900: 2.07, 1000: 2.18, 2400: 3.5 },
    notes: 'Foam-PE, corrugated Cu outer. Industry workhorse for 1/2" feedline.' },
  'rg-59':   { name: 'RG-59/U',     family: 'RG · 75 Ω · Video', z0: 75, vf: 0.66, cap_pf_ft: 20.5, od_mm: 6.15,
    atten_db_per_100ft: { 100: 3.6, 400: 7.5, 900: 11.4, 1000: 12.0, 2400: 19.5 },
    notes: 'Video / CATV / CCTV. Solid PE.' },
  'cat6a-sftp': { name: 'Cat 6A S/FTP', family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.65, cap_pf_ft: 16.0, od_mm: 7.5,
    atten_db_per_100ft: { 100: 5.5, 250: 9.6, 500: 13.5 },
    notes: '4-pair shielded twisted pair. 26-23 AWG. PoE++ capable. Foil-shielded pairs + outer braid.' },
  'cat8':    { name: 'Cat 8 S/FTP', family: 'Datacable · 100 Ω diff', z0: 100, vf: 0.71, cap_pf_ft: 14.0, od_mm: 8.0,
    atten_db_per_100ft: { 100: 4.7, 500: 11.5, 1000: 17.0, 2000: 25.5 },
    notes: '40 GBASE-T, 30 m max. 22 AWG, foil per pair + overall braid.' },
  'sma-141': { name: 'UT-141 Semi-Rigid', family: 'Semi-rigid', z0: 50, vf: 0.70, cap_pf_ft: 28.0, od_mm: 3.58,
    atten_db_per_100ft: { 1000: 14.0, 6000: 36.0, 18000: 67.0 },
    notes: 'Solid Cu outer conductor. Used for SMA jumpers up to 18 GHz.' },
}

// Search the DB by partial name / family match (built-in + custom merged)
export function lookupCableDB(query) {
  if (!query) return []
  const q = query.toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
  const merged = { ...CABLE_DB, ...getCustomCableCables() }
  const results = []
  for (const [id, c] of Object.entries(merged)) {
    const haystack = (id + ' ' + (c.name || '') + ' ' + (c.family || '')).toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
    if (haystack.includes(q)) results.push({ id, ...c })
  }
  return results
}

export const CABLE_TOOLS = [
  {
    name: 'calc_z0_coax',
    description:
      'Calculate the characteristic impedance Z₀ of a coaxial cable from inner conductor diameter d, dielectric outer diameter D (over inner conductor), and dielectric permittivity εr. Formula: Z₀ = (138/√εᵣ)·log₁₀(D/d). Use when the user gives geometry/material numbers and wants an impedance, or vice-versa.',
    input_schema: {
      type: 'object',
      properties: {
        D: { type: 'number', description: 'Dielectric outer diameter in mm (the OD of the dielectric, before the shield)' },
        d: { type: 'number', description: 'Inner conductor diameter in mm' },
        er: { type: 'number', description: 'Relative permittivity εr of the dielectric (e.g., solid PE 2.30, foamed PE 1.5–1.7, PTFE 2.10, FEP 2.05)' },
      },
      required: ['D', 'd', 'er'],
    },
  },
  {
    name: 'calc_braid_coverage',
    description:
      'Compute optical coverage K of a single-layer braid per SCTE 51. K = (2F − F²)·100% where F is the fill factor. Returns coverage %, helix angle α, and a verdict band. Use whenever the user asks about braid shielding, coverage, or how many carriers/picks they need.',
    input_schema: {
      type: 'object',
      properties: {
        N: { type: 'number', description: 'Total number of carriers (typical 16, 24, 36, 48)' },
        P: { type: 'number', description: 'Number of ends per carrier (typical 5–8)' },
        d: { type: 'number', description: 'Strand diameter in mm (typical 0.10–0.18 mm; AWG 36–40)' },
        D: { type: 'number', description: 'Cable diameter under braid in mm (the OD that the braid wraps)' },
        PR: { type: 'number', description: 'Picks per inch (typical 8–25)' },
      },
      required: ['N', 'P', 'd', 'D', 'PR'],
    },
  },
  {
    name: 'awg_to_mm',
    description:
      'Convert American Wire Gauge (AWG) to wire diameter in mm and inches. Formula: d_mm = 0.127·92^((36−AWG)/39).',
    input_schema: {
      type: 'object',
      properties: {
        awg: { type: 'number', description: 'AWG value (e.g., 30, 36, 40, 50)' },
      },
      required: ['awg'],
    },
  },
  {
    name: 'mm_to_awg',
    description:
      'Convert a wire diameter in mm to the nearest American Wire Gauge (AWG).',
    input_schema: {
      type: 'object',
      properties: {
        mm: { type: 'number', description: 'Wire diameter in mm' },
      },
      required: ['mm'],
    },
  },
  {
    name: 'velocity_factor',
    description:
      'Compute the velocity factor VF = 1/√εᵣ for a transmission line, and optionally the propagation delay over a given length. Use when the user asks about VF, propagation delay, electrical length, or wants to convert between physical and electrical length.',
    input_schema: {
      type: 'object',
      properties: {
        er: { type: 'number', description: 'Effective relative permittivity εr of the dielectric / line' },
        length_m: { type: 'number', description: 'Optional cable length in meters for delay calculation' },
      },
      required: ['er'],
    },
  },
  {
    name: 'pair_lay_skew',
    description:
      'First-order estimate of intra-pair skew (ps/m) for a twisted differential pair, given the pair lay length and the εr mismatch between the two wires. Use when the user asks about skew, lay length tradeoffs, or matched-impedance pairs.',
    input_schema: {
      type: 'object',
      properties: {
        lay_mm: { type: 'number', description: 'Pair lay length in mm (typical 8–17 mm for high-speed pairs)' },
        delta_er: { type: 'number', description: 'εr difference between the two wires of the pair (typical 0.01–0.05 from foaming or extrusion variation)' },
      },
      required: ['lay_mm', 'delta_er'],
    },
  },
  {
    name: 'lookup_cable',
    description:
      'Search the on-board cable database for a cable by partial name, family, or model number (e.g. "RG-58", "LMR", "Cat 6A", "Heliax", "75 ohm video"). Returns full specs (Z₀, VF, attenuation table, OD, capacitance, application notes) for matching cables. Use this whenever the user asks for specs of a named cable, compares cables, or wants real numbers instead of memorized estimates.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., "RG-58", "LMR-400", "Cat 8", "75 ohm video")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compute_attenuation',
    description:
      'Compute insertion loss (dB) over a given length at a given frequency for a known cable. Uses the cable\'s published attenuation table with √f scaling between datapoints. Use when the user asks for IL at a specific frequency / length / cable combination.',
    input_schema: {
      type: 'object',
      properties: {
        cable_id: { type: 'string', description: 'Cable id from the database (e.g., "rg-58", "lmr-400", "cat6a-sftp"). Use lookup_cable first if unsure.' },
        freq_mhz: { type: 'number', description: 'Frequency of interest in MHz' },
        length_ft: { type: 'number', description: 'Cable length in feet' },
      },
      required: ['cable_id', 'freq_mhz', 'length_ft'],
    },
  },
  {
    name: 'geometry_for_z0',
    description:
      'Given a target characteristic impedance Z₀ and dielectric εr, compute the required D/d ratio (and example concrete dimensions) for a coaxial geometry. Inverse of calc_z0_coax. Use when the user asks "what dimensions hit 50 Ω with foamed PE?" etc.',
    input_schema: {
      type: 'object',
      properties: {
        z0_target: { type: 'number', description: 'Target characteristic impedance in Ω (typical 50 or 75)' },
        er: { type: 'number', description: 'Relative permittivity εr of the dielectric' },
        d_mm: { type: 'number', description: 'Optional inner conductor diameter in mm — if provided, returns the matching D' },
      },
      required: ['z0_target', 'er'],
    },
  },
  {
    name: 'add_cable',
    description:
      'Save a new cable spec to the user\'s LOCAL library (browser localStorage). Survives close/reopen on this device. Use when the user gives you a datasheet or spec for a cable you want to remember. Required: id, name, z0; recommended: family, vf, cap_pf_ft, od_mm, atten_db_per_100ft (object: { freq_mhz: dB }), notes.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique slug identifier (e.g., "company-spec-A"). Lowercased automatically.' },
        name: { type: 'string', description: 'Display name (e.g., "Brian Spec Cable A")' },
        family: { type: 'string', description: 'Family / category for grouping (e.g., "RG · 50 Ω", "Datacable · 100 Ω diff")' },
        z0: { type: 'number', description: 'Characteristic impedance in Ω' },
        vf: { type: 'number', description: 'Velocity factor as fraction' },
        cap_pf_ft: { type: 'number', description: 'Capacitance per foot in pF' },
        od_mm: { type: 'number', description: 'Cable outer diameter in mm' },
        atten_db_per_100ft: {
          type: 'object',
          description: 'Object mapping frequency (MHz) to attenuation (dB/100ft). Example: { "100": 4.4, "1000": 16.0 }',
          additionalProperties: { type: 'number' },
        },
        notes: { type: 'string', description: 'Free-form construction / application notes' },
      },
      required: ['id', 'name', 'z0'],
    },
  },
  {
    name: 'list_custom_cables',
    description: 'List all user-added (local) cables saved on this device.',
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
    name: 'lay_for_skew',
    description:
      'Inverse of pair_lay_skew: given a target intra-pair skew (ps/m) and an expected εr mismatch, compute the maximum pair lay length that meets the target. Use when the user asks "what lay length do I need for ≤ X ps/m skew?".',
    input_schema: {
      type: 'object',
      properties: {
        target_skew_ps_per_m: { type: 'number', description: 'Maximum allowed intra-pair skew in ps/m (Cat 6A ~25, Cat 8 ~7, USB4 ~5)' },
        delta_er: { type: 'number', description: 'εr difference between the two wires of the pair (typical 0.01–0.05)' },
      },
      required: ['target_skew_ps_per_m', 'delta_er'],
    },
  },
];

// ── helpers ─────────────────────────────────────────────
const num = (v, digits = 2) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(digits)) : v);

// ── dispatcher ──────────────────────────────────────────
export function dispatchCableTool(name, input) {
  try {
    switch (name) {
      case 'calc_z0_coax': {
        const { D, d, er } = input;
        if (!(D > 0 && d > 0 && er > 0)) throw new Error('D, d, er must be positive');
        if (D <= d) throw new Error('D (dielectric OD) must be greater than d (inner conductor OD)');
        const z0 = (138 / Math.sqrt(er)) * Math.log10(D / d);
        return {
          z0_ohm: num(z0, 2),
          formula: 'Z₀ = (138/√εᵣ) · log₁₀(D/d)',
          inputs: { D_mm: D, d_mm: d, er },
          notes: z0 < 30 || z0 > 200 ? 'Outside typical 30–200 Ω range; check units (mm vs in).' : undefined,
        };
      }
      case 'calc_braid_coverage': {
        const { N, P, d, D, PR } = input;
        if (!(N > 0 && P > 0 && d > 0 && D > 0 && PR > 0)) throw new Error('All inputs must be positive');
        const Cdir = N / 2;
        const R_in = (D + 2 * d) / 2 / 25.4;
        const d_in = d / 25.4;
        const alphaRad = Math.atan((2 * Math.PI * R_in * PR) / Cdir);
        const F = (P * PR * d_in) / Math.sin(alphaRad);
        const Fc = Math.max(0, Math.min(1, F));
        const K = (2 * Fc - Fc * Fc) * 100;
        const alpha_deg = (alphaRad * 180) / Math.PI;
        const verdict =
          K >= 95 ? 'EMI critical grade (aerospace, MIL, SpaceWire)' :
          K >= 85 ? 'High performance (Cat 6A, instrumentation)' :
          K >= 65 ? 'General purpose (low-EMI installs)' :
          'Insufficient — under-spec for most data cable';
        return {
          K_percent: num(K, 1),
          helix_angle_deg: num(alpha_deg, 1),
          fill_factor_F: num(Fc, 3),
          verdict,
          inputs: { N, P, d_mm: d, D_mm: D, PR },
        };
      }
      case 'awg_to_mm': {
        const { awg } = input;
        if (typeof awg !== 'number') throw new Error('awg required');
        const mm = 0.127 * Math.pow(92, (36 - awg) / 39);
        return { awg, mm: num(mm, 4), inch: num(mm / 25.4, 5) };
      }
      case 'mm_to_awg': {
        const { mm } = input;
        if (!(mm > 0)) throw new Error('mm must be positive');
        const awg = 36 - (39 * Math.log(mm / 0.127)) / Math.log(92);
        return { mm, awg_exact: num(awg, 2), awg_nearest: Math.round(awg) };
      }
      case 'velocity_factor': {
        const { er, length_m } = input;
        if (!(er > 0)) throw new Error('er must be positive');
        const vf = 1 / Math.sqrt(er);
        const c = 299792458; // m/s
        const result = { vf: num(vf, 4), vf_percent: num(vf * 100, 1), er };
        if (typeof length_m === 'number' && length_m > 0) {
          const delay_s = length_m / (vf * c);
          result.length_m = length_m;
          result.delay_ns = num(delay_s * 1e9, 2);
          result.delay_per_m_ns = num(1e9 / (vf * c), 3);
        }
        return result;
      }
      case 'pair_lay_skew': {
        const { lay_mm, delta_er } = input;
        if (!(lay_mm > 0 && delta_er >= 0)) throw new Error('lay_mm > 0 and delta_er >= 0 required');
        // First-order: skew (ps/m) ≈ lay_mm × delta_er × 50
        // Wire seeing higher εr propagates slower; over many turns, skew accumulates.
        const skew_ps_per_m = lay_mm * delta_er * 50;
        return {
          skew_ps_per_m: num(skew_ps_per_m, 1),
          skew_ps_per_ft: num(skew_ps_per_m * 0.3048, 1),
          inputs: { lay_mm, delta_er },
          notes: 'First-order estimate. Real skew depends on conductor orientation, twist symmetry, and material homogeneity. Cat 6A target ≤25 ps/m, USB4 / 25G+ targets ≤5 ps/m.',
        };
      }
      case 'lookup_cable': {
        const { query } = input;
        const matches = lookupCableDB(query);
        if (matches.length === 0) {
          return {
            matches: [],
            available_ids: Object.keys(CABLE_DB),
            note: `No match for "${query}". Try one of the available_ids above.`,
          };
        }
        return { matches: matches.slice(0, 6) };
      }
      case 'add_cable': {
        const { id, name, z0, family, vf, cap_pf_ft, od_mm, atten_db_per_100ft, notes } = input;
        if (!id || !name || !(z0 > 0)) throw new Error('id, name, and z0 (>0) are required');
        const result = addCustomCableCable({ id, name, z0, family, vf, cap_pf_ft, od_mm, atten_db_per_100ft, notes });
        return {
          ok: true,
          id: result.id,
          stored_at: 'browser localStorage (this device only)',
          note: 'Searchable via lookup_cable. Survives close/reopen on this device.',
        };
      }
      case 'list_custom_cables': {
        const map = getCustomCableCables();
        const list = Object.values(map);
        return { count: list.length, cables: list };
      }
      case 'delete_cable': {
        if (!input.id) throw new Error('id required');
        const ok = deleteCustomCableCable(input.id);
        return ok ? { ok: true, deleted: input.id } : { ok: false, error: `No custom cable with id "${input.id}". Use list_custom_cables to see what's saved.` };
      }
      case 'compute_attenuation': {
        const { cable_id, freq_mhz, length_ft } = input;
        // Combined DB so attenuation works for custom cables too
        const merged = { ...CABLE_DB, ...getCustomCableCables() };
        const cable = merged[cable_id];
        if (!cable) throw new Error(`Unknown cable_id "${cable_id}". Use lookup_cable first.`);
        if (!(freq_mhz > 0 && length_ft > 0)) throw new Error('freq_mhz and length_ft must be positive');
        // Interpolate dB/100ft using √f scaling between adjacent data points.
        const tbl = Object.entries(cable.atten_db_per_100ft)
          .map(([f, db]) => [parseFloat(f), db])
          .sort((a, b) => a[0] - b[0]);
        const fLo = tbl[0][0], fHi = tbl[tbl.length - 1][0];
        let db_per_100ft;
        if (freq_mhz <= fLo) {
          db_per_100ft = tbl[0][1] * Math.sqrt(freq_mhz / fLo);
        } else if (freq_mhz >= fHi) {
          db_per_100ft = tbl[tbl.length - 1][1] * Math.sqrt(freq_mhz / fHi);
        } else {
          for (let i = 0; i < tbl.length - 1; i++) {
            const [f1, a1] = tbl[i];
            const [f2, a2] = tbl[i + 1];
            if (freq_mhz >= f1 && freq_mhz <= f2) {
              const t = (Math.sqrt(freq_mhz) - Math.sqrt(f1)) / (Math.sqrt(f2) - Math.sqrt(f1));
              db_per_100ft = a1 + t * (a2 - a1);
              break;
            }
          }
        }
        const total_db = (db_per_100ft / 100) * length_ft;
        return {
          cable: cable.name,
          freq_mhz, length_ft,
          attenuation_db_per_100ft: num(db_per_100ft, 2),
          attenuation_db_total: num(total_db, 2),
          power_lost_percent: num((1 - Math.pow(10, -total_db / 10)) * 100, 1),
          notes: freq_mhz > fHi ? `Extrapolated above table (max ${fHi} MHz). Real loss may exceed estimate at higher freq due to dielectric losses.` : undefined,
        };
      }
      case 'geometry_for_z0': {
        const { z0_target, er, d_mm } = input;
        if (!(z0_target > 0 && er > 0)) throw new Error('z0_target and er must be positive');
        // Z₀ = (138/√εᵣ)·log10(D/d) → D/d = 10^(Z₀·√εᵣ/138)
        const Dd_ratio = Math.pow(10, (z0_target * Math.sqrt(er)) / 138);
        const result = {
          z0_target,
          er,
          D_over_d_ratio: num(Dd_ratio, 3),
          formula: 'D/d = 10^(Z₀·√εᵣ / 138)',
        };
        if (d_mm > 0) {
          result.d_mm = d_mm;
          result.D_mm = num(d_mm * Dd_ratio, 3);
        } else {
          // Provide example geometry for typical d values
          result.examples = [0.5, 0.91, 1.0, 1.63].map((d) => ({
            d_mm: d,
            D_mm: num(d * Dd_ratio, 3),
          }));
        }
        return result;
      }
      case 'lay_for_skew': {
        const { target_skew_ps_per_m, delta_er } = input;
        if (!(target_skew_ps_per_m > 0)) throw new Error('target_skew_ps_per_m must be positive');
        if (!(delta_er > 0)) throw new Error('delta_er must be positive');
        // Inverse of pair_lay_skew: skew = lay_mm × delta_er × 50  →  lay_mm = skew / (delta_er × 50)
        const lay_mm = target_skew_ps_per_m / (delta_er * 50);
        return {
          target_skew_ps_per_m,
          delta_er,
          max_lay_mm: num(lay_mm, 2),
          max_lay_inch: num(lay_mm / 25.4, 4),
          notes: lay_mm < 5 ? 'Required lay is shorter than 5 mm — consider tighter εr control instead of tighter lay.' : (lay_mm > 25 ? 'Lay > 25 mm is unusually loose; check manufacturability.' : 'Within typical lay-length range (5–25 mm).'),
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || 'Tool execution failed' };
  }
}

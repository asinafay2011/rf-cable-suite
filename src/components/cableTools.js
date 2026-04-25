// Tools exposed to the Cable agent. Pure-math, client-side dispatch — no DB.

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
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || 'Tool execution failed' };
  }
}

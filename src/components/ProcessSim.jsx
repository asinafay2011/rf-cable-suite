import React, { useState, useMemo, useEffect } from 'react'
import {
  Layers, Settings, AlertTriangle, CheckCircle2, Sparkles, RotateCcw,
  Save, Upload, Download, ChevronRight, Activity, Cable, Shield,
  Zap, Box, GitMerge, Atom, Beaker, ScrollText, Waves, Wand2, History,
} from 'lucide-react'
import { useToast } from './Toaster.jsx'

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
  bgCardHi: '#171d20',
  border: '#252e33',
  borderHi: '#384249',
  copper: '#c97b3f',
  copperBright: '#e89357',
  teal: '#5eead4',
  amber: '#fbbf24',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
}

// ── Material library ─────────────────────────────────────
const MATERIALS = {
  cu: { name: 'Copper (Cu)', rho_ohm_m: 1.68e-8, density: 8.96, cost_kg: 9.5 },
  spc: { name: 'Silver-plated Cu (SPC)', rho_ohm_m: 1.59e-8, density: 8.96, cost_kg: 17.5 },
  tc: { name: 'Tin-plated Cu (TC)', rho_ohm_m: 1.72e-8, density: 8.93, cost_kg: 10.0 },
  npc: { name: 'Nickel-plated Cu (NPC)', rho_ohm_m: 1.75e-8, density: 8.95, cost_kg: 12.5 },
}
const DIELECTRICS = {
  pe_solid: { name: 'Solid PE', er: 2.30, density: 0.94, cost_kg: 1.40, tmax: 80 },
  pe_foamed: { name: 'Foamed PE', er: 1.55, density: 0.55, cost_kg: 1.80, tmax: 80 },
  ptfe: { name: 'PTFE', er: 2.10, density: 2.20, cost_kg: 22.0, tmax: 200 },
  fep: { name: 'FEP', er: 2.05, density: 2.15, cost_kg: 28.0, tmax: 200 },
  fep_foamed: { name: 'Foamed FEP', er: 1.85, density: 1.60, cost_kg: 32.0, tmax: 200 },
  pfa: { name: 'PFA', er: 2.05, density: 2.15, cost_kg: 35.0, tmax: 250 },
  eptfe: { name: 'ePTFE', er: 1.30, density: 0.60, cost_kg: 45.0, tmax: 200 },
}
const JACKETS = {
  pvc: { name: 'PVC', density: 1.40, cost_kg: 1.20, flex: 'good', tmax: 80 },
  lszh: { name: 'LSZH', density: 1.50, cost_kg: 2.20, flex: 'fair', tmax: 90 },
  fep_jkt: { name: 'FEP', density: 2.15, cost_kg: 28.0, flex: 'fair', tmax: 200 },
  tpu: { name: 'TPU', density: 1.20, cost_kg: 4.00, flex: 'excellent', tmax: 100 },
  pur: { name: 'PUR', density: 1.18, cost_kg: 4.50, flex: 'excellent', tmax: 90 },
}

// ── Standard targets ────────────────────────────────────
const STANDARDS = {
  custom: { name: 'Custom', z0_diff: 100, z0_tol: 5, max_il_db_per_100m: 30, freq_il_mhz: 500, min_next_db: 40, freq_next_mhz: 100, max_skew_ps_per_m: 45 },
  cat6a:  { name: 'Cat 6A',  z0_diff: 100, z0_tol: 8, max_il_db_per_100m: 30.5, freq_il_mhz: 500,  min_next_db: 39.9, freq_next_mhz: 100, max_skew_ps_per_m: 45 },
  cat8:   { name: 'Cat 8',   z0_diff: 100, z0_tol: 8, max_il_db_per_100m: 67.0, freq_il_mhz: 2000, min_next_db: 13.1, freq_next_mhz: 2000, max_skew_ps_per_m: 25 },
  usb4:   { name: 'USB4',    z0_diff: 100, z0_tol: 7, max_il_db_per_100m: 50.0, freq_il_mhz: 10000, min_next_db: 30.0, freq_next_mhz: 5000, max_skew_ps_per_m: 5 },
  rg58:   { name: 'RG-58 (50Ω coax)', z0_diff: 50, z0_tol: 3, max_il_db_per_100m: 53.0, freq_il_mhz: 1000, min_next_db: 0, freq_next_mhz: 1, max_skew_ps_per_m: 0 },
}

// ── Pair-wrap (binder) materials ────────────────────────
const WRAP_MATERIALS = {
  none:         { name: 'None (no wrap)', er: 1.0, density: 0, cost_kg: 0, tmax: 0 },
  ptfe_tape:    { name: 'PTFE tape',      er: 2.10, density: 2.20, cost_kg: 22.0, tmax: 200 },
  eptfe_tape:   { name: 'ePTFE tape',     er: 1.30, density: 0.60, cost_kg: 45.0, tmax: 200 },
  polyester:    { name: 'Polyester (Mylar) tape', er: 3.20, density: 1.40, cost_kg: 3.50, tmax: 105 },
  paper:        { name: 'Paper binder',   er: 2.50, density: 0.90, cost_kg: 1.20, tmax: 80 },
  polyimide:    { name: 'Polyimide (Kapton)', er: 3.40, density: 1.42, cost_kg: 25.0, tmax: 250 },
}
// Pair-foil shield materials (laminated foil + carrier)
const FOIL_MATERIALS = {
  al_polyester: { name: 'Al / polyester', density: 1.50, cost_kg: 4.00, thickness_mm: 0.025 },
  cu_polyester: { name: 'Cu / polyester', density: 4.00, cost_kg: 9.00, thickness_mm: 0.025 },
  al_polyimide: { name: 'Al / polyimide', density: 1.55, cost_kg: 18.0, thickness_mm: 0.025 },
  none:         { name: 'None', density: 0, cost_kg: 0, thickness_mm: 0 },
}

// ── Default recipe ──────────────────────────────────────
const DEFAULT_RECIPE = {
  product: { target: 'cat6a' },
  conductor: { rod_d_mm: 8.0, target_awg: 24, material: 'spc', anneal_c: 480, line_m_min: 800 },
  stranding: { enabled: false, strand_count: 7, lay_mm: 12 },
  insulation: { material: 'fep_foamed', wall_mm: 0.24, line_m_min: 200, melt_c: 320 },
  pair: { lay_mm: 13, direction: 'S', tension_n: 8 },
  pair_wrap: { material: 'ptfe_tape', overlap_pct: 25, wall_mm: 0.05 },
  pair_foil: { material: 'al_polyester', overlap_pct: 25, drain_wire: true, drain_awg: 28 },
  bundle: { pair_count: 4, lay_diversity: true, filler: 'x_spline', bundle_lay_mm: 80 },
  shield: { foil: true, foil_overlap: 25, braid_enabled: true, braid_N: 24, braid_P: 7, braid_d_mm: 0.13, braid_PR: 14, braid_material: 'spc' },
  jacket: { material: 'lszh', wall_mm: 0.5 },
  test: { length_m: 100, freq_mhz: 500 },
}

// ── Recipe templates (one-click factory presets) ────────
// Each template is a complete recipe object. Picking one in the UI calls setRecipe(...)
// which propagates through the entire 9-stage pipeline. Compose realistic baselines,
// not idealised PASS recipes — engineer should still iterate.
const RECIPE_TEMPLATES = {
  default:    { name: 'Default baseline (Cat 6A)', recipe: DEFAULT_RECIPE },
  cat6a_sftp: {
    name: 'Cat 6A S/FTP (foiled-pair + braid)',
    recipe: {
      product: { target: 'cat6a' },
      conductor: { rod_d_mm: 8.0, target_awg: 23, material: 'spc', anneal_c: 480, line_m_min: 800 },
      stranding: { enabled: false, strand_count: 7, lay_mm: 12 },
      insulation: { material: 'fep_foamed', wall_mm: 0.22, line_m_min: 250, melt_c: 320 },
      pair: { lay_mm: 13, direction: 'S', tension_n: 8 },
      pair_wrap: { material: 'polyester', overlap_pct: 25, wall_mm: 0.04 },
      pair_foil: { material: 'al_polyester', overlap_pct: 30, drain_wire: true, drain_awg: 28 },
      bundle: { pair_count: 4, lay_diversity: true, filler: 'x_spline', bundle_lay_mm: 80 },
      shield: { foil: true, foil_overlap: 25, braid_enabled: true, braid_N: 24, braid_P: 7, braid_d_mm: 0.13, braid_PR: 14, braid_material: 'spc' },
      jacket: { material: 'lszh', wall_mm: 0.5 },
      test: { length_m: 100, freq_mhz: 500 },
    },
  },
  cat8: {
    name: 'Cat 8 (40 GbE, 2 GHz)',
    recipe: {
      product: { target: 'cat8' },
      conductor: { rod_d_mm: 8.0, target_awg: 22, material: 'spc', anneal_c: 500, line_m_min: 700 },
      stranding: { enabled: false, strand_count: 7, lay_mm: 12 },
      insulation: { material: 'fep_foamed', wall_mm: 0.30, line_m_min: 220, melt_c: 320 },
      pair: { lay_mm: 9, direction: 'S', tension_n: 10 },
      pair_wrap: { material: 'eptfe_tape', overlap_pct: 30, wall_mm: 0.04 },
      pair_foil: { material: 'al_polyimide', overlap_pct: 30, drain_wire: true, drain_awg: 26 },
      bundle: { pair_count: 4, lay_diversity: true, filler: 'x_spline', bundle_lay_mm: 70 },
      shield: { foil: true, foil_overlap: 30, braid_enabled: true, braid_N: 24, braid_P: 8, braid_d_mm: 0.12, braid_PR: 16, braid_material: 'spc' },
      jacket: { material: 'lszh', wall_mm: 0.6 },
      test: { length_m: 30, freq_mhz: 2000 },
    },
  },
  usb4: {
    name: 'USB4 / TB4 (20 GHz, low skew)',
    recipe: {
      product: { target: 'usb4' },
      conductor: { rod_d_mm: 8.0, target_awg: 30, material: 'spc', anneal_c: 460, line_m_min: 600 },
      stranding: { enabled: true, strand_count: 7, lay_mm: 6 },
      insulation: { material: 'fep_foamed', wall_mm: 0.18, line_m_min: 180, melt_c: 320 },
      pair: { lay_mm: 6, direction: 'S', tension_n: 6 },
      pair_wrap: { material: 'eptfe_tape', overlap_pct: 30, wall_mm: 0.025 },
      pair_foil: { material: 'al_polyimide', overlap_pct: 30, drain_wire: true, drain_awg: 32 },
      bundle: { pair_count: 4, lay_diversity: true, filler: 'x_spline', bundle_lay_mm: 40 },
      shield: { foil: true, foil_overlap: 30, braid_enabled: true, braid_N: 16, braid_P: 6, braid_d_mm: 0.08, braid_PR: 18, braid_material: 'spc' },
      jacket: { material: 'tpu', wall_mm: 0.4 },
      test: { length_m: 1, freq_mhz: 10000 },
    },
  },
  rg58: {
    name: 'RG-58 (50 Ω coax)',
    recipe: {
      product: { target: 'rg58' },
      conductor: { rod_d_mm: 8.0, target_awg: 20, material: 'tc', anneal_c: 460, line_m_min: 900 },
      stranding: { enabled: true, strand_count: 19, lay_mm: 14 },
      insulation: { material: 'pe_solid', wall_mm: 0.81, line_m_min: 250, melt_c: 200 },
      pair: { lay_mm: 0, direction: 'S', tension_n: 0 },
      pair_wrap: { material: 'none', overlap_pct: 0, wall_mm: 0 },
      pair_foil: { material: 'none', overlap_pct: 0, drain_wire: false, drain_awg: 0 },
      bundle: { pair_count: 1, lay_diversity: false, filler: 'none', bundle_lay_mm: 0 },
      shield: { foil: false, foil_overlap: 0, braid_enabled: true, braid_N: 16, braid_P: 7, braid_d_mm: 0.16, braid_PR: 12, braid_material: 'tc' },
      jacket: { material: 'pvc', wall_mm: 0.7 },
      test: { length_m: 100, freq_mhz: 1000 },
    },
  },
  rg6: {
    name: 'RG-6 (75 Ω CATV)',
    recipe: {
      product: { target: 'custom' },
      conductor: { rod_d_mm: 8.0, target_awg: 18, material: 'cu', anneal_c: 480, line_m_min: 1000 },
      stranding: { enabled: false, strand_count: 1, lay_mm: 0 },
      insulation: { material: 'pe_foamed', wall_mm: 1.85, line_m_min: 250, melt_c: 200 },
      pair: { lay_mm: 0, direction: 'S', tension_n: 0 },
      pair_wrap: { material: 'none', overlap_pct: 0, wall_mm: 0 },
      pair_foil: { material: 'al_polyester', overlap_pct: 50, drain_wire: false, drain_awg: 0 },
      bundle: { pair_count: 1, lay_diversity: false, filler: 'none', bundle_lay_mm: 0 },
      shield: { foil: true, foil_overlap: 50, braid_enabled: true, braid_N: 16, braid_P: 4, braid_d_mm: 0.12, braid_PR: 22, braid_material: 'tc' },
      jacket: { material: 'pvc', wall_mm: 0.6 },
      test: { length_m: 100, freq_mhz: 1000 },
    },
  },
  lmr400: {
    name: 'LMR-400 style (50 Ω low-loss)',
    recipe: {
      product: { target: 'custom' },
      conductor: { rod_d_mm: 8.0, target_awg: 10, material: 'cu', anneal_c: 500, line_m_min: 600 },
      stranding: { enabled: false, strand_count: 1, lay_mm: 0 },
      insulation: { material: 'pe_foamed', wall_mm: 2.30, line_m_min: 200, melt_c: 200 },
      pair: { lay_mm: 0, direction: 'S', tension_n: 0 },
      pair_wrap: { material: 'none', overlap_pct: 0, wall_mm: 0 },
      pair_foil: { material: 'al_polyester', overlap_pct: 50, drain_wire: false, drain_awg: 0 },
      bundle: { pair_count: 1, lay_diversity: false, filler: 'none', bundle_lay_mm: 0 },
      shield: { foil: true, foil_overlap: 50, braid_enabled: true, braid_N: 16, braid_P: 5, braid_d_mm: 0.16, braid_PR: 16, braid_material: 'tc' },
      jacket: { material: 'pvc', wall_mm: 1.0 },
      test: { length_m: 100, freq_mhz: 2400 },
    },
  },
  rg174_lowcost: {
    name: 'RG-174 (50 Ω, jumper / low-cost)',
    recipe: {
      product: { target: 'custom' },
      conductor: { rod_d_mm: 8.0, target_awg: 26, material: 'tc', anneal_c: 460, line_m_min: 900 },
      stranding: { enabled: true, strand_count: 7, lay_mm: 8 },
      insulation: { material: 'pe_solid', wall_mm: 0.50, line_m_min: 280, melt_c: 200 },
      pair: { lay_mm: 0, direction: 'S', tension_n: 0 },
      pair_wrap: { material: 'none', overlap_pct: 0, wall_mm: 0 },
      pair_foil: { material: 'none', overlap_pct: 0, drain_wire: false, drain_awg: 0 },
      bundle: { pair_count: 1, lay_diversity: false, filler: 'none', bundle_lay_mm: 0 },
      shield: { foil: false, foil_overlap: 0, braid_enabled: true, braid_N: 16, braid_P: 5, braid_d_mm: 0.10, braid_PR: 14, braid_material: 'tc' },
      jacket: { material: 'pvc', wall_mm: 0.4 },
      test: { length_m: 100, freq_mhz: 1000 },
    },
  },
}

// ── Helpers ─────────────────────────────────────────────
function awgToMm(awg) { return 0.127 * Math.pow(92, (36 - awg) / 39) }
function mmIn(mm, mmDecimals = 3) {
  if (mm == null || isNaN(mm)) return '—'
  const inchDecimals = mmDecimals + 1
  return `${mm.toFixed(mmDecimals)} mm / ${(mm / 25.4).toFixed(inchDecimals)}″`
}

// ── Stage compute functions ─────────────────────────────

function computeConductor(p) {
  const d = awgToMm(p.target_awg)
  const m = MATERIALS[p.material]
  const area_m2 = Math.PI * Math.pow(d * 1e-3 / 2, 2)
  const mass_g_per_m = area_m2 * m.density * 1000 * 1000  // g/m
  const cost_per_m = (mass_g_per_m / 1000) * m.cost_kg
  // Yield: high speed + harder material lower yield
  const speed_factor = Math.max(0.85, 1 - (p.line_m_min - 500) / 5000)
  const yield_pct = Math.min(99.5, 99 * speed_factor)
  const warn = []
  if (p.line_m_min > 1000) warn.push('Line speed > 1000 m/min: drawing tension stress, watch for breaks')
  if (p.anneal_c < 400) warn.push('Anneal temp < 400°C: brittleness, hard to terminate')
  return { strand_d_mm: d, mass_g_per_m, cost_per_m, yield_pct, warn, material: m, dc_R_per_m: m.rho_ohm_m / area_m2 }
}

function computeStranding(p, prev) {
  if (!p.enabled) return { conductor_d_mm: prev.strand_d_mm, mass_g_per_m: prev.mass_g_per_m, cost_per_m: prev.cost_per_m, yield_pct: 100, warn: [] }
  // Stranded conductor: N strands packed → effective diameter ~ strand_d × (1 + 2/√N) approx
  const eff_d = prev.strand_d_mm * (1 + 1.4 / Math.sqrt(p.strand_count))
  const total_mass = prev.mass_g_per_m * p.strand_count * 1.05  // 5% lay overhead
  const total_cost = prev.cost_per_m * p.strand_count * 1.05
  const yield_pct = 98.5
  const warn = []
  if (p.lay_mm < 6) warn.push('Strand lay < 6mm: very tight, mechanical stress')
  return { conductor_d_mm: eff_d, mass_g_per_m: total_mass, cost_per_m: total_cost, yield_pct, warn, strand_d_mm: prev.strand_d_mm, dc_R_per_m: prev.dc_R_per_m / p.strand_count }
}

function computeInsulation(p, prev) {
  const d = DIELECTRICS[p.material]
  const inner_d = prev.conductor_d_mm
  const outer_d = inner_d + 2 * p.wall_mm
  const ring_area_m2 = Math.PI * (Math.pow(outer_d * 1e-3 / 2, 2) - Math.pow(inner_d * 1e-3 / 2, 2))
  const mass_g_per_m = ring_area_m2 * d.density * 1000 * 1000
  const cost_per_m = (mass_g_per_m / 1000) * d.cost_kg
  // εr drift: foamed materials sensitive to line speed (cell collapse if too fast/slow)
  let er_eff = d.er
  if (p.material.includes('foamed') && p.line_m_min > 250) {
    er_eff += 0.05 * Math.min(2, (p.line_m_min - 250) / 100)
  }
  // Yield: optimal melt temp depends on material
  const optimal_melt = p.material.includes('fep') || p.material.includes('ptfe') ? 360 : 230
  const temp_offset = Math.abs(p.melt_c - optimal_melt)
  const yield_pct = Math.max(85, 98 - temp_offset * 0.1)
  const warn = []
  if (p.line_m_min > 250 && p.material.includes('foamed')) warn.push('Line speed > 250 m/min: foamed dielectric εr may drift +0.05 → Z₀ off-spec')
  if (temp_offset > 30) warn.push(`Melt temp ${p.melt_c}°C is ${temp_offset}°C off optimum (${optimal_melt}°C) — yield drops`)
  if (p.wall_mm < 0.15) warn.push('Wall < 0.15mm: extrusion eccentricity risk')
  // Capacitance per meter (single coax-like)
  const cap_pf_per_m = (55.6 * er_eff) / Math.log(outer_d / inner_d)
  return { insulated_d_mm: outer_d, mass_g_per_m, cost_per_m, yield_pct, warn, er_effective: er_eff, cap_pf_per_m, dielectric: d }
}

function computePair(p, prev) {
  // Twin-lead-ish differential Z₀ approximation
  // For two parallel insulated wires (touching), Z_diff ≈ (120/√εr) · cosh⁻¹(s/d)
  // Here s ≈ d (touching wires), so cosh⁻¹(1) = 0 → use practical approx for SDP
  // Better: empirical approach — twisted pair Z_diff ≈ 2·Z_single · (1 - k_proximity)
  const er = prev.er_effective
  const ins_d = prev.insulated_d_mm
  // Approximate single-wire Z₀ to ground at 50Ω-equivalent geometry then differential
  const z_single = 138 / Math.sqrt(er) * Math.log10(2 * ins_d / awgToMm(24))  // very rough
  const z_diff = Math.max(80, Math.min(120, 2 * z_single * 0.55))
  // Skew estimate: lay × εr non-uniformity
  // Lower lay = more turns → more sensitivity to εr mismatch
  const skew_ps_per_m = (1000 / p.lay_mm) * 0.2
  // Yield: tight lay ↔ tension stress
  const yield_pct = p.lay_mm < 8 ? 92 : p.lay_mm < 15 ? 96 : 94
  const warn = []
  if (p.lay_mm < 8) warn.push('Lay < 8mm: very tight, machining stress + bend radius problems')
  if (p.lay_mm > 20) warn.push('Lay > 20mm: poor NEXT (insufficient EM cancellation)')
  if (p.tension_n > 12) warn.push('Tension > 12N: insulation deformation, εr drift')
  // Pair effective OD ≈ ~2 × ins_d
  const pair_od_mm = 2 * ins_d * 1.05
  return { z_diff, skew_ps_per_m, pair_od_mm, yield_pct, warn, mass_g_per_m: prev.mass_g_per_m * 2, cost_per_m: prev.cost_per_m * 2, lay_mm: p.lay_mm }
}

function computePairWrap(p, prev) {
  if (p.material === 'none') {
    return { wrapped_pair_od_mm: prev.pair_od_mm, mass_g_per_m: prev.mass_g_per_m, cost_per_m: prev.cost_per_m, yield_pct: 100, warn: [], wrap: WRAP_MATERIALS.none, z_diff: prev.z_diff, skew_ps_per_m: prev.skew_ps_per_m, lay_mm: prev.lay_mm }
  }
  const w = WRAP_MATERIALS[p.material]
  const wrapped_od = prev.pair_od_mm + 2 * p.wall_mm
  // Wrap ring: tape spirals around with overlap
  const ring_area_m2 = Math.PI * (Math.pow(wrapped_od * 1e-3 / 2, 2) - Math.pow(prev.pair_od_mm * 1e-3 / 2, 2))
  const overlap_factor = 1 + p.overlap_pct / 100
  const mass_g_per_m = ring_area_m2 * w.density * 1000 * 1000 * overlap_factor
  const cost_per_m = (mass_g_per_m / 1000) * w.cost_kg
  const yield_pct = 97
  const warn = []
  if (p.overlap_pct < 15) warn.push('Wrap overlap < 15 %: gaps possible at flex, can leak between conductor and foil')
  if (p.material === 'paper') warn.push('Paper binder: not suitable for high-temp / wet environments')
  if (p.wall_mm < 0.03) warn.push('Wall < 0.03 mm: tape too thin, mechanical durability concern')
  // Pair Z₀ shifts slightly because dielectric envelope changes (very small effect)
  const z_diff_drift = (w.er - 1.0) * 0.5
  return {
    wrapped_pair_od_mm: wrapped_od,
    mass_g_per_m: prev.mass_g_per_m + mass_g_per_m,
    cost_per_m: prev.cost_per_m + cost_per_m,
    yield_pct,
    warn,
    wrap: w,
    z_diff: prev.z_diff - z_diff_drift,
    skew_ps_per_m: prev.skew_ps_per_m,
    lay_mm: prev.lay_mm,
  }
}

function computePairFoil(p, prev) {
  if (p.material === 'none') {
    return { shielded_pair_od_mm: prev.wrapped_pair_od_mm, mass_g_per_m: prev.mass_g_per_m, cost_per_m: prev.cost_per_m, yield_pct: 100, warn: [], foil: FOIL_MATERIALS.none, drain: null, z_diff: prev.z_diff, skew_ps_per_m: prev.skew_ps_per_m, lay_mm: prev.lay_mm, pair_zt_mohm_per_m: 1000 }
  }
  const f = FOIL_MATERIALS[p.material]
  const wrapped = prev.wrapped_pair_od_mm
  // Foil overlap: tape spirals — usually 25 % overlap
  const foil_thickness = f.thickness_mm
  const shielded_od = wrapped + 2 * foil_thickness + 0.05  // 50 µm tape + adhesive
  const ring_area_m2 = Math.PI * (Math.pow(shielded_od * 1e-3 / 2, 2) - Math.pow(wrapped * 1e-3 / 2, 2))
  const overlap_factor = 1 + p.overlap_pct / 100
  const foil_mass = ring_area_m2 * f.density * 1000 * 1000 * overlap_factor
  let foil_cost = (foil_mass / 1000) * f.cost_kg
  // Drain wire bonded to foil
  let drain_mass = 0, drain_cost = 0
  if (p.drain_wire) {
    const drain_d = awgToMm(p.drain_awg)
    const drain_area = Math.PI * Math.pow(drain_d * 1e-3 / 2, 2)
    drain_mass = drain_area * 8.96 * 1000 * 1000  // Cu g/m
    drain_cost = (drain_mass / 1000) * 9.5  // Cu cost / kg
  }
  const yield_pct = 95
  const warn = []
  if (p.overlap_pct < 25) warn.push('Foil overlap < 25 %: longitudinal seam may open at low bend radius — Zt jumps at HF')
  if (!p.drain_wire) warn.push('No drain wire: harder to terminate foil at connector → pigtail effect raises HF Zt')
  if (p.material === 'cu_polyester') warn.push('Cu foil: heavier and ~2× cost of Al foil; only needed for ultra-low-Zt')
  // Pair Zt model: ideal foil ≈ 1 mΩ/m at LF rising to ~10 mΩ/m at GHz; compromised by overlap quality
  const zt = 1 + (50 - p.overlap_pct) * 0.4
  return {
    shielded_pair_od_mm: shielded_od,
    mass_g_per_m: prev.mass_g_per_m + foil_mass + drain_mass,
    cost_per_m: prev.cost_per_m + foil_cost + drain_cost,
    yield_pct,
    warn,
    foil: f,
    drain: p.drain_wire ? { awg: p.drain_awg, mass_g_per_m: drain_mass } : null,
    z_diff: prev.z_diff,
    skew_ps_per_m: prev.skew_ps_per_m,
    lay_mm: prev.lay_mm,
    pair_zt_mohm_per_m: zt,
  }
}

function computeBundle(p, prev) {
  const N = p.pair_count
  // Use the shielded pair OD if available, else fall back to bare pair OD
  const single_pair_od = prev.shielded_pair_od_mm || prev.wrapped_pair_od_mm || prev.pair_od_mm
  const bundle_d_mm = single_pair_od * (N === 4 ? 2.4 : N === 2 ? 2.05 : 2.5)
  // NEXT estimate: lay diversity + pair count + per-pair foil shielding
  let next_db = 35
  if (p.lay_diversity) next_db += 12
  if (p.filler === 'x_spline') next_db += 3
  if (N === 2) next_db += 6
  // Per-pair foil shield gives a big NEXT bonus (~15 dB typical for Cat 6A S/FTP)
  if (prev.foil && prev.foil.thickness_mm > 0) next_db += 15
  // Mass: pairs + filler
  const filler_mass = p.filler === 'x_spline' ? 8 : p.filler === 'foam_filler' ? 4 : 2
  const mass_g_per_m = prev.mass_g_per_m * N + filler_mass
  const cost_per_m = prev.cost_per_m * N + (p.filler === 'x_spline' ? 0.25 : 0.10)
  const yield_pct = 96
  const warn = []
  if (!p.lay_diversity && N >= 4) warn.push('All pairs same lay: NEXT degrades by ~10dB; enable lay diversity for Cat 6A+')
  if (p.bundle_lay_mm < 50) warn.push('Bundle lay < 50mm: bundle bending limits, smaller minimum bend radius')
  return { bundle_d_mm, next_db_estimate: next_db, mass_g_per_m, cost_per_m, yield_pct, warn, pair_skew_ps_per_m: prev.skew_ps_per_m, z_diff: prev.z_diff }
}

function computeShield(p, prev) {
  let outer_d = prev.bundle_d_mm
  let extra_mass = 0
  let extra_cost = 0
  let coverage_pct = 0
  const warn = []
  if (p.foil) {
    outer_d += 0.05  // ~50µm foil + tape
    extra_mass += 1.5
    extra_cost += 0.15
    if (p.foil_overlap < 20) warn.push('Foil overlap < 20%: gaps possible at flex')
    coverage_pct = Math.max(coverage_pct, 100)  // foil = 100% optical
  }
  if (p.braid_enabled) {
    const Cdir = p.braid_N / 2
    const R_in = (outer_d + 2 * p.braid_d_mm) / 2 / 25.4
    const d_in = p.braid_d_mm / 25.4
    const alphaRad = Math.atan((2 * Math.PI * R_in * p.braid_PR) / Cdir)
    const F = (p.braid_P * p.braid_PR * d_in) / Math.sin(alphaRad)
    const Fc = Math.max(0, Math.min(1, F))
    const K = (2 * Fc - Fc * Fc) * 100
    coverage_pct = Math.max(coverage_pct, K)
    outer_d += 2 * p.braid_d_mm + 0.1
    // Braid mass: N × P × strand area × cable circumference
    const strand_area_m2 = Math.PI * Math.pow(p.braid_d_mm * 1e-3 / 2, 2)
    const braid_volume_per_m = p.braid_N * p.braid_P * strand_area_m2 * (1 / Math.cos(alphaRad))
    const braid_mat = MATERIALS[p.braid_material]
    extra_mass += braid_volume_per_m * braid_mat.density * 1000 * 1000  // g/m
    extra_cost += (extra_mass / 1000) * braid_mat.cost_kg
    if (K < 65) warn.push(`Braid coverage ${K.toFixed(0)}% — insufficient for shielded data`)
    if (alphaRad * 180 / Math.PI < 25) warn.push('Helix angle < 25°: braid binds, mechanical stress')
  }
  return {
    shielded_d_mm: outer_d,
    coverage_pct,
    foil: p.foil,
    mass_g_per_m: prev.mass_g_per_m + extra_mass,
    cost_per_m: prev.cost_per_m + extra_cost,
    yield_pct: 95,
    warn,
    pair_skew_ps_per_m: prev.pair_skew_ps_per_m,
    z_diff: prev.z_diff,
    next_db_estimate: prev.next_db_estimate,
    zt_mohm_per_m: 100 - coverage_pct * 0.9, // very rough
  }
}

function computeJacket(p, prev) {
  const j = JACKETS[p.material]
  const inner_d = prev.shielded_d_mm
  const outer_d = inner_d + 2 * p.wall_mm
  const ring_area_m2 = Math.PI * (Math.pow(outer_d * 1e-3 / 2, 2) - Math.pow(inner_d * 1e-3 / 2, 2))
  const mass_g_per_m = ring_area_m2 * j.density * 1000 * 1000
  const cost_per_m = (mass_g_per_m / 1000) * j.cost_kg
  const yield_pct = 97
  const warn = []
  if (p.wall_mm < 0.4) warn.push('Wall < 0.4mm: jacket may not survive pull-through cable trays')
  return {
    final_od_mm: outer_d,
    mass_g_per_m: prev.mass_g_per_m + mass_g_per_m,
    cost_per_m: prev.cost_per_m + cost_per_m,
    yield_pct, warn,
    z_diff: prev.z_diff,
    pair_skew_ps_per_m: prev.pair_skew_ps_per_m,
    next_db_estimate: prev.next_db_estimate,
    coverage_pct: prev.coverage_pct,
    flex_rating: j.flex,
    jacket: j,
  }
}

// Final IL calculation: skin loss + dielectric loss
function computeIL(prev, freq_mhz, length_m) {
  // Skin-effect loss (rough): α_R ≈ R_per_m / (2 × Z₀) with R from skin depth
  // We don't have all data; use empirical from atten table approx for foamed FEP Cat 6A:
  // 100 MHz: 5 dB/100m; 500 MHz: 18 dB/100m; 2 GHz: 38 dB/100m for Cat 6A
  // Scale with √f mostly + linear dielectric loss tan_d component
  const f_ghz = freq_mhz / 1000
  const il_per_100m = 5 * Math.sqrt(freq_mhz / 100) * 1.05  // ~empirical Cat 6A
  return (il_per_100m / 100) * length_m
}

// ── Pipeline runner used by the auto-fix optimizer (pure, no React state) ──
function runPipeline(recipe) {
  const conductor = computeConductor(recipe.conductor)
  const stranding = computeStranding(recipe.stranding, conductor)
  const insulation = computeInsulation(recipe.insulation, stranding)
  const pair = computePair(recipe.pair, insulation)
  const pair_wrap = computePairWrap(recipe.pair_wrap, pair)
  const pair_foil = computePairFoil(recipe.pair_foil, pair_wrap)
  const bundle = computeBundle(recipe.bundle, pair_foil)
  const shield = computeShield(recipe.shield, bundle)
  const jacket = computeJacket(recipe.jacket, shield)
  const il_db = computeIL(jacket, recipe.test.freq_mhz, recipe.test.length_m)
  return { conductor, stranding, insulation, pair, pair_wrap, pair_foil, bundle, shield, jacket, il_db }
}

// Score a recipe vs the standard. Lower score = better. 0 = passes everything.
// Each failing check contributes a normalised penalty so the optimizer can
// gradient-descend across parameter mutations.
function scoreRecipe(recipe) {
  const std = STANDARDS[recipe.product.target]
  const sim = runPipeline(recipe)
  let score = 0
  const z_off = Math.abs(sim.jacket.z_diff - std.z0_diff)
  if (z_off > std.z0_tol) score += (z_off - std.z0_tol) * 2
  const il = computeIL(sim.jacket, std.freq_il_mhz, 100)
  if (il > std.max_il_db_per_100m) score += (il - std.max_il_db_per_100m) * 0.5
  if (std.min_next_db > 0 && sim.jacket.next_db_estimate < std.min_next_db) {
    score += (std.min_next_db - sim.jacket.next_db_estimate) * 0.5
  }
  if (std.max_skew_ps_per_m > 0 && sim.jacket.pair_skew_ps_per_m > std.max_skew_ps_per_m) {
    score += (sim.jacket.pair_skew_ps_per_m - std.max_skew_ps_per_m) * 0.3
  }
  return { score, sim, std }
}

// Mutators: a tiny bag of "what would a process engineer try first" tweaks.
// Each entry returns a NEW recipe, leaves the input untouched.
const MUTATORS = [
  // Insulation wall: scale up or down 10 %
  (r) => ({ ...r, insulation: { ...r.insulation, wall_mm: clamp(r.insulation.wall_mm * 1.05, 0.10, 3.0) } }),
  (r) => ({ ...r, insulation: { ...r.insulation, wall_mm: clamp(r.insulation.wall_mm * 0.95, 0.10, 3.0) } }),
  // Pair lay: tighten / loosen 1 mm
  (r) => ({ ...r, pair: { ...r.pair, lay_mm: clamp(r.pair.lay_mm - 1, 5, 25) } }),
  (r) => ({ ...r, pair: { ...r.pair, lay_mm: clamp(r.pair.lay_mm + 1, 5, 25) } }),
  // Conductor AWG: thinner / thicker
  (r) => ({ ...r, conductor: { ...r.conductor, target_awg: clamp(r.conductor.target_awg - 1, 12, 40) } }),
  (r) => ({ ...r, conductor: { ...r.conductor, target_awg: clamp(r.conductor.target_awg + 1, 12, 40) } }),
  // Conductor material: try SPC if not already
  (r) => r.conductor.material === 'spc' ? r : ({ ...r, conductor: { ...r.conductor, material: 'spc' } }),
  // Insulation: try foamed PE if currently solid PE (lower εr → higher VF, lower IL)
  (r) => r.insulation.material === 'pe_solid' ? ({ ...r, insulation: { ...r.insulation, material: 'pe_foamed' } }) : r,
  // Insulation: try foamed FEP if currently FEP
  (r) => r.insulation.material === 'fep' ? ({ ...r, insulation: { ...r.insulation, material: 'fep_foamed' } }) : r,
  // Drop line speed 100 m/min (helps εr drift on foamed dielectric)
  (r) => ({ ...r, insulation: { ...r.insulation, line_m_min: clamp(r.insulation.line_m_min - 50, 100, 400) } }),
  // Tighten foil overlap to 30 %
  (r) => r.pair_foil.material === 'none' ? r : ({ ...r, pair_foil: { ...r.pair_foil, overlap_pct: clamp(r.pair_foil.overlap_pct + 5, 20, 50) } }),
  // Add picks/inch on the braid
  (r) => ({ ...r, shield: { ...r.shield, braid_PR: clamp(r.shield.braid_PR + 1, 6, 25) } }),
  (r) => ({ ...r, shield: { ...r.shield, braid_PR: clamp(r.shield.braid_PR - 1, 6, 25) } }),
  // More carriers on braid
  (r) => ({ ...r, shield: { ...r.shield, braid_N: clamp(r.shield.braid_N + 4, 8, 48) } }),
]
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Hill-climbing search: at each step, apply every mutator to the current best,
// keep whichever lowers the score the most. Stop on PASS or step budget.
// Returns { recipe, score, iterations, converged, history }
function autoFix(initial, maxSteps = 40) {
  let best = initial
  let bestScore = scoreRecipe(best).score
  const history = [{ step: 0, score: bestScore }]
  if (bestScore <= 0.01) return { recipe: best, score: bestScore, iterations: 0, converged: true, history }
  for (let step = 1; step <= maxSteps; step++) {
    let stepBest = null
    let stepBestScore = bestScore
    for (const mut of MUTATORS) {
      const candidate = mut(best)
      if (!candidate) continue
      const { score } = scoreRecipe(candidate)
      if (score < stepBestScore - 1e-6) {
        stepBest = candidate
        stepBestScore = score
      }
    }
    if (!stepBest) break  // no mutator improved → local minimum
    best = stepBest
    bestScore = stepBestScore
    history.push({ step, score: bestScore })
    if (bestScore <= 0.01) return { recipe: best, score: bestScore, iterations: step, converged: true, history }
  }
  return { recipe: best, score: bestScore, iterations: history.length - 1, converged: bestScore <= 0.01, history }
}

// ── React component ─────────────────────────────────────
export default function ProcessSim() {
  const toast = useToast()
  const [recipe, setRecipe] = useState(() => {
    try {
      const saved = localStorage.getItem('cablelab.process-sim-recipe')
      if (saved) return { ...DEFAULT_RECIPE, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_RECIPE
  })
  useEffect(() => {
    try { localStorage.setItem('cablelab.process-sim-recipe', JSON.stringify(recipe)) } catch {}
  }, [recipe])

  // Broadcast current state so the host (CableApp → agent) can read it
  // for context-aware help. Fired again whenever recipe / sim output changes.
  // (defined inside component so we have access to recipe + sim)
  // ⬇ effect attached after sim is computed below

  const update = (path) => (value) => {
    setRecipe((r) => {
      const copy = { ...r }
      const parts = path.split('.')
      let obj = copy
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] }
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return copy
    })
  }

  // Run pipeline
  const sim = useMemo(() => {
    const conductor = computeConductor(recipe.conductor)
    const stranding = computeStranding(recipe.stranding, conductor)
    const insulation = computeInsulation(recipe.insulation, stranding)
    const pair = computePair(recipe.pair, insulation)
    const pair_wrap = computePairWrap(recipe.pair_wrap, pair)
    const pair_foil = computePairFoil(recipe.pair_foil, pair_wrap)
    const bundle = computeBundle(recipe.bundle, pair_foil)
    const shield = computeShield(recipe.shield, bundle)
    const jacket = computeJacket(recipe.jacket, shield)
    const il_db = computeIL(jacket, recipe.test.freq_mhz, recipe.test.length_m)
    const total_yield_pct =
      (conductor.yield_pct / 100) *
      (stranding.yield_pct / 100) *
      (insulation.yield_pct / 100) *
      (pair.yield_pct / 100) *
      (pair_wrap.yield_pct / 100) *
      (pair_foil.yield_pct / 100) *
      (bundle.yield_pct / 100) *
      (shield.yield_pct / 100) *
      (jacket.yield_pct / 100) * 100
    return { conductor, stranding, insulation, pair, pair_wrap, pair_foil, bundle, shield, jacket, il_db, total_yield_pct }
  }, [recipe])

  const std = STANDARDS[recipe.product.target]

  // Push current state out to listeners (agent context). Fire only when recipe / sim
  // / std references actually change — otherwise the parent's setState triggers a
  // re-render here, which would re-fire this effect and create an infinite loop.
  useEffect(() => {
    const detail = { recipe, sim, std }
    window.dispatchEvent(new CustomEvent('processsim:state', { detail }))
  }, [recipe, sim, std])

  // Listen for agent-applied presets and route them into the corresponding stage of the
  // simulator instead of teleporting the user away to the standalone Braid / Z₀ Calc tab.
  useEffect(() => {
    const onApply = (e) => {
      const { section, params } = e.detail || {}
      if (!params) return
      if (section === 'braid') {
        setRecipe((r) => ({
          ...r,
          shield: {
            ...r.shield,
            braid_enabled: true,
            braid_N: params.N ?? r.shield.braid_N,
            braid_P: params.P ?? r.shield.braid_P,
            braid_d_mm: params.d ?? r.shield.braid_d_mm,
            braid_PR: params.PR ?? r.shield.braid_PR,
            braid_material: params.material ?? r.shield.braid_material,
          },
        }))
        toast.success(`Applied "${e.detail.label || 'preset'}" to outer shield (stage ⑧)`)
      } else if (section === 'calc') {
        // Z₀ preset: parameters affect the insulation stage's wall thickness + dielectric choice.
        // params has: D (insulated OD), d (conductor OD), er
        setRecipe((r) => {
          const next = { ...r, insulation: { ...r.insulation } }
          if (params.D != null && params.d != null) {
            next.insulation.wall_mm = parseFloat(((params.D - params.d) / 2).toFixed(3))
          }
          // Map εr → closest dielectric in DIELECTRICS table
          if (params.er != null) {
            const candidates = Object.entries(DIELECTRICS)
              .map(([id, d]) => ({ id, dist: Math.abs(d.er - params.er) }))
              .sort((a, b) => a.dist - b.dist)
            next.insulation.material = candidates[0].id
          }
          return next
        })
        toast.success(`Applied "${e.detail.label || 'preset'}" to insulation (stage ③)`)
      } else if (section === 'lay') {
        setRecipe((r) => ({
          ...r,
          pair: {
            ...r.pair,
            lay_mm: params.lay_mm ?? (Array.isArray(params.pair_lays_mm) && params.pair_lays_mm[0]) ?? r.pair.lay_mm,
            direction: params.direction ?? r.pair.direction,
            tension_n: params.tension_n ?? r.pair.tension_n,
          },
          bundle: {
            ...r.bundle,
            bundle_lay_mm: params.bundle_lay_mm ?? r.bundle.bundle_lay_mm,
          },
        }))
        toast.success(`Applied "${e.detail.label || 'preset'}" to pair / bundle (stages ④ / ⑦)`)
      }
    }
    window.addEventListener('cable-suite:apply-preset', onApply)
    return () => window.removeEventListener('cable-suite:apply-preset', onApply)
  }, [toast])

  const checks = useMemo(() => {
    const c = []
    const z_off = Math.abs(sim.jacket.z_diff - std.z0_diff)
    c.push({
      label: `Z₀ ${std.z0_diff} ±${std.z0_tol} Ω`,
      value: `${sim.jacket.z_diff.toFixed(1)} Ω`,
      ok: z_off <= std.z0_tol,
    })
    c.push({
      label: `IL ≤ ${std.max_il_db_per_100m} dB/100m @ ${std.freq_il_mhz} MHz`,
      value: `${(computeIL(sim.jacket, std.freq_il_mhz, 100)).toFixed(1)} dB/100m`,
      ok: computeIL(sim.jacket, std.freq_il_mhz, 100) <= std.max_il_db_per_100m,
    })
    if (std.min_next_db > 0) {
      c.push({
        label: `NEXT ≥ ${std.min_next_db} dB @ ${std.freq_next_mhz} MHz`,
        value: `${sim.jacket.next_db_estimate.toFixed(1)} dB`,
        ok: sim.jacket.next_db_estimate >= std.min_next_db,
      })
    }
    if (std.max_skew_ps_per_m > 0) {
      c.push({
        label: `Skew ≤ ${std.max_skew_ps_per_m} ps/m`,
        value: `${sim.jacket.pair_skew_ps_per_m.toFixed(1)} ps/m`,
        ok: sim.jacket.pair_skew_ps_per_m <= std.max_skew_ps_per_m,
      })
    }
    return c
  }, [sim, std])
  const allPass = checks.every((c) => c.ok)
  const someFail = checks.some((c) => !c.ok)

  const exportRecipe = () => {
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `process-recipe-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
    toast.success('Recipe exported as JSON')
  }
  const importRecipe = (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    file.text().then((t) => {
      try { setRecipe(JSON.parse(t)); toast.success('Recipe imported') }
      catch (err) { toast.error('Invalid JSON') }
    })
  }
  const resetRecipe = () => { setRecipe(DEFAULT_RECIPE); toast.info('Recipe reset to defaults') }
  const loadTemplate = (id) => {
    const t = RECIPE_TEMPLATES[id]
    if (!t) return
    setRecipe(t.recipe)
    addAnnotation(`Loaded template · ${t.name}`, t.recipe)
    toast.success(`Loaded template: ${t.name}`)
  }

  const [optimizing, setOptimizing] = useState(false)
  const runAutoFix = () => {
    if (allPass) { toast.info('Already passing — nothing to fix.'); return }
    setOptimizing(true)
    // Defer one tick so the spinner can paint before the synchronous search runs.
    setTimeout(() => {
      try {
        const result = autoFix(recipe, 50)
        setRecipe(result.recipe)
        addAnnotation(`Auto-fix · ${result.converged ? 'PASS' : 'best-effort'} (${result.iterations} steps)`, result.recipe)
        if (result.converged) {
          toast.success(`Auto-fix converged in ${result.iterations} step${result.iterations === 1 ? '' : 's'} — verdict should be PASS.`)
        } else {
          toast.info(`Auto-fix ran ${result.iterations} steps; best score ${result.score.toFixed(2)}. Some checks may still fail — continue tuning manually or change target.`)
        }
      } catch (err) {
        toast.error(`Auto-fix error: ${err.message || err}`)
      } finally {
        setOptimizing(false)
      }
    }, 30)
  }

  // ── Annotation history ────────────────────────────────────
  // A scrollable trail of "interesting" recipe states. The user can pin a
  // moment ("baseline before tweak") and restore later. Auto-fix and template
  // loads also record entries so the history shows what changed and when.
  const [annotations, setAnnotations] = useState(() => {
    try {
      const raw = localStorage.getItem('cablelab.process-sim-annotations')
      if (raw) return JSON.parse(raw)
    } catch {}
    return []
  })
  const [showHistory, setShowHistory] = useState(false)
  useEffect(() => {
    try { localStorage.setItem('cablelab.process-sim-annotations', JSON.stringify(annotations)) } catch {}
  }, [annotations])
  const addAnnotation = (label, snapshot) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: new Date().toISOString(),
      target: (snapshot || recipe).product?.target || 'custom',
      recipe: JSON.parse(JSON.stringify(snapshot || recipe)),
    }
    setAnnotations((list) => [entry, ...list].slice(0, 50))
  }
  const restoreAnnotation = (id) => {
    const entry = annotations.find((a) => a.id === id)
    if (!entry) return
    setRecipe(entry.recipe)
    toast.success(`Restored "${entry.label}"`)
  }
  const deleteAnnotation = (id) => {
    setAnnotations((list) => list.filter((a) => a.id !== id))
  }
  const clearAnnotations = () => {
    if (!window.confirm('Clear all recipe history?')) return
    setAnnotations([])
    toast.info('History cleared')
  }
  const pinCurrent = () => {
    const label = window.prompt('Pin this recipe as…', `Manual snapshot · ${std.name}`)
    if (!label) return
    addAnnotation(label, recipe)
    toast.success('Recipe pinned to history')
  }

  // ── Compare two pinned recipes side-by-side ──
  const [compareIds, setCompareIds] = useState([])
  const [compareOpen, setCompareOpen] = useState(false)
  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]  // FIFO when full
      return [...prev, id]
    })
  }

  // ── Diff explainer ────────────────────────────────────────
  // Compare current recipe to the most recent annotation. Surface key metric
  // deltas (Z₀, IL, mass, cost) so the engineer can see what their last tweak
  // bought them. Empty when there is no baseline yet.
  const baseline = annotations[0]
  const diffSummary = useMemo(() => {
    if (!baseline) return null
    const baseSim = runPipeline(baseline.recipe)
    const baseStd = STANDARDS[baseline.recipe.product?.target || 'cat6a']
    const cur = sim.jacket
    const base = baseSim.jacket
    const fmt = (n, d = 2) => (n == null || isNaN(n) ? '—' : n.toFixed(d))
    const arrow = (delta, eps) => Math.abs(delta) < eps ? '·' : (delta > 0 ? '↑' : '↓')
    const rows = [
      { key: 'Z₀ diff', cur: cur.z_diff, base: base.z_diff, unit: 'Ω', good: 'closer-to-target', target: std.z0_diff, eps: 0.05, decimals: 1 },
      { key: 'IL @ 100m', cur: computeIL(cur, std.freq_il_mhz, 100), base: computeIL(base, baseStd.freq_il_mhz, 100), unit: 'dB', good: 'lower', eps: 0.05, decimals: 1 },
      { key: 'NEXT', cur: cur.next_db_estimate, base: base.next_db_estimate, unit: 'dB', good: 'higher', eps: 0.1, decimals: 1 },
      { key: 'Skew', cur: cur.pair_skew_ps_per_m, base: base.pair_skew_ps_per_m, unit: 'ps/m', good: 'lower', eps: 0.5, decimals: 1 },
      { key: 'Mass', cur: cur.mass_g_per_m, base: base.mass_g_per_m, unit: 'g/m', good: 'lower', eps: 0.5, decimals: 0 },
      { key: 'Cost/m', cur: cur.cost_per_m, base: base.cost_per_m, unit: '$', good: 'lower', eps: 0.005, decimals: 3 },
      { key: 'Final OD', cur: cur.final_od_mm, base: base.final_od_mm, unit: 'mm', good: 'neutral', eps: 0.01, decimals: 2 },
    ]
    return rows.map((r) => {
      const delta = r.cur - r.base
      const a = arrow(delta, r.eps)
      // Interpret directional improvement
      let mood = 'neutral'
      if (a !== '·') {
        if (r.good === 'lower')           mood = delta < 0 ? 'good' : 'bad'
        else if (r.good === 'higher')     mood = delta > 0 ? 'good' : 'bad'
        else if (r.good === 'closer-to-target') {
          const wasOff = Math.abs(r.base - r.target)
          const nowOff = Math.abs(r.cur - r.target)
          mood = nowOff < wasOff ? 'good' : 'bad'
        }
      }
      return { ...r, delta, arrow: a, mood, fmt: fmt(r.cur, r.decimals), baseFmt: fmt(r.base, r.decimals), deltaFmt: fmt(delta, r.decimals) }
    })
  }, [sim, baseline, std])

  const anyDiff = diffSummary && diffSummary.some((r) => r.arrow !== '·')

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: C.copper }}>
          ◆ Process Sim · Manufacturing recipe → predicted specs
        </div>
        <h1 className="text-2xl font-light tracking-tight" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
          End-to-end cable manufacturing simulator
        </h1>
        <p className="text-[13px] text-[#a7b0b6] max-w-3xl leading-relaxed">
          Set a target (Cat 6A, Cat 8, USB4, custom), tweak parameters at any of the seven manufacturing
          stages, and the predicted final-cable specs update in real time. Each stage warns about
          parameter combinations that hurt yield or push the spec out of compliance.
        </p>
      </header>

      {/* Target picker + recipe controls */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] mb-1 flex items-center gap-1">
              <Sparkles size={10} /> Template
            </div>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { loadTemplate(e.target.value); e.target.value = '' } }}
              className="bg-[#0a0d0f] border border-[#5eead4]/30 rounded px-2 py-1 text-[12px] font-mono text-[#5eead4] focus:outline-none focus:border-[#5eead4]"
              title="Load a complete factory baseline recipe in one click"
            >
              <option value="">Load preset…</option>
              {Object.entries(RECIPE_TEMPLATES).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] mb-1">Target standard</div>
            <select
              value={recipe.product.target}
              onChange={(e) => update('product.target')(e.target.value)}
              className="bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1 text-[12px] font-mono text-[#fbbf24] focus:outline-none focus:border-[#c97b3f]"
            >
              {Object.entries(STANDARDS).map(([id, s]) => <option key={id} value={id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] mb-1">Test length</div>
            <input
              type="number" value={recipe.test.length_m}
              onChange={(e) => update('test.length_m')(parseFloat(e.target.value))}
              className="w-20 bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1 text-[12px] font-mono text-[#fbbf24]"
            /> <span className="text-[11px] text-[#6b7479]">m</span>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479] mb-1">Test freq</div>
            <input
              type="number" value={recipe.test.freq_mhz}
              onChange={(e) => update('test.freq_mhz')(parseFloat(e.target.value))}
              className="w-20 bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1 text-[12px] font-mono text-[#fbbf24]"
            /> <span className="text-[11px] text-[#6b7479]">MHz</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={pinCurrent} title="Save the current recipe to history with a label." className="px-2 py-1.5 text-[11px] font-mono uppercase rounded border bg-transparent flex items-center gap-1 text-[#a7b0b6] hover:text-[#5eead4]" style={{ borderColor: C.border }}>
            <Save size={11} /> Pin
          </button>
          <button onClick={() => setShowHistory((v) => !v)} title="Show / hide the recipe history sidebar." className="px-2 py-1.5 text-[11px] font-mono uppercase rounded border bg-transparent flex items-center gap-1 text-[#a7b0b6] hover:text-[#5eead4]" style={{ borderColor: showHistory ? C.teal + '60' : C.border, color: showHistory ? C.teal : '#a7b0b6' }}>
            <History size={11} /> History {annotations.length > 0 ? `(${annotations.length})` : ''}
          </button>
          <button onClick={resetRecipe} className="px-2 py-1.5 text-[11px] font-mono uppercase rounded border bg-transparent flex items-center gap-1 text-[#a7b0b6] hover:text-[#f87171]" style={{ borderColor: C.border }}>
            <RotateCcw size={11} /> Reset
          </button>
          <button onClick={exportRecipe} className="px-2 py-1.5 text-[11px] font-mono uppercase rounded border bg-transparent flex items-center gap-1 text-[#a7b0b6] hover:text-[#fbbf24]" style={{ borderColor: C.border }}>
            <Download size={11} /> Export
          </button>
          <label className="px-2 py-1.5 text-[11px] font-mono uppercase rounded border bg-transparent flex items-center gap-1 text-[#a7b0b6] hover:text-[#fbbf24] cursor-pointer" style={{ borderColor: C.border }}>
            <Upload size={11} /> Import
            <input type="file" accept=".json" onChange={importRecipe} className="hidden" />
          </label>
        </div>
      </div>

      {showHistory && (
        <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5eead4] flex items-center gap-2">
              <History size={11} /> Recipe history · {annotations.length} entr{annotations.length === 1 ? 'y' : 'ies'}
            </div>
            {annotations.length > 0 && (
              <button onClick={clearAnnotations} className="text-[10px] font-mono uppercase tracking-wider text-[#6b7479] hover:text-[#f87171]">
                Clear all
              </button>
            )}
          </div>
          {annotations.length === 0 ? (
            <div className="text-[11px] text-[#6b7479] italic py-3 text-center">
              No history yet. Click <span style={{ color: C.teal }}>Pin</span> to bookmark the current recipe, or load a template / run Auto-fix — those are recorded automatically.
            </div>
          ) : (
            <>
              {compareIds.length > 0 && (
                <div className="mb-2 px-2 py-1.5 bg-[#0d1f1d] border border-[#2f7a6e] rounded text-[10px] font-mono flex items-center justify-between gap-2">
                  <span style={{ color: C.teal }}>
                    {compareIds.length === 1 ? 'Pick a 2nd recipe to compare against, or' : `${compareIds.length} pinned for compare ·`}
                  </span>
                  <div className="flex items-center gap-2">
                    {compareIds.length === 2 && (
                      <button onClick={() => setCompareOpen(true)} className="px-2 py-1 rounded border" style={{ borderColor: C.teal, color: C.teal, background: 'transparent' }}>
                        → Open compare
                      </button>
                    )}
                    <button onClick={() => setCompareIds([])} className="text-[#6b7479] hover:text-[#f87171]">clear</button>
                  </div>
                </div>
              )}
              <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {annotations.map((a) => {
                  const inCompare = compareIds.includes(a.id)
                  return (
                    <li key={a.id} className={`flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-[#171d20] group`} style={inCompare ? { background: '#0d1f1d', borderLeft: `2px solid ${C.teal}` } : undefined}>
                      <button
                        onClick={() => toggleCompare(a.id)}
                        title={inCompare ? 'Remove from compare' : 'Add to compare (max 2)'}
                        className="text-[10px] font-mono w-5 h-5 rounded border flex items-center justify-center"
                        style={{ borderColor: inCompare ? C.teal : C.border, color: inCompare ? C.teal : C.textMuted }}
                      >
                        {inCompare ? '✓' : '+'}
                      </button>
                      <button
                        onClick={() => restoreAnnotation(a.id)}
                        className="flex-1 text-left truncate"
                        title={`${a.label}\n${new Date(a.timestamp).toLocaleString()}`}
                      >
                        <span style={{ color: C.copperBright }}>{a.label}</span>
                        <span className="text-[#6b7479] ml-2">· {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[#6b7479] ml-2">· {a.target}</span>
                      </button>
                      <button
                        onClick={() => deleteAnnotation(a.id)}
                        title="Remove from history"
                        className="opacity-0 group-hover:opacity-100 text-[#6b7479] hover:text-[#f87171] text-[10px] font-mono"
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Output specs panel — shown FIRST so user always sees the verdict */}
      <div className="bg-[#12171a] border rounded p-4" style={{ borderColor: allPass ? C.teal + '60' : someFail ? C.red + '60' : C.amber + '60' }}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">Compliance vs {std.name}</div>
            <div className="text-2xl font-light mt-0.5" style={{ color: allPass ? C.teal : someFail ? C.red : C.amber, fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              {allPass ? 'PASS' : someFail ? 'FAIL' : 'MARGINAL'}
            </div>
          </div>
          <Stat label="Final OD" value={mmIn(sim.jacket.final_od_mm, 2)} accent={C.copper} />
          <Stat label="Mass" value={`${sim.jacket.mass_g_per_m.toFixed(0)} g/m`} accent={C.copper} />
          <Stat label="Cost / m" value={`$${sim.jacket.cost_per_m.toFixed(2)}`} accent={C.amber} />
          <Stat label="Total yield" value={`${sim.total_yield_pct.toFixed(1)}%`} accent={sim.total_yield_pct < 80 ? C.red : C.teal} />
          <Stat label="Test result" value={`${sim.il_db.toFixed(1)} dB IL`} sub={`@ ${recipe.test.freq_mhz} MHz · ${recipe.test.length_m} m`} accent={C.copper} />
          <div className="ml-auto">
            <button
              onClick={runAutoFix}
              disabled={optimizing || allPass}
              title={allPass ? 'Already passing — nothing to fix' : 'Run a hill-climbing search that mutates wall thickness, lay, AWG, materials, and braid until all checks pass.'}
              className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider rounded border flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: allPass ? C.teal + '60' : C.copper + '80',
                background: optimizing ? C.copper + '20' : 'transparent',
                color: allPass ? C.teal : C.copperBright,
              }}
            >
              {optimizing ? <Activity size={12} className="animate-pulse" /> : <Wand2 size={12} />}
              {optimizing ? 'Optimising…' : 'Auto-fix'}
            </button>
          </div>
        </div>
        <ul className="space-y-1 text-[12px]">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: C.teal }} /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.red }} />}
              <span className="text-[#a7b0b6]">{c.label}: <span style={{ color: c.ok ? C.teal : C.red }}>{c.value}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {baseline && anyDiff && (
        <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5eead4]">
              ◆ Diff vs <span style={{ color: C.copperBright }}>{baseline.label}</span>
            </div>
            <button
              onClick={() => restoreAnnotation(baseline.id)}
              className="text-[10px] font-mono uppercase tracking-wider text-[#6b7479] hover:text-[#5eead4]"
              title="Restore the baseline recipe"
            >
              Revert
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {diffSummary.map((r) => {
              const moodColor = r.mood === 'good' ? C.teal : r.mood === 'bad' ? C.red : '#a7b0b6'
              return (
                <div key={r.key} className="flex flex-col bg-[#0a0d0f] border border-[#252e33] rounded p-2">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">{r.key}</div>
                  <div className="text-[12px] font-mono mt-0.5" style={{ color: moodColor }}>
                    {r.baseFmt} → <span className="font-medium">{r.fmt}</span> {r.unit}
                  </div>
                  <div className="text-[10px] font-mono text-[#6b7479]">
                    {r.arrow !== '·' ? (
                      <>
                        {r.arrow} {r.delta > 0 ? '+' : ''}{r.deltaFmt} {r.unit}
                      </>
                    ) : 'no change'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manufacturing flow — vertical timeline with per-stage cross-section + status */}
      <div className="relative">
        <Stage idx={1} title="Conductor draw" icon={Atom} accent={C.copper} stage={sim.conductor} preview={<XSConductor d={sim.conductor.strand_d_mm * 8} />}>
          <KnobRow>
            <Knob label="Rod Ø (mm)" value={recipe.conductor.rod_d_mm} onChange={(v) => update('conductor.rod_d_mm')(parseFloat(v))} type="number" step="0.5" />
            <Knob label="Target AWG" value={recipe.conductor.target_awg} onChange={(v) => update('conductor.target_awg')(parseInt(v, 10))} type="number" />
            <Knob label="Material" value={recipe.conductor.material} onChange={update('conductor.material')} options={MATERIALS} />
            <Knob label="Anneal °C" value={recipe.conductor.anneal_c} onChange={(v) => update('conductor.anneal_c')(parseFloat(v))} type="number" />
            <Knob label="Line m/min" value={recipe.conductor.line_m_min} onChange={(v) => update('conductor.line_m_min')(parseFloat(v))} type="number" />
          </KnobRow>
          <Outputs items={[
            ['Strand Ø', mmIn(sim.conductor.strand_d_mm, 3)],
            ['Mass', `${sim.conductor.mass_g_per_m.toFixed(2)} g/m`],
            ['DC R', `${(sim.conductor.dc_R_per_m * 1000).toFixed(2)} mΩ/m`],
            ['Cost', `$${sim.conductor.cost_per_m.toFixed(3)}/m`],
            ['Yield', `${sim.conductor.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.conductor.warn} />
        </Stage>

        <Stage idx={2} title="Stranding (optional)" icon={GitMerge} accent={C.copper} stage={sim.stranding} preview={recipe.stranding.enabled ? <XSStranded n={recipe.stranding.strand_count} d={sim.stranding.strand_d_mm * 8} /> : <XSConductor d={sim.stranding.conductor_d_mm * 8} />}>
          <KnobRow>
            <Knob label="Enabled" value={recipe.stranding.enabled} onChange={update('stranding.enabled')} type="bool" />
            {recipe.stranding.enabled && <>
              <Knob label="Strand count" value={recipe.stranding.strand_count} onChange={(v) => update('stranding.strand_count')(parseInt(v, 10))} type="number" />
              <Knob label="Strand lay (mm)" value={recipe.stranding.lay_mm} onChange={(v) => update('stranding.lay_mm')(parseFloat(v))} type="number" />
            </>}
          </KnobRow>
          <Outputs items={[
            ['Conductor Ø', mmIn(sim.stranding.conductor_d_mm, 3)],
            ['Mass', `${sim.stranding.mass_g_per_m.toFixed(2)} g/m`],
            ['Cost', `$${sim.stranding.cost_per_m.toFixed(3)}/m`],
            ['Yield', `${sim.stranding.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.stranding.warn} />
        </Stage>

        <Stage idx={3} title="Insulation extrusion" icon={Layers} accent={C.copper} stage={sim.insulation} preview={<XSInsulated cd={sim.stranding.conductor_d_mm} od={sim.insulation.insulated_d_mm} dielectricColor={dielectricColor(recipe.insulation.material)} />}>
          <KnobRow>
            <Knob label="Material" value={recipe.insulation.material} onChange={update('insulation.material')} options={DIELECTRICS} />
            <Knob label="Wall (mm)" value={recipe.insulation.wall_mm} onChange={(v) => update('insulation.wall_mm')(parseFloat(v))} type="number" step="0.05" />
            <Knob label="Line m/min" value={recipe.insulation.line_m_min} onChange={(v) => update('insulation.line_m_min')(parseFloat(v))} type="number" />
            <Knob label="Melt °C" value={recipe.insulation.melt_c} onChange={(v) => update('insulation.melt_c')(parseFloat(v))} type="number" />
          </KnobRow>
          <Outputs items={[
            ['Insulated Ø', mmIn(sim.insulation.insulated_d_mm, 3)],
            ['εr (effective)', sim.insulation.er_effective.toFixed(3)],
            ['C', `${sim.insulation.cap_pf_per_m.toFixed(1)} pF/m`],
            ['Mass', `${sim.insulation.mass_g_per_m.toFixed(2)} g/m`],
            ['Cost', `$${sim.insulation.cost_per_m.toFixed(3)}/m`],
            ['Yield', `${sim.insulation.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.insulation.warn} />
        </Stage>

        <Stage idx={4} title="Pair twisting" icon={Activity} accent={C.copper} stage={sim.pair} preview={<XSPair od={sim.insulation.insulated_d_mm} dielectricColor={dielectricColor(recipe.insulation.material)} />}>
          <KnobRow>
            <Knob label="Pair lay (mm)" value={recipe.pair.lay_mm} onChange={(v) => update('pair.lay_mm')(parseFloat(v))} type="number" step="0.5" />
            <Knob label="Direction" value={recipe.pair.direction} onChange={update('pair.direction')} options={{ S: { name: 'S' }, Z: { name: 'Z' } }} />
            <Knob label="Tension (N)" value={recipe.pair.tension_n} onChange={(v) => update('pair.tension_n')(parseFloat(v))} type="number" />
          </KnobRow>
          <Outputs items={[
            ['Pair Ø', mmIn(sim.pair.pair_od_mm, 3)],
            ['Z₀ diff', `${sim.pair.z_diff.toFixed(1)} Ω`],
            ['Skew', `${sim.pair.skew_ps_per_m.toFixed(1)} ps/m`],
            ['Yield', `${sim.pair.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.pair.warn} />
        </Stage>

        <Stage idx={5} title="Pair binder / wrap" icon={ScrollText} accent={C.copper} stage={sim.pair_wrap} preview={<XSPairWrap pairOD={sim.pair.pair_od_mm} wrapOD={sim.pair_wrap.wrapped_pair_od_mm} dielectricColor={dielectricColor(recipe.insulation.material)} />}>
          <KnobRow>
            <Knob label="Material" value={recipe.pair_wrap.material} onChange={update('pair_wrap.material')} options={WRAP_MATERIALS} />
            {recipe.pair_wrap.material !== 'none' && <>
              <Knob label="Wall (mm)" value={recipe.pair_wrap.wall_mm} onChange={(v) => update('pair_wrap.wall_mm')(parseFloat(v))} type="number" step="0.01" />
              <Knob label="Overlap %" value={recipe.pair_wrap.overlap_pct} onChange={(v) => update('pair_wrap.overlap_pct')(parseFloat(v))} type="number" />
            </>}
          </KnobRow>
          <Outputs items={[
            ['Wrapped Ø', mmIn(sim.pair_wrap.wrapped_pair_od_mm, 3)],
            ['Wrap εr', sim.pair_wrap.wrap?.er || '—'],
            ['Mass total', `${sim.pair_wrap.mass_g_per_m.toFixed(2)} g/m`],
            ['Cost', `$${sim.pair_wrap.cost_per_m.toFixed(3)}/m`],
            ['Yield', `${sim.pair_wrap.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.pair_wrap.warn} />
        </Stage>

        <Stage idx={6} title="Pair foil shield" icon={Waves} accent={C.copper} stage={sim.pair_foil} preview={<XSPairFoil pairOD={sim.pair.pair_od_mm} wrapOD={sim.pair_wrap.wrapped_pair_od_mm} foilOD={sim.pair_foil.shielded_pair_od_mm} dielectricColor={dielectricColor(recipe.insulation.material)} foilOn={recipe.pair_foil.material !== 'none'} drainOn={recipe.pair_foil.drain_wire} />}>
          <KnobRow>
            <Knob label="Material" value={recipe.pair_foil.material} onChange={update('pair_foil.material')} options={FOIL_MATERIALS} />
            {recipe.pair_foil.material !== 'none' && <>
              <Knob label="Overlap %" value={recipe.pair_foil.overlap_pct} onChange={(v) => update('pair_foil.overlap_pct')(parseFloat(v))} type="number" />
              <Knob label="Drain wire" value={recipe.pair_foil.drain_wire} onChange={update('pair_foil.drain_wire')} type="bool" />
              {recipe.pair_foil.drain_wire && <Knob label="Drain AWG" value={recipe.pair_foil.drain_awg} onChange={(v) => update('pair_foil.drain_awg')(parseInt(v, 10))} type="number" />}
            </>}
          </KnobRow>
          <Outputs items={[
            ['Shielded pair Ø', mmIn(sim.pair_foil.shielded_pair_od_mm, 3)],
            ['Pair Zt @ 100MHz', `${sim.pair_foil.pair_zt_mohm_per_m.toFixed(0)} mΩ/m`],
            ['Mass total', `${sim.pair_foil.mass_g_per_m.toFixed(2)} g/m`],
            ['Cost', `$${sim.pair_foil.cost_per_m.toFixed(3)}/m`],
            ['Yield', `${sim.pair_foil.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.pair_foil.warn} />
        </Stage>

        <Stage idx={7} title="Bundle / lay-up" icon={Box} accent={C.copper} stage={sim.bundle} preview={<XSBundle pairCount={recipe.bundle.pair_count} pairOD={sim.pair_foil.shielded_pair_od_mm} bundleD={sim.bundle.bundle_d_mm} filler={recipe.bundle.filler} dielectricColor={dielectricColor(recipe.insulation.material)} foilOn={recipe.pair_foil.material !== 'none'} />}>
          <KnobRow>
            <Knob label="Pair count" value={recipe.bundle.pair_count} onChange={(v) => update('bundle.pair_count')(parseInt(v, 10))} type="number" />
            <Knob label="Lay diversity" value={recipe.bundle.lay_diversity} onChange={update('bundle.lay_diversity')} type="bool" />
            <Knob label="Filler" value={recipe.bundle.filler} onChange={update('bundle.filler')} options={{ x_spline: { name: 'X-spline' }, foam_filler: { name: 'Foam filler' }, none: { name: 'None' } }} />
            <Knob label="Bundle lay (mm)" value={recipe.bundle.bundle_lay_mm} onChange={(v) => update('bundle.bundle_lay_mm')(parseFloat(v))} type="number" />
          </KnobRow>
          <Outputs items={[
            ['Bundle Ø', mmIn(sim.bundle.bundle_d_mm, 2)],
            ['NEXT estimate', `${sim.bundle.next_db_estimate.toFixed(1)} dB`],
            ['Mass', `${sim.bundle.mass_g_per_m.toFixed(0)} g/m`],
            ['Cost', `$${sim.bundle.cost_per_m.toFixed(2)}/m`],
            ['Yield', `${sim.bundle.yield_pct.toFixed(1)}%`],
          ]} />
          <Warns warns={sim.bundle.warn} />
        </Stage>

        <Stage idx={8} title="Outer shielding" icon={Shield} accent={C.copper} stage={sim.shield} preview={<XSOuterShield bundleD={sim.bundle.bundle_d_mm} shieldedD={sim.shield.shielded_d_mm} foilOn={recipe.shield.foil} braidOn={recipe.shield.braid_enabled} />}>
          <KnobRow>
            <Knob label="Foil" value={recipe.shield.foil} onChange={update('shield.foil')} type="bool" />
            <Knob label="Foil overlap %" value={recipe.shield.foil_overlap} onChange={(v) => update('shield.foil_overlap')(parseFloat(v))} type="number" />
            <Knob label="Braid" value={recipe.shield.braid_enabled} onChange={update('shield.braid_enabled')} type="bool" />
            {recipe.shield.braid_enabled && <>
              <Knob label="N carriers" value={recipe.shield.braid_N} onChange={(v) => update('shield.braid_N')(parseInt(v, 10))} type="number" />
              <Knob label="P ends" value={recipe.shield.braid_P} onChange={(v) => update('shield.braid_P')(parseInt(v, 10))} type="number" />
              <Knob label="d (mm)" value={recipe.shield.braid_d_mm} onChange={(v) => update('shield.braid_d_mm')(parseFloat(v))} type="number" step="0.01" />
              <Knob label="PR" value={recipe.shield.braid_PR} onChange={(v) => update('shield.braid_PR')(parseFloat(v))} type="number" />
              <Knob label="Mat." value={recipe.shield.braid_material} onChange={update('shield.braid_material')} options={MATERIALS} />
            </>}
          </KnobRow>
          <Outputs items={[
            ['Shielded Ø', mmIn(sim.shield.shielded_d_mm, 2)],
            ['Coverage K', `${sim.shield.coverage_pct.toFixed(1)}%`],
            ['Zt @ 100MHz', `${sim.shield.zt_mohm_per_m.toFixed(0)} mΩ/m`],
            ['Mass', `${sim.shield.mass_g_per_m.toFixed(0)} g/m`],
            ['Cost', `$${sim.shield.cost_per_m.toFixed(2)}/m`],
          ]} />
          <Warns warns={sim.shield.warn} />
        </Stage>

        <Stage idx={9} title="Jacketing" icon={Cable} accent={C.copper} stage={sim.jacket} isLast preview={<XSJacket innerD={sim.shield.shielded_d_mm} outerD={sim.jacket.final_od_mm} jacketColor={jacketColor(recipe.jacket.material)} />}>
          <KnobRow>
            <Knob label="Material" value={recipe.jacket.material} onChange={update('jacket.material')} options={JACKETS} />
            <Knob label="Wall (mm)" value={recipe.jacket.wall_mm} onChange={(v) => update('jacket.wall_mm')(parseFloat(v))} type="number" step="0.05" />
          </KnobRow>
          <Outputs items={[
            ['Final OD', mmIn(sim.jacket.final_od_mm, 2)],
            ['Total mass', `${sim.jacket.mass_g_per_m.toFixed(0)} g/m`],
            ['Total cost', `$${sim.jacket.cost_per_m.toFixed(2)}/m`],
            ['Flex', sim.jacket.flex_rating],
            ['Tmax', `${sim.jacket.jacket.tmax}°C`],
          ]} />
          <Warns warns={sim.jacket.warn} />
        </Stage>
      </div>
      {compareOpen && compareIds.length === 2 && (
        <RecipeCompareModal
          left={annotations.find((a) => a.id === compareIds[0])}
          right={annotations.find((a) => a.id === compareIds[1])}
          onClose={() => setCompareOpen(false)}
          onLoad={(rec) => { setRecipe(rec); setCompareOpen(false); toast.success('Recipe loaded into editor') }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Recipe compare modal — side-by-side delta of two pinned recipes
// ─────────────────────────────────────────────────────────────────
function RecipeCompareModal({ left, right, onClose, onLoad }) {
  if (!left || !right) return null
  const lSim = runPipeline(left.recipe)
  const rSim = runPipeline(right.recipe)
  const lStd = STANDARDS[left.recipe.product?.target || 'cat6a']
  const rStd = STANDARDS[right.recipe.product?.target || 'cat6a']

  const fmt = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d))
  const delta = (l, r, d = 2, betterLow = true) => {
    if (l == null || r == null) return { dStr: '—', mood: 'neutral' }
    const dv = r - l
    if (Math.abs(dv) < Math.pow(10, -d)) return { dStr: '0', mood: 'neutral' }
    const dStr = (dv > 0 ? '+' : '') + dv.toFixed(d)
    const mood = (betterLow ? dv < 0 : dv > 0) ? 'good' : 'bad'
    return { dStr, mood }
  }

  // Metric rows comparing the two simulated outputs
  const metrics = [
    { label: 'Z₀ diff (Ω)',     l: lSim.jacket.z_diff, r: rSim.jacket.z_diff, d: 1, betterLow: false, target: lStd.z0_diff },
    { label: 'IL @ 100m (dB)',  l: computeIL(lSim.jacket, lStd.freq_il_mhz, 100), r: computeIL(rSim.jacket, rStd.freq_il_mhz, 100), d: 1, betterLow: true },
    { label: 'NEXT (dB)',       l: lSim.jacket.next_db_estimate, r: rSim.jacket.next_db_estimate, d: 1, betterLow: false },
    { label: 'Skew (ps/m)',     l: lSim.jacket.pair_skew_ps_per_m, r: rSim.jacket.pair_skew_ps_per_m, d: 1, betterLow: true },
    { label: 'Mass (g/m)',      l: lSim.jacket.mass_g_per_m, r: rSim.jacket.mass_g_per_m, d: 0, betterLow: true },
    { label: 'Cost / m ($)',    l: lSim.jacket.cost_per_m, r: rSim.jacket.cost_per_m, d: 3, betterLow: true },
    { label: 'Final OD (mm)',   l: lSim.jacket.final_od_mm, r: rSim.jacket.final_od_mm, d: 2, betterLow: false },
  ]

  // Recipe parameter rows — show every leaf field
  const paramRows = []
  const walk = (path, lv, rv) => {
    if (lv && typeof lv === 'object' && !Array.isArray(lv)) {
      const keys = new Set([...Object.keys(lv), ...Object.keys(rv || {})])
      for (const k of keys) walk(`${path}.${k}`, lv[k], rv?.[k])
    } else {
      paramRows.push({ key: path, l: lv, r: rv, changed: JSON.stringify(lv) !== JSON.stringify(rv) })
    }
  }
  walk('recipe', left.recipe, right.recipe)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(10,13,15,0.85)' }}>
      <div className="bg-[#0a0d0f] border border-[#252e33] rounded max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0a0d0f] border-b border-[#252e33] p-4 flex items-center justify-between gap-2 flex-wrap z-10">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>◆ Recipe compare</div>
            <div className="text-[14px] mt-1" style={{ color: C.text, fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              <span style={{ color: C.copperBright }}>{left.label}</span>
              <span className="mx-2" style={{ color: C.textMuted }}>vs</span>
              <span style={{ color: C.amber }}>{right.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border" style={{ borderColor: C.border, color: C.textDim }}>
            ✕ Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Metric comparison */}
          <div className="bg-[#12171a] border border-[#252e33] rounded">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-2" style={{ color: C.amber, borderBottom: `1px solid ${C.border}` }}>
              Predicted spec output
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="font-mono text-[10px] uppercase" style={{ color: C.textMuted }}>
                  <th className="text-left px-3 py-1.5 w-1/3">Metric</th>
                  <th className="text-right px-3 py-1.5">A</th>
                  <th className="text-right px-3 py-1.5">B</th>
                  <th className="text-right px-3 py-1.5">Δ (B − A)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => {
                  const dx = delta(m.l, m.r, m.d, m.betterLow)
                  const moodColor = dx.mood === 'good' ? C.teal : dx.mood === 'bad' ? C.red : C.textDim
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: C.border }}>
                      <td className="px-3 py-1.5" style={{ color: C.textDim }}>{m.label}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: C.copperBright }}>{fmt(m.l, m.d)}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: C.amber }}>{fmt(m.r, m.d)}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: moodColor }}>{dx.dStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Recipe parameters */}
          <div className="bg-[#12171a] border border-[#252e33] rounded">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-2 flex items-center justify-between" style={{ color: C.teal, borderBottom: `1px solid ${C.border}` }}>
              <span>Recipe parameters · {paramRows.filter((r) => r.changed).length} differ</span>
            </div>
            <table className="w-full text-[11px]">
              <tbody>
                {paramRows.filter((r) => r.changed).map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: C.border, background: '#0d1416' }}>
                    <td className="px-3 py-1 font-mono" style={{ color: C.textDim }}>{r.key.replace('recipe.', '')}</td>
                    <td className="px-3 py-1 text-right font-mono" style={{ color: C.copperBright }}>{JSON.stringify(r.l)}</td>
                    <td className="px-3 py-1 text-right font-mono" style={{ color: C.amber }}>→ {JSON.stringify(r.r)}</td>
                  </tr>
                ))}
                {paramRows.filter((r) => r.changed).length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-3 italic text-center" style={{ color: C.textMuted }}>No parameter differences (only output reads differ).</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => onLoad(left.recipe)} className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded border" style={{ borderColor: C.copperBright, color: C.copperBright }}>
              Load A into editor
            </button>
            <button onClick={() => onLoad(right.recipe)} className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded border" style={{ borderColor: C.amber, color: C.amber }}>
              Load B into editor
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stage({ idx, title, icon: Icon, accent, stage, preview, isLast, children }) {
  // Status: green if no warnings + yield ok, amber if warnings, red if yield < 80
  const yieldVal = stage?.yield_pct ?? 100
  const warnCount = stage?.warn?.length || 0
  const status = yieldVal < 80 ? 'red' : warnCount > 0 ? 'amber' : 'green'
  const statusColor = status === 'red' ? C.red : status === 'amber' ? C.amber : C.teal
  return (
    <div className="relative pl-12 md:pl-14">
      {/* Vertical timeline line */}
      {!isLast && (
        <div className="absolute left-[19px] md:left-[23px] top-12 bottom-[-12px] w-px"
          style={{ background: 'linear-gradient(to bottom, ' + statusColor + '60, ' + C.border + '00)' }} />
      )}
      {/* Stage number badge */}
      <div
        className="absolute left-0 top-2 w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center font-mono text-[14px] font-semibold backdrop-blur-md"
        style={{
          borderColor: statusColor,
          background: '#0a0d0f',
          color: statusColor,
          boxShadow: '0 0 20px ' + statusColor + '30',
        }}
      >
        {idx}
      </div>
      <div className="bg-[#12171a] border border-[#252e33] rounded-md mb-3 overflow-hidden hover:border-[#384249] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#252e33] bg-gradient-to-r from-[#12171a] to-[#0d1416]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Icon size={14} style={{ color: accent }} className="shrink-0" />
            <h3 className="font-mono text-[12px] uppercase tracking-wider truncate" style={{ color: accent }}>{title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={status} yieldPct={yieldVal} warnCount={warnCount} />
            {preview && <div className="hidden sm:block">{preview}</div>}
          </div>
        </div>
        <div className="p-3">
          {children}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, yieldPct, warnCount }) {
  const color = status === 'red' ? C.red : status === 'amber' ? C.amber : C.teal
  const dot = status === 'red' ? '●' : status === 'amber' ? '◐' : '✓'
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider"
      style={{ color, border: `1px solid ${color}40`, background: 'transparent' }}
      title={`Yield ${yieldPct.toFixed(1)}%${warnCount ? ` · ${warnCount} warning(s)` : ''}`}
    >
      <span>{dot}</span>
      <span>{yieldPct.toFixed(1)}%</span>
    </div>
  )
}

// ── Cross-section SVG previews ──────────────────────────
function dielectricColor(id) {
  if (!id) return '#fbbf24'
  if (id.includes('foamed')) return '#9ec5e8'
  if (id.includes('eptfe')) return '#e8d5b0'
  if (id.includes('ptfe') || id.includes('fep') || id.includes('pfa')) return '#f5e6d3'
  if (id.includes('pe')) return '#9ec5e8'
  return '#fbbf24'
}
function jacketColor(id) {
  if (id === 'lszh') return '#1a2226'
  if (id === 'pvc') return '#2a1f15'
  if (id === 'fep_jkt') return '#e8d5b0'
  if (id === 'tpu') return '#1f2933'
  if (id === 'pur') return '#2a2330'
  return '#1a2226'
}

function XSWrap({ children, size = 36 }) {
  return <svg width={size} height={size} viewBox={`-50 -50 100 100`}>{children}</svg>
}

function XSConductor({ d = 20 }) {
  return (
    <XSWrap>
      <circle cx="0" cy="0" r={Math.min(d, 36)} fill="#c97b3f" stroke="#e89357" strokeWidth="1" />
    </XSWrap>
  )
}
function XSStranded({ n = 7, d = 20 }) {
  const r = Math.min(d / 3, 12)
  const ring = []
  for (let i = 0; i < Math.max(0, n - 1); i++) {
    const a = (i / (n - 1)) * 2 * Math.PI
    ring.push({ x: Math.cos(a) * r * 1.6, y: Math.sin(a) * r * 1.6 })
  }
  return (
    <XSWrap>
      <circle cx="0" cy="0" r={r} fill="#c97b3f" />
      {ring.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill="#c97b3f" stroke="#e89357" strokeWidth="0.5" />)}
    </XSWrap>
  )
}
function XSInsulated({ cd, od, dielectricColor }) {
  const ratio = Math.min(40, Math.max(8, (cd / od) * 36))
  return (
    <XSWrap>
      <circle cx="0" cy="0" r="40" fill={dielectricColor || '#fbbf24'} fillOpacity="0.7" stroke="#fbbf24" strokeOpacity="0.6" strokeWidth="1" />
      <circle cx="0" cy="0" r={ratio * 0.6} fill="#c97b3f" />
    </XSWrap>
  )
}
function XSPair({ od, dielectricColor }) {
  const r = 24
  return (
    <XSWrap>
      <g>
        <circle cx="-22" cy="0" r={r} fill={dielectricColor} fillOpacity="0.8" stroke="#fbbf24" strokeOpacity="0.5" strokeWidth="0.8" />
        <circle cx="-22" cy="0" r="6" fill="#c97b3f" />
        <circle cx="22" cy="0" r={r} fill={dielectricColor} fillOpacity="0.8" stroke="#fbbf24" strokeOpacity="0.5" strokeWidth="0.8" />
        <circle cx="22" cy="0" r="6" fill="#c97b3f" />
      </g>
    </XSWrap>
  )
}
function XSPairWrap({ pairOD, wrapOD, dielectricColor }) {
  const ratio = wrapOD > 0 ? wrapOD / pairOD : 1
  return (
    <XSWrap>
      <ellipse cx="0" cy="0" rx={48 * ratio} ry={26 * ratio} fill="#1a2226" stroke="#5eead4" strokeWidth="1" strokeDasharray="3 2" opacity="0.85" />
      <circle cx="-22" cy="0" r="22" fill={dielectricColor} fillOpacity="0.8" />
      <circle cx="-22" cy="0" r="6" fill="#c97b3f" />
      <circle cx="22" cy="0" r="22" fill={dielectricColor} fillOpacity="0.8" />
      <circle cx="22" cy="0" r="6" fill="#c97b3f" />
    </XSWrap>
  )
}
function XSPairFoil({ pairOD, wrapOD, foilOD, dielectricColor, foilOn, drainOn }) {
  const ratio = foilOD > 0 ? foilOD / pairOD : 1
  return (
    <XSWrap>
      {foilOn && (
        <ellipse cx="0" cy="0" rx={48 * ratio} ry={28 * ratio} fill="#384249" stroke="#a7b0b6" strokeWidth="1.5" opacity="0.8" />
      )}
      <ellipse cx="0" cy="0" rx={48} ry={26} fill="#1a2226" stroke="#5eead4" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7" />
      <circle cx="-22" cy="0" r="22" fill={dielectricColor} fillOpacity="0.8" />
      <circle cx="-22" cy="0" r="6" fill="#c97b3f" />
      <circle cx="22" cy="0" r="22" fill={dielectricColor} fillOpacity="0.8" />
      <circle cx="22" cy="0" r="6" fill="#c97b3f" />
      {drainOn && foilOn && (
        <circle cx="-46" cy="22" r="4" fill="#c97b3f" stroke="#e89357" strokeWidth="0.5" />
      )}
    </XSWrap>
  )
}
function XSBundle({ pairCount = 4, dielectricColor, foilOn }) {
  const positions = pairCount === 4
    ? [{ x: -22, y: -22 }, { x: 22, y: -22 }, { x: -22, y: 22 }, { x: 22, y: 22 }]
    : pairCount === 2 ? [{ x: 0, y: -22 }, { x: 0, y: 22 }]
    : [{ x: -22, y: 0 }, { x: 22, y: -19 }, { x: 22, y: 19 }]
  const pairR = pairCount === 4 ? 22 : 26
  return (
    <XSWrap>
      {/* X-spline filler in center */}
      <g stroke="#384249" strokeWidth="1.5" opacity="0.5">
        <line x1="0" y1="-44" x2="0" y2="44" />
        <line x1="-44" y1="0" x2="44" y2="0" />
      </g>
      {positions.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          {foilOn && <circle r={pairR * 0.7} fill="none" stroke="#a7b0b6" strokeWidth="1" />}
          <circle r={pairR * 0.65} fill={dielectricColor} fillOpacity="0.7" />
          <circle r="3" fill="#c97b3f" />
        </g>
      ))}
    </XSWrap>
  )
}
function XSOuterShield({ foilOn, braidOn }) {
  return (
    <XSWrap>
      {braidOn && (
        <>
          <circle cx="0" cy="0" r="44" fill="none" stroke="#8b8478" strokeWidth="3" strokeDasharray="2 1" opacity="0.7" />
          <circle cx="0" cy="0" r="42" fill="none" stroke="#8b8478" strokeWidth="2" strokeDasharray="2 1" transform="rotate(45)" opacity="0.7" />
        </>
      )}
      {foilOn && (
        <circle cx="0" cy="0" r="38" fill="none" stroke="#5eead4" strokeWidth="2" strokeDasharray="3 2" opacity="0.7" />
      )}
      <circle cx="0" cy="0" r="32" fill="#171d20" stroke="#384249" strokeWidth="0.5" />
      {/* Hint of pairs inside */}
      <circle cx="-12" cy="-12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="12" cy="-12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="-12" cy="12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="12" cy="12" r="8" fill="#fbbf24" fillOpacity="0.3" />
    </XSWrap>
  )
}
function XSJacket({ innerD, outerD, jacketColor }) {
  return (
    <XSWrap>
      <circle cx="0" cy="0" r="46" fill={jacketColor || '#1a2226'} stroke="#384249" strokeWidth="1" />
      <circle cx="0" cy="0" r="38" fill="#171d20" stroke="#384249" strokeWidth="0.5" />
      <circle cx="0" cy="0" r="34" fill="none" stroke="#5eead4" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.6" />
      <circle cx="-12" cy="-12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="12" cy="-12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="-12" cy="12" r="8" fill="#fbbf24" fillOpacity="0.3" />
      <circle cx="12" cy="12" r="8" fill="#fbbf24" fillOpacity="0.3" />
    </XSWrap>
  )
}

function KnobRow({ children }) {
  return <div className="flex flex-wrap items-end gap-x-3 gap-y-2 mb-3">{children}</div>
}

function Knob({ label, value, onChange, type = 'string', options, step }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">{label}</span>
      {type === 'bool' ? (
        <button
          onClick={() => onChange(!value)}
          className={`px-2 py-1 text-[11px] font-mono uppercase rounded ${
            value ? 'bg-[#2a1d14] text-[#fbbf24] border border-[#3d2a1c]' : 'text-[#6b7479] border border-[#252e33] hover:text-[#fbbf24]'
          }`}
        >
          {value ? 'on' : 'off'}
        </button>
      ) : options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#fbbf24] focus:outline-none focus:border-[#c97b3f]"
        >
          {Object.entries(options).map(([id, opt]) => <option key={id} value={id}>{opt.name}</option>)}
        </select>
      ) : (
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#fbbf24] focus:outline-none focus:border-[#c97b3f]"
        />
      )}
    </label>
  )
}

function Outputs({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono pt-2">
      {items.map(([k, v]) => (
        <div key={k}><span className="text-[#6b7479]">{k}: </span><span className="text-[#fbbf24]">{v}</span></div>
      ))}
    </div>
  )
}

function Warns({ warns }) {
  if (!warns || warns.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      {warns.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: '#fdba74' }}>
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b7479]">{label}</div>
      <div className="text-lg font-mono mt-0.5" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[10px] text-[#6b7479] font-mono">{sub}</div>}
    </div>
  )
}

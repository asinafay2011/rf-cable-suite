import React, { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, Info, Layers, Settings, ChevronUp, ChevronDown, Zap, AlertTriangle } from 'lucide-react'
import {
  PTFE_WRAP_PRESETS,
  SMALL_CABLE_MAX_PTFE_WIDTH_IN,
  SMALL_CABLE_MAX_PTFE_WIDTH_MM,
  SMALL_CABLE_TAPE_OD_IN,
  SMALL_CABLE_TAPE_OD_MM,
  normalizePtfeWrap,
  recommendPtfeWrapForCable,
} from '../data/materialLibrary.js'

// ─────────────────────────────────────────────────────────
// Dielectric Stack Designer
//
// Build a coaxial cable's dielectric layer-by-layer using PTFE tape on
// a WTM (wrapping tape machine). Computes:
//   • OD build-up per pass, accounting for tape thickness × overlap
//     × tension factor.
//   • Effective εᵣ from a layered-coax model (Wadell's logarithmic
//     mixing): εᵣ_eff = ln(D/d) / Σ (ln(r_i+1/r_i) / εᵣ_i).
//   • Per-layer εᵣ from PTFE density via Looyenga (3-component air mix).
//   • Final VP = 1/√εᵣ_eff and Z₀ = (60/√εᵣ_eff)·ln(D/d).
//
// Plus a WTM pitch calculator: pitch (mm/rev) = W × (1 - overlap).
// Optional helix-angle compensation for long-pitch wraps.
//
// References
// ──────────
// • Wadell, "Transmission Line Design Handbook" §3 — Z₀ for coax with
//   layered dielectric.
// • Looyenga (1965) — Looyenga mixing formula for porous dielectrics.
// • PTFE solid: ρ = 2.15 g/cm³, εᵣ ≈ 2.10 @ 1 GHz.
// • Foamed/expanded PTFE: ρ 0.5–0.9 g/cm³, εᵣ 1.30–1.45 (manufacturer
//   data — Gore, DuPont).
// ─────────────────────────────────────────────────────────

const PTFE_SOLID_DENSITY = 2.15  // g/cm³
const PTFE_SOLID_EPS = 2.10
const C_LIGHT = 299792458         // m/s

// Looyenga mixing rule: εᵣ_eff^(1/3) = vf·εᵣ_PTFE^(1/3) + (1−vf)·1
// where vf = ρ_actual / ρ_solid (volume fraction PTFE).
function densityToEps(density_gpcc) {
  if (!density_gpcc || density_gpcc <= 0) return 1
  const vf = Math.min(1, Math.max(0, density_gpcc / PTFE_SOLID_DENSITY))
  const eps_third = vf * Math.cbrt(PTFE_SOLID_EPS) + (1 - vf) * 1
  return Math.pow(eps_third, 3)
}

// Layered-coax εᵣ_eff (Wadell). layers = [{thickness_mm, eps_r}, ...]
function effectiveEps(layers, d_inner_mm) {
  let r = d_inner_mm / 2
  let logTotal = 0
  let weighted = 0
  for (const L of layers) {
    const r2 = r + L.thickness_mm
    if (r2 <= r) continue
    const dlog = Math.log(r2 / r)
    logTotal += dlog
    weighted += dlog / L.eps_r
    r = r2
  }
  if (weighted === 0) return 1
  return logTotal / weighted
}

const PRESETS = {
  high_density: { density: 1.6,  label: 'PTFE HD',   sub: '1.6 g/cm³', color: '#fbbf24' },
  low_density:  { density: 0.7,  label: 'PTFE LD',   sub: '0.7 g/cm³', color: '#7dd3fc' },
  solid:        { density: 2.15, label: 'PTFE solid', sub: '2.15 g/cm³', color: '#fb923c' },
  custom:       { density: 1.0,  label: 'Custom',    sub: 'set ρ',      color: '#a78bfa' },
}

const OVERLAP_PRESETS = {
  '1/2': { fraction: 0.5, label: '1/2', hint: '50% overlap', layers: 2 },
  '2/3': { fraction: 2 / 3, label: '2/3', hint: '66.7% overlap', layers: 3 },
  '3/4': { fraction: 0.75, label: '3/4', hint: '75% overlap', layers: 4 },
}

// ─── Tape thickness preset pills (mils) ───
// 1 mil = 0.001 inch = 0.0254 mm
const MIL_TO_MM = 0.0254
const TAPE_THICKNESS_PRESETS = [
  { mil: 0.5, mm: 0.5 * MIL_TO_MM, label: '½ mil' },
  { mil: 1,   mm: 1.0 * MIL_TO_MM, label: '1 mil' },
  { mil: 2,   mm: 2.0 * MIL_TO_MM, label: '2 mil' },
  { mil: 3,   mm: 3.0 * MIL_TO_MM, label: '3 mil' },
  { mil: 5,   mm: 5.0 * MIL_TO_MM, label: '5 mil' },
]

// ─── Manufacturing rule: small-conductor cables can't take thick tape ───
// Inner conductor OD ≤ 0.091" (≈ 2.311 mm) → tape must be ≤ 10 mil (0.010")
// or it wrinkles / can't conform to the tight radius. (Common skived PTFE
// tape sits at 1–5 mil, so this is a soft upper bound — only flags
// genuinely thick tape on small conductors.)
const SMALL_CABLE_MAX_OD_INCH = 0.091
const SMALL_CABLE_MAX_OD_MM = SMALL_CABLE_MAX_OD_INCH * 25.4   // ≈ 2.3114
const SMALL_CABLE_MAX_TAPE_MIL = 10
const SMALL_CABLE_MAX_TAPE_MM = SMALL_CABLE_MAX_TAPE_MIL * MIL_TO_MM  // 0.254
const SMALL_CABLE_TAPE_TOLERANCE_MM = 0.0005                   // small float-tolerance

function violatesSmallCableRule(conductorOD_mm, tape_thickness_mm) {
  return (
    conductorOD_mm <= SMALL_CABLE_MAX_OD_MM + 0.001 &&
    tape_thickness_mm > SMALL_CABLE_MAX_TAPE_MM + SMALL_CABLE_TAPE_TOLERANCE_MM
  )
}

function smallCableTapingGuidance(odBeforeMm, layer) {
  return recommendPtfeWrapForCable({
    cableOdMm: odBeforeMm,
    tapeWidthMm: layer.tape_width_mm,
    overlap: layer.overlap,
  })
}

// ─── Unit conversion helpers ───
const UNIT_KEY = 'cablelab.dsd.unit'
const UnitContext = React.createContext({ unit: 'inch', setUnit: () => {} })
function useUnit() { return React.useContext(UnitContext) }

function toDisplay(mm, unit, decMm = 3, decInch = 4) {
  if (mm == null || isNaN(mm)) return ''
  if (unit === 'inch') return (mm / 25.4).toFixed(decInch)
  return mm.toFixed(decMm)
}
function fromDisplay(text, unit) {
  const v = parseFloat(text)
  if (isNaN(v)) return null
  return unit === 'inch' ? v * 25.4 : v
}
function fmtLen(mm, unit, decMm = 3, decInch = 4) {
  if (mm == null || isNaN(mm)) return '—'
  if (unit === 'inch') return `${(mm / 25.4).toFixed(decInch)} in`
  return `${mm.toFixed(decMm)} mm`
}

function newLayer(idx) {
  return {
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    preset: 'high_density',
    density: 1.6,
    tape_thickness_mm: 0.10,
    tape_width_mm: 0.635,
    overlap: '2/3',
    tension_factor: 0.92,
    passes: 1,
  }
}

const COLORS = {
  bg: '#0a0705',
  card: '#110a05',
  cardHi: '#1a1108',
  border: '#3a2e1f',
  borderHi: '#5a4525',
  copper: '#d97706',
  copperBright: '#fbbf24',
  text: '#e7e2dc',
  textDim: '#a89d8e',
  textMuted: '#78716c',
  teal: '#5eead4',
  red: '#f87171',
}

export default function DielectricStackDesigner() {
  const [unit, setUnit] = useState(() => {
    try {
      const saved = localStorage.getItem(UNIT_KEY)
      return saved === 'mm' || saved === 'inch' ? saved : 'inch'
    } catch { return 'inch' }
  })
  useEffect(() => {
    try { localStorage.setItem(UNIT_KEY, unit) } catch {}
  }, [unit])

  const [conductorOD_mm, setConductorOD_mm] = useState(0.96) // 18 AWG ≈ 1.024 mm; 19 AWG ≈ 0.912; 18.5 AWG ≈ 0.96
  const [layers, setLayers] = useState(() => [
    { ...newLayer(0), preset: 'low_density',  density: 0.7, tape_thickness_mm: 2 * MIL_TO_MM, overlap: '2/3', passes: 2 },  // 2 mil LD
    { ...newLayer(1), preset: 'high_density', density: 1.6, tape_thickness_mm: 2 * MIL_TO_MM, overlap: '2/3', passes: 1 },  // 2 mil HD
  ])
  const [targetZ0, setTargetZ0] = useState(50)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [flashApplied, setFlashApplied] = useState(false)

  // Manufacturing-rule violations
  const ruleViolations = useMemo(() => {
    const flagged = []
    for (let i = 0; i < layers.length; i++) {
      if (violatesSmallCableRule(conductorOD_mm, layers[i].tape_thickness_mm)) {
        flagged.push(i)
      }
    }
    return flagged
  }, [conductorOD_mm, layers])

  // Listen for agent-driven preset apply (section='dielectric')
  useEffect(() => {
    const onApply = (e) => {
      if (e.detail?.section !== 'dielectric') return
      const params = e.detail.params || {}
      if (params.conductor_od_mm) setConductorOD_mm(params.conductor_od_mm)
      if (params.target_z0) setTargetZ0(params.target_z0)
      if (Array.isArray(params.layers) && params.layers.length > 0) {
        setLayers(
          params.layers.map((L, i) => ({
            id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            preset: L.preset || 'high_density',
            density: L.density ?? 1.6,
            tape_thickness_mm: L.tape_thickness_mm ?? 0.10,
            tape_width_mm: L.tape_width_mm ?? 0.635,
            overlap: normalizePtfeWrap(L.overlap || '2/3').key,
            tension_factor: L.tension_factor ?? 0.92,
            passes: Math.max(1, Math.round(L.passes ?? 1)),
          }))
        )
      }
      setFlashApplied(true)
      setTimeout(() => setFlashApplied(false), 2200)
    }
    window.addEventListener('cable-suite:apply-preset', onApply)
    return () => window.removeEventListener('cable-suite:apply-preset', onApply)
  }, [])

  // ── Compute layer-by-layer build-up ──
  const computed = useMemo(() => {
    const stack = []
    let r = conductorOD_mm / 2
    for (const L of layers) {
      const ovr = OVERLAP_PRESETS[L.overlap] || OVERLAP_PRESETS['1/2']
      const n_overlap = ovr.layers
      const t_per_pass = L.tape_thickness_mm * n_overlap * L.tension_factor
      const t_total = t_per_pass * L.passes
      const eps_r = densityToEps(L.density)
      const r_before = r
      const r_after = r + t_total
      stack.push({
        id: L.id,
        layer: L,
        eps_r,
        thickness_mm: t_total,
        OD_before_mm: 2 * r_before,
        OD_after_mm: 2 * r_after,
        n_overlap,
        ovr_label: ovr.label,
        color: PRESETS[L.preset]?.color || '#fbbf24',
      })
      r = r_after
    }
    const finalOD_mm = 2 * r
    const eps_eff = effectiveEps(
      stack.map((s) => ({ thickness_mm: s.thickness_mm, eps_r: s.eps_r })),
      conductorOD_mm
    )
    const VP = 1 / Math.sqrt(eps_eff)
    const Z0 = stack.length > 0
      ? (60 / Math.sqrt(eps_eff)) * Math.log(finalOD_mm / conductorOD_mm)
      : 0
    const propDelay_ns_per_m = stack.length > 0 ? 1e9 / (C_LIGHT * VP) : 0
    const totalDielectricThickness_mm = (finalOD_mm - conductorOD_mm) / 2
    return { stack, finalOD_mm, eps_eff, VP, Z0, propDelay_ns_per_m, totalDielectricThickness_mm }
  }, [conductorOD_mm, layers])

  const updateLayer = (i, patch) => {
    setLayers((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }
  const removeLayer = (i) => setLayers((ls) => ls.filter((_, j) => j !== i))
  const addLayer = () => setLayers((ls) => [...ls, newLayer(ls.length)])
  const moveLayer = (i, delta) => {
    setLayers((ls) => {
      const j = i + delta
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── Verdict on Z₀ ──
  const z0Off = computed.Z0 ? computed.Z0 - targetZ0 : 0
  const z0Verdict =
    Math.abs(z0Off) <= 1   ? { color: COLORS.teal,         label: 'On target' } :
    Math.abs(z0Off) <= 2   ? { color: COLORS.copperBright, label: 'Close' } :
                              { color: COLORS.red,          label: 'Off' }

  return (
    <UnitContext.Provider value={{ unit, setUnit }}>
    <div style={{ display: 'grid', gap: 14 }}>
      <style>{`
        .dsd-input {
          background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; color: ${COLORS.text};
          padding: 6px 9px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
          border-radius: 3px; outline: none; width: 100%;
        }
        .dsd-input:focus { border-color: ${COLORS.copper}; }
        .dsd-input-error {
          border-color: ${COLORS.red} !important;
          color: ${COLORS.red};
        }
        .dsd-btn {
          background: transparent; border: 1px solid ${COLORS.border}; color: ${COLORS.textDim};
          padding: 6px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 1px; text-transform: uppercase; border-radius: 3px; cursor: pointer;
          transition: all 0.15s;
        }
        .dsd-btn:hover { border-color: ${COLORS.copper}; color: ${COLORS.copperBright}; }
        .dsd-btn-primary {
          background: ${COLORS.copper}; border: 1px solid ${COLORS.copper}; color: ${COLORS.bg};
          font-weight: 700;
        }
        .dsd-btn-primary:hover { background: ${COLORS.copperBright}; border-color: ${COLORS.copperBright}; }
        .dsd-pill {
          background: transparent; border: 1px solid ${COLORS.border}; color: ${COLORS.textDim};
          padding: 5px 9px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 1px; text-transform: uppercase; border-radius: 3px; cursor: pointer;
          transition: all 0.15s;
        }
        .dsd-pill-active {
          background: rgba(217,119,6,0.18); border-color: ${COLORS.copper}; color: ${COLORS.copperBright};
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', color: COLORS.copper, textTransform: 'uppercase', marginBottom: 4 }}>
            ◆ Dielectric Stack Designer
          </div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em', color: '#fef3c7' }}>
            PTFE tape build-up · WTM pitch · Bragg notches
          </h2>
          <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6, lineHeight: 1.5 }}>
            Stack PTFE tape layers to dial in target VP &amp; Z₀. Each pass adds 2·t·n<sub>overlap</sub>·τ to OD,
            where τ is the tension factor. εᵣ per layer comes from density via Looyenga;
            cumulative εᵣ_eff uses the layered-coax log mix (Wadell §3). Tip: ask the chat agent
            <em style={{ color: COLORS.copperBright, fontStyle: 'normal' }}> "build cable conductor 0.045&quot;, target 80% VP, 50 Ω"</em> for a one-click recipe.
          </p>
        </div>
        {/* Unit toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Label>Display units</Label>
          <div style={{ display: 'flex', background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 2, gap: 0 }}>
            {[
              { id: 'inch', label: 'inch / mil' },
              { id: 'mm',   label: 'mm' },
            ].map((u) => (
              <button
                key={u.id}
                onClick={() => setUnit(u.id)}
                style={{
                  padding: '5px 12px',
                  border: 'none',
                  borderRadius: 3,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  background: unit === u.id ? COLORS.copper : 'transparent',
                  color: unit === u.id ? COLORS.bg : COLORS.textDim,
                  fontWeight: unit === u.id ? 700 : 500,
                  transition: 'all 0.15s',
                }}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {flashApplied && (
        <div style={{ padding: '8px 12px', background: 'rgba(94,234,212,0.12)', border: `1px solid ${COLORS.teal}66`, borderRadius: 4, color: COLORS.teal, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5, animation: 'fadeIn 0.3s ease-out' }}>
          ✓ Agent recipe applied — check the layer stack &amp; cumulative readout below
        </div>
      )}

      {ruleViolations.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.10)', border: `1px solid ${COLORS.red}66`, borderRadius: 4, fontSize: 11, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.red, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>
            <AlertTriangle size={12} />
            Small-conductor rule violation
          </div>
          <div style={{ color: COLORS.textDim }}>
            Inner conductor OD = <strong style={{ color: COLORS.text }}>{fmtLen(conductorOD_mm, unit)}</strong>{' '}
            ≤ 0.091&quot; ({SMALL_CABLE_MAX_OD_MM.toFixed(2)} mm). On these small cables, tape thicker than{' '}
            <strong style={{ color: COLORS.text }}>{SMALL_CABLE_MAX_TAPE_MIL} mil ({SMALL_CABLE_MAX_TAPE_MM.toFixed(3)} mm / {(SMALL_CABLE_MAX_TAPE_MM / 25.4).toFixed(3)}&quot;)</strong>{' '}
            wrinkles, can&apos;t conform to the tight radius, and produces inconsistent OD build.
            Layers flagged: {ruleViolations.map((i) => `L${i + 1}`).join(', ')}. Drop those layers to ≤ {SMALL_CABLE_MAX_TAPE_MIL} mil tape (add more passes if you need more thickness).
          </div>
        </div>
      )}

      {/* Top row: conductor input + final readout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 12 }}>
          <Label>Inner conductor OD (d)</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <input
              type="number"
              step={unit === 'inch' ? 0.001 : 0.001}
              min={unit === 'inch' ? 0.002 : 0.05}
              max={unit === 'inch' ? 1.0 : 25}
              value={toDisplay(conductorOD_mm, unit, 3, 3)}
              onChange={(e) => {
                const mm = fromDisplay(e.target.value, unit)
                if (mm != null) setConductorOD_mm(mm)
              }}
              className="dsd-input"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace', minWidth: 24 }}>
              {unit === 'inch' ? 'in' : 'mm'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.4 }}>
            {unit === 'inch'
              ? '18 AWG ≈ 0.040 · 19 AWG ≈ 0.036 · 20 AWG ≈ 0.032 · 22 AWG ≈ 0.025'
              : '18 AWG ≈ 1.024 · 19 AWG ≈ 0.912 · 20 AWG ≈ 0.812 · 22 AWG ≈ 0.643'}
          </div>
          {conductorOD_mm <= SMALL_CABLE_MAX_OD_MM + 0.001 && (
            <div style={{ marginTop: 6, fontSize: 10, color: COLORS.copperBright, fontFamily: 'JetBrains Mono, monospace' }}>
              ◆ Small-conductor regime · use ≤ {SMALL_CABLE_MAX_TAPE_MIL} mil tape
            </div>
          )}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 10, paddingTop: 10 }}>
            <Label>Target Z₀</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                type="number"
                step="0.5"
                value={targetZ0}
                onChange={(e) => setTargetZ0(parseFloat(e.target.value) || 50)}
                className="dsd-input"
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>Ω</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {[50, 75, 100].map((z) => (
                <button key={z} onClick={() => setTargetZ0(z)} className={`dsd-pill ${targetZ0 === z ? 'dsd-pill-active' : ''}`}>{z} Ω</button>
              ))}
            </div>
          </div>
        </div>

        <ReadoutPanel computed={computed} z0Verdict={z0Verdict} z0Off={z0Off} />
      </div>

      {/* Cross-section + layer stack */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 }}>
        {/* Visualization */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 12 }}>
          <Label>Cross-section</Label>
          <CrossSection conductorOD={conductorOD_mm} stack={computed.stack} finalOD={computed.finalOD_mm} />
          <Legend stack={computed.stack} />
        </div>

        {/* Layer cards */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: COLORS.copper, textTransform: 'uppercase' }}>
              ◆ Layer stack · {layers.length} layer{layers.length !== 1 ? 's' : ''} · inside → outside
            </div>
            <button onClick={addLayer} className="dsd-btn-primary dsd-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={12} /> Add layer
            </button>
          </div>
          {layers.map((L, i) => (
            <LayerCard
              key={L.id}
              index={i}
              layer={L}
              compute={computed.stack[i]}
              ruleViolation={ruleViolations.includes(i)}
              smallCableGuidance={computed.stack[i] ? smallCableTapingGuidance(computed.stack[i].OD_before_mm, L) : null}
              onChange={(patch) => updateLayer(i, patch)}
              onRemove={() => removeLayer(i)}
              onUp={() => moveLayer(i, -1)}
              onDown={() => moveLayer(i, +1)}
              canUp={i > 0}
              canDown={i < layers.length - 1}
            />
          ))}
          {layers.length === 0 && (
            <div style={{ background: COLORS.card, border: `1px dashed ${COLORS.border}`, borderRadius: 4, padding: 24, textAlign: 'center', color: COLORS.textMuted }}>
              No layers — add one to start building.
            </div>
          )}
        </div>
      </div>

      {/* WTM pitch calculator */}
      <PitchCalculator defaultWidth={layers[0]?.tape_width_mm || 0.635} cableOD={computed.finalOD_mm || conductorOD_mm} />

      {/* Bragg notch detector */}
      <NotchDetector layers={layers} VP={computed.VP || 0.7} hasStack={computed.stack.length > 0} />

      {/* Physics callouts */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 14 }}>
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ background: 'transparent', border: 'none', color: COLORS.copperBright, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <Info size={12} /> Physics &amp; assumptions {showAdvanced ? '▾' : '▸'}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
            <p><strong style={{ color: COLORS.text }}>εᵣ from density (Looyenga):</strong> εᵣ_eff^⅓ = vf·εᵣ_PTFE^⅓ + (1−vf), where vf = ρ/ρ_solid. ρ_solid = 2.15 g/cm³, εᵣ_solid = 2.10. So 1.6 g/cm³ → εᵣ ≈ {densityToEps(1.6).toFixed(3)}; 0.7 g/cm³ → εᵣ ≈ {densityToEps(0.7).toFixed(3)}.</p>
            <p><strong style={{ color: COLORS.text }}>Layered εᵣ_eff (Wadell):</strong> εᵣ_eff = ln(D/d) / Σᵢ ln(rᵢ₊₁/rᵢ)/εᵣ,ᵢ. Phase velocity VP = 1/√εᵣ_eff. Z₀ = (60/√εᵣ_eff)·ln(D/d).</p>
            <p><strong style={{ color: COLORS.text }}>OD per pass:</strong> ΔOD = 2 · n_overlap · t_tape · τ. n_overlap = 2 (½) / 3 (⅔) / 4 (¾). τ ∈ [0.7, 1.0] is the tension factor — high τ = light tension (full thickness retained); low τ = WTM puts the tape under tension and squeezes it thinner.</p>
            <p><strong style={{ color: COLORS.text }}>Pitch (WTM lead screw):</strong> P = W · (1 − overlap). PTFE tape uses the shop settings {PTFE_WRAP_PRESETS.map((wrap) => `${wrap.percent}% (${wrap.key})`).join(', ')}. For a 0.0250 in tape: ½ wrap → 0.0125 in/rev; ⅔ wrap → 0.0083 in/rev; ¾ wrap → 0.0063 in/rev. The compensated pitch accounts for helix angle on large-OD cables (≪5% correction for typical RF coax).</p>
            <p style={{ color: COLORS.textMuted }}>Note: Looyenga is one of several mixing rules. For 0.5–1.0 g/cm³ foamed PTFE, manufacturer εᵣ data typically lies within ±0.05 of the Looyenga prediction. Calibrate against your in-house measurement if needed.</p>
            <p><strong style={{ color: COLORS.text }}>Small-conductor rule:</strong> for inner conductor OD ≤ 0.091&quot; ({SMALL_CABLE_MAX_OD_MM.toFixed(3)} mm), tape thickness must be ≤ {SMALL_CABLE_MAX_TAPE_MIL} mil ({SMALL_CABLE_MAX_TAPE_MM.toFixed(3)} mm). Thicker tape can&apos;t conform to the tight radius — it wrinkles, opens air gaps under the wrap, and produces inconsistent OD build. Use more passes of thinner tape instead.</p>
            <p><strong style={{ color: COLORS.text }}>Small-cable taping:</strong> for cable OD ≤ {SMALL_CABLE_TAPE_OD_IN.toFixed(3)}&quot; ({SMALL_CABLE_TAPE_OD_MM.toFixed(3)} mm), avoid {SMALL_CABLE_MAX_PTFE_WIDTH_IN.toFixed(4)}&quot; ({SMALL_CABLE_MAX_PTFE_WIDTH_MM.toFixed(3)} mm) PTFE tape and wider. Default to 2/3 wrap to reduce shrink-back; use 1/2 wrap only when the lower OD build is the target. A single 2/3 wrap builds 3 tape thicknesses, still smaller than two 1/2 wraps at 4 tape thicknesses.</p>
          </div>
        )}
      </div>
    </div>
    </UnitContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.textMuted, textTransform: 'uppercase' }}>{children}</div>
}

// ─────────────────────────────────────────────────────────
// Layer card
// ─────────────────────────────────────────────────────────
function LayerCard({ index, layer, compute, ruleViolation, smallCableGuidance, onChange, onRemove, onUp, onDown, canUp, canDown }) {
  const preset = PRESETS[layer.preset] || PRESETS.high_density
  const ovr = OVERLAP_PRESETS[layer.overlap] || OVERLAP_PRESETS['1/2']
  const { unit } = useUnit()
  const smallCableWrapWarning = smallCableGuidance?.smallCable && layer.overlap !== '2/3'
  const smallCableWidthWarning = Boolean(smallCableGuidance?.avoidWidth)

  // Match the tape thickness to the closest mil preset for highlight
  const currentMil = layer.tape_thickness_mm / MIL_TO_MM
  const matchedPreset = TAPE_THICKNESS_PRESETS.find((p) => Math.abs(p.mil - currentMil) < 0.05)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 12 }}>
      {/* Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 4, background: preset.color + '22', border: `1px solid ${preset.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: preset.color }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.textMuted, textTransform: 'uppercase' }}>Layer {index + 1}</div>
          <div style={{ fontSize: 12, color: COLORS.text, fontFamily: 'JetBrains Mono, monospace' }}>
            {preset.label} · {ovr.label} wrap · ×{layer.passes} pass{layer.passes !== 1 ? 'es' : ''}
            {compute && (
              <span style={{ color: COLORS.textMuted }}> → ΔOD {compute.thickness_mm.toFixed(3)} mm · εᵣ {compute.eps_r.toFixed(2)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={onUp} disabled={!canUp} className="dsd-btn" style={{ padding: '4px 6px', opacity: canUp ? 1 : 0.3, cursor: canUp ? 'pointer' : 'not-allowed' }} title="Move up (closer to conductor)">
            <ChevronUp size={12} />
          </button>
          <button onClick={onDown} disabled={!canDown} className="dsd-btn" style={{ padding: '4px 6px', opacity: canDown ? 1 : 0.3, cursor: canDown ? 'pointer' : 'not-allowed' }} title="Move down (further from conductor)">
            <ChevronDown size={12} />
          </button>
          <button onClick={onRemove} className="dsd-btn" style={{ padding: '4px 6px', borderColor: COLORS.red + '60', color: COLORS.red }} title="Remove layer">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {/* Density preset */}
        <div>
          <Label>Density</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <button
                key={k}
                onClick={() => onChange({ preset: k, density: p.density })}
                className={`dsd-pill ${layer.preset === k ? 'dsd-pill-active' : ''}`}
                style={{ borderColor: layer.preset === k ? p.color : COLORS.border, color: layer.preset === k ? p.color : COLORS.textDim }}
                title={p.sub}
              >
                {p.label}
              </button>
            ))}
          </div>
          {layer.preset === 'custom' && (
            <input
              type="number"
              step="0.05"
              min="0.2"
              max="2.2"
              value={layer.density}
              onChange={(e) => onChange({ density: parseFloat(e.target.value) || 0 })}
              className="dsd-input"
              style={{ marginTop: 4 }}
            />
          )}
          <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
            ρ {layer.density.toFixed(2)} g/cm³ → εᵣ {densityToEps(layer.density).toFixed(3)}
          </div>
        </div>

        {/* Tape thickness */}
        <div>
          <LengthField
            label="Tape thickness"
            valueMm={layer.tape_thickness_mm}
            onChangeMm={(v) => onChange({ tape_thickness_mm: v })}
            stepMm={0.005}
            stepInch={0.0005}
            minMm={0.005}
            maxMm={0.5}
            decMm={3}
            decInch={4}
            error={ruleViolation}
            hint={
              ruleViolation
                ? `Too thick for d ≤ 0.091" — drop to ≤ ${SMALL_CABLE_MAX_TAPE_MIL} mil`
                : `Nominal · ${(layer.tape_thickness_mm / MIL_TO_MM).toFixed(2)} mil`
            }
          />
          {/* Mil preset pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
            {TAPE_THICKNESS_PRESETS.map((p) => (
              <button
                key={p.mil}
                onClick={() => onChange({ tape_thickness_mm: p.mm })}
                className={`dsd-pill ${matchedPreset?.mil === p.mil ? 'dsd-pill-active' : ''}`}
                style={{ padding: '3px 7px', fontSize: 9 }}
                title={`${p.mil} mil = ${p.mm.toFixed(4)} mm`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tape width */}
        <LengthField
          label="Tape width"
          valueMm={layer.tape_width_mm}
          onChangeMm={(v) => onChange({ tape_width_mm: v })}
          stepMm={0.025}
          stepInch={0.0005}
          minMm={0.1}
          maxMm={4}
          decMm={3}
          decInch={4}
          error={smallCableWidthWarning}
          hint={smallCableWidthWarning ? `Avoid ≥ ${SMALL_CABLE_MAX_PTFE_WIDTH_IN.toFixed(4)} in below ${SMALL_CABLE_TAPE_OD_IN.toFixed(3)} in OD` : 'For pitch calc'}
        />

        {/* Overlap */}
        <div>
          <Label>Overlap</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {Object.entries(OVERLAP_PRESETS).map(([k, o]) => (
              <button
                key={k}
                onClick={() => onChange({ overlap: k })}
                className={`dsd-pill ${layer.overlap === k ? 'dsd-pill-active' : ''}`}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
            {ovr.hint} → {ovr.layers}× tape thickness
          </div>
          {smallCableWrapWarning && (
            <div style={{ fontSize: 9, color: COLORS.copperBright, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.35 }}>
              Small OD: use 2/3 wrap for shrink-back unless 1/2 is needed to hold OD.
            </div>
          )}
        </div>

        {/* Tension */}
        <div>
          <Label>Tension factor τ</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <input
              type="range"
              min="0.7"
              max="1.0"
              step="0.01"
              value={layer.tension_factor}
              onChange={(e) => onChange({ tension_factor: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: COLORS.copper }}
            />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: COLORS.copperBright, width: 40, textAlign: 'right' }}>
              {(layer.tension_factor * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
            {layer.tension_factor >= 0.95 ? 'Light · full t' : layer.tension_factor >= 0.88 ? 'Medium · slight squeeze' : 'High · firm squeeze'}
          </div>
        </div>

        {/* Passes */}
        <NumField
          label="Passes (× wrap)"
          value={layer.passes}
          onChange={(v) => onChange({ passes: Math.max(1, Math.round(v)) })}
          step={1}
          min={1}
          max={20}
          unit="×"
          hint="WTM head passes"
        />
      </div>

      {/* Per-layer summary */}
      {compute && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <Stat label="OD before" value={fmtLen(compute.OD_before_mm, unit)} />
          <Stat label="OD after"  value={fmtLen(compute.OD_after_mm, unit)} highlight />
          <Stat label="Δ thickness" value={fmtLen(compute.thickness_mm, unit)} />
          <Stat label="εᵣ this layer" value={compute.eps_r.toFixed(3)} />
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange, step, min, max, unit, hint }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="dsd-input"
          style={{ flex: 1 }}
        />
        {unit && <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace', minWidth: 24 }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// Unit-aware length input. State stays in mm; UI display follows current
// UnitContext. Pass `error` to highlight in red.
function LengthField({ label, valueMm, onChangeMm, stepMm = 0.005, stepInch = 0.0005, minMm, maxMm, decMm = 3, decInch = 4, hint, error }) {
  const { unit } = useUnit()
  const display = toDisplay(valueMm, unit, decMm, decInch)
  const step = unit === 'inch' ? stepInch : stepMm
  const min = minMm != null ? toDisplay(minMm, unit, decMm, decInch) : undefined
  const max = maxMm != null ? toDisplay(maxMm, unit, decMm, decInch) : undefined
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={display}
          onChange={(e) => {
            const mm = fromDisplay(e.target.value, unit)
            if (mm != null) onChangeMm(mm)
          }}
          className={`dsd-input${error ? ' dsd-input-error' : ''}`}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace', minWidth: 24 }}>
          {unit === 'inch' ? 'in' : 'mm'}
        </span>
      </div>
      {hint && <div style={{ fontSize: 9, color: error ? COLORS.red : COLORS.textMuted, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function Stat({ label, value, highlight, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: COLORS.textMuted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: highlight ? 14 : 12, color: color || (highlight ? COLORS.copperBright : COLORS.text), marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Final readout panel
// ─────────────────────────────────────────────────────────
function ReadoutPanel({ computed, z0Verdict, z0Off }) {
  const { unit } = useUnit()
  const { finalOD_mm, eps_eff, VP, Z0, propDelay_ns_per_m, totalDielectricThickness_mm, stack } = computed
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.2em', color: COLORS.copper, textTransform: 'uppercase', marginBottom: 8 }}>
        ◆ Cumulative readout
      </div>
      {stack.length === 0 ? (
        <div style={{ color: COLORS.textMuted, fontSize: 12, padding: 12, textAlign: 'center' }}>
          Add a layer to compute outputs.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          <Stat label="Final OD (D)" value={fmtLen(finalOD_mm, unit)} highlight />
          <Stat label="Dielectric Δ" value={fmtLen(totalDielectricThickness_mm, unit)} />
          <Stat label="εᵣ_eff" value={eps_eff.toFixed(3)} />
          <Stat label="VP" value={`${(VP * 100).toFixed(1)}% c`} highlight />
          <Stat label="Z₀" value={`${Z0.toFixed(2)} Ω`} highlight color={z0Verdict.color} />
          <Stat label="Δ vs target" value={`${z0Off >= 0 ? '+' : ''}${z0Off.toFixed(2)} Ω · ${z0Verdict.label}`} color={z0Verdict.color} />
          <Stat label="Prop delay" value={`${propDelay_ns_per_m.toFixed(2)} ns/m`} />
          <Stat label="D/d ratio" value={(finalOD_mm / (computed.stack[0]?.OD_before_mm || 1)).toFixed(3)} />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Cross-section visualization
// ─────────────────────────────────────────────────────────
function CrossSection({ conductorOD, stack, finalOD }) {
  const { unit } = useUnit()
  const VW = 240, VH = 240
  const padding = 10
  const maxR = (Math.min(VW, VH) / 2) - padding
  const totalRealR = (finalOD || conductorOD) / 2
  const scale = totalRealR > 0 ? maxR / totalRealR : 1

  // Choose a sensible ruler tick: 1 mm in mm-mode, 0.05 inch (50 mil) in inch-mode
  const rulerLength_mm = unit === 'inch' ? 0.05 * 25.4 : 1
  const rulerLabel = unit === 'inch' ? '50 mil (0.05")' : '1 mm'

  return (
    <svg viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} style={{ width: '100%', height: 240, display: 'block', marginTop: 8 }}>
      <defs>
        <radialGradient id="dsd-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d97706" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#0a0705" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dsd-conductor" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#7c4a16" />
        </radialGradient>
      </defs>

      <rect x={-VW / 2} y={-VH / 2} width={VW} height={VH} fill="url(#dsd-glow)" />

      {/* Layers, outside-in so outer shows behind inner */}
      {stack.slice().reverse().map((layer, i) => {
        const idx = stack.length - 1 - i
        const r_outer = (layer.OD_after_mm / 2) * scale
        return (
          <circle
            key={layer.id}
            cx={0}
            cy={0}
            r={r_outer}
            fill={layer.color}
            fillOpacity={0.32 + 0.10 * (1 - idx / Math.max(1, stack.length - 1))}
            stroke={layer.color}
            strokeWidth={0.6}
            strokeOpacity={0.85}
          />
        )
      })}

      {/* Inner conductor */}
      <circle cx={0} cy={0} r={(conductorOD / 2) * scale} fill="url(#dsd-conductor)" stroke="rgba(0,0,0,0.5)" strokeWidth={0.4} />
      <circle cx={-(conductorOD / 2) * scale * 0.3} cy={-(conductorOD / 2) * scale * 0.3} r={(conductorOD / 2) * scale * 0.3} fill="#fef3c7" opacity={0.5} />

      {/* Scale ruler */}
      <g transform={`translate(${-VW / 2 + 12}, ${VH / 2 - 16})`}>
        <line x1={0} y1={0} x2={rulerLength_mm * scale} y2={0} stroke="#d97706" strokeWidth="1.5" />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="#d97706" strokeWidth="1" />
        <line x1={rulerLength_mm * scale} y1={-3} x2={rulerLength_mm * scale} y2={3} stroke="#d97706" strokeWidth="1" />
        <text x={rulerLength_mm * scale + 4} y={3} fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#d97706">{rulerLabel}</text>
      </g>

      {/* Center dot */}
      <circle cx={0} cy={0} r={0.7} fill="#0a0705" />
    </svg>
  )
}

function Legend({ stack }) {
  const { unit } = useUnit()
  if (stack.length === 0) return null
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stack.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
          <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
          <span style={{ color: COLORS.text }}>L{i + 1}</span>
          <span style={{ color: COLORS.textMuted, marginLeft: 'auto' }}>{fmtLen(s.OD_after_mm, unit)}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// WTM pitch calculator
// ─────────────────────────────────────────────────────────
function PitchCalculator({ defaultWidth, cableOD }) {
  const { unit } = useUnit()
  const [width, setWidth] = useState(defaultWidth || 0.635)
  const [overlap, setOverlap] = useState('1/2')
  const [compensate, setCompensate] = useState(false)

  const overlapFraction = OVERLAP_PRESETS[normalizePtfeWrap(overlap).key]?.fraction ?? 0.5

  // Simple: P = W × (1 − overlap)
  const pitchSimple = width * (1 - overlapFraction)

  // Compensated: solve P = (1−f)·W·√(P²+π²D²)/(πD)  →  iterate.
  // ⇔  P² · π² D² = (1−f)² · W² · (P² + π² D²)
  // ⇔  P² · (π² D² − (1−f)² W²) = (1−f)² W² · π² D²
  // ⇔  P² = (1−f)² W² π² D² / (π² D² − (1−f)² W²)
  const pitchCompensated = (() => {
    if (!compensate || !cableOD || cableOD <= 0) return pitchSimple
    const D = cableOD
    const f = overlapFraction
    const num = Math.pow((1 - f) * width * Math.PI * D, 2)
    const den = Math.pow(Math.PI * D, 2) - Math.pow((1 - f) * width, 2)
    if (den <= 0) return pitchSimple
    return Math.sqrt(num / den)
  })()

  const pitch = compensate ? pitchCompensated : pitchSimple
  const turnsPerCm = pitch > 0 ? 10 / pitch : 0
  const turnsPerInch = pitch > 0 ? 25.4 / pitch : 0
  const helixAngleDeg = cableOD > 0 ? Math.atan2(pitch, Math.PI * cableOD) * 180 / Math.PI : 0

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Settings size={14} style={{ color: COLORS.copperBright }} />
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: COLORS.copper, textTransform: 'uppercase' }}>
          ◆ WTM Pitch Calculator
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <LengthField
          label="Tape width (W)"
          valueMm={width}
          onChangeMm={setWidth}
          stepMm={0.025}
          stepInch={0.0005}
          minMm={0.1}
          maxMm={4}
          decMm={3}
          decInch={4}
        />
        <div>
          <Label>Target overlap</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {Object.entries(OVERLAP_PRESETS).map(([k, o]) => (
              <button
                key={k}
                onClick={() => setOverlap(k)}
                className={`dsd-pill ${overlap === k ? 'dsd-pill-active' : ''}`}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Helix compensation</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button
              onClick={() => setCompensate(!compensate)}
              className={`dsd-pill ${compensate ? 'dsd-pill-active' : ''}`}
            >
              {compensate ? 'On' : 'Off'}
            </button>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
              cable OD {fmtLen(cableOD || 0, unit)}
            </span>
          </div>
          <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            On: solve implicit P from W·cos(α). Off: P = W·(1−overlap).
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Stat
          label={`WTM pitch (P) · ${unit === 'inch' ? 'in' : 'mm'}/rev`}
          value={unit === 'inch' ? `${(pitch / 25.4).toFixed(4)} in/rev` : `${pitch.toFixed(3)} mm/rev`}
          highlight
        />
        <Stat label="WTM pitch · mil/rev" value={`${(pitch / MIL_TO_MM).toFixed(1)} mil/rev`} />
        <Stat label="Turns / cm" value={turnsPerCm.toFixed(2)} />
        <Stat label="Turns / inch" value={turnsPerInch.toFixed(2)} />
        <Stat label="Helix angle (from axis)" value={`${(90 - helixAngleDeg).toFixed(1)}°`} />
        {compensate && Math.abs(pitchCompensated - pitchSimple) > 0.001 && (
          <Stat
            label="Δ vs simple"
            value={unit === 'inch'
              ? `${pitchCompensated > pitchSimple ? '+' : ''}${((pitchCompensated - pitchSimple) / 25.4).toFixed(4)} in`
              : `${pitchCompensated > pitchSimple ? '+' : ''}${(pitchCompensated - pitchSimple).toFixed(3)} mm`}
            color={COLORS.teal}
          />
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
        Set the WTM lead screw to{' '}
        <strong style={{ color: COLORS.copperBright }}>
          {unit === 'inch' ? `${(pitch / 25.4).toFixed(4)} in/rev (${(pitch / MIL_TO_MM).toFixed(1)} mil/rev)` : `${pitch.toFixed(3)} mm/rev`}
        </strong>
        {' '}for a {OVERLAP_PRESETS[overlap]?.hint || normalizePtfeWrap(overlap).label} on a{' '}
        {unit === 'inch' ? `${(width / 25.4).toFixed(4)}" (${(width / MIL_TO_MM).toFixed(1)} mil)` : `${width.toFixed(3)} mm`} tape.
        Operator-side units: ≈ {turnsPerInch.toFixed(1)} turns per inch of cable advance.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Bragg notch detector — predicts suckouts from periodic tape wraps
// f_n = n · c · VP / (2 · P_axial),  P_axial = W · (1 − overlap)
// ─────────────────────────────────────────────────────────
function NotchDetector({ layers, VP, hasStack }) {
  const { unit } = useUnit()
  const [maxFreqGHz, setMaxFreqGHz] = useState(40)
  const [nHarmonics, setNHarmonics] = useState(3)

  const analysis = useMemo(() => {
    if (!hasStack || !VP || VP <= 0 || layers.length === 0) return null
    const c = 299792458
    const perLayer = layers.map((L, i) => {
      const W = L.tape_width_mm || 0.635
      const ovr = OVERLAP_PRESETS[L.overlap] || OVERLAP_PRESETS['1/2']
      const f_overlap = ovr.fraction
      const pitch_mm = W * (1 - f_overlap)
      const harmonics = []
      for (let n = 1; n <= nHarmonics; n++) {
        if (pitch_mm <= 0) break
        const f_hz = (n * c * VP) / (2 * pitch_mm * 1e-3)
        const f_ghz = f_hz / 1e9
        if (f_ghz <= maxFreqGHz) harmonics.push({ n, f_ghz })
      }
      return {
        index: i,
        tape_width_mm: W,
        overlap: L.overlap,
        pitch_mm,
        passes: L.passes,
        harmonics,
        color: PRESETS[L.preset]?.color || '#fbbf24',
      }
    })

    // Aggregate notches by frequency (rounded to 0.1 GHz to merge near-coincident)
    const bins = {}
    for (const lay of perLayer) {
      for (const h of lay.harmonics) {
        const key = h.f_ghz.toFixed(1)
        if (!bins[key]) bins[key] = { f_ghz: parseFloat(key), layers: [], pitches: new Set(), totalPasses: 0 }
        bins[key].layers.push(lay.index)
        bins[key].pitches.add(parseFloat(lay.pitch_mm.toFixed(3)))
        bins[key].totalPasses += lay.passes
      }
    }
    const aggregated = Object.values(bins)
      .map((b) => ({
        f_ghz: b.f_ghz,
        contributing_layers: b.layers,
        coherent: b.pitches.size === 1 && b.layers.length >= 2,
        total_passes: b.totalPasses,
        depth_qual: b.pitches.size === 1 && b.layers.length >= 2
          ? 'STRONG'
          : b.layers.length >= 2 ? 'MEDIUM'
          : 'WEAK',
      }))
      .sort((a, b) => a.f_ghz - b.f_ghz)

    return { perLayer, aggregated }
  }, [layers, VP, maxFreqGHz, nHarmonics, hasStack])

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Zap size={14} style={{ color: COLORS.copperBright }} />
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: COLORS.copper, textTransform: 'uppercase' }}>
          ◆ Bragg Notch Detector · tape suckout forecast
        </div>
      </div>

      {!analysis ? (
        <div style={{ color: COLORS.textMuted, fontSize: 12, padding: 12, textAlign: 'center', fontStyle: 'italic' }}>
          Add a layer to forecast Bragg notch frequencies.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <NumField
              label="Max scan frequency"
              value={maxFreqGHz}
              onChange={(v) => setMaxFreqGHz(Math.max(1, v))}
              step={1}
              min={1}
              max={200}
              unit="GHz"
            />
            <NumField
              label="Harmonics per layer"
              value={nHarmonics}
              onChange={(v) => setNHarmonics(Math.max(1, Math.min(8, Math.round(v))))}
              step={1}
              min={1}
              max={8}
              unit="n"
            />
            <div>
              <Label>Cable VP (in use)</Label>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: COLORS.copperBright, marginTop: 6 }}>
                {(VP * 100).toFixed(1)}% c
              </div>
              <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
                from current dielectric stack
              </div>
            </div>
          </div>

          {/* Per-layer pitch + harmonics */}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginBottom: 10 }}>
            <Label>Per-layer pitch &amp; harmonics</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {analysis.perLayer.map((lay) => (
                <div key={lay.index} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 1fr', gap: 8, alignItems: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: lay.color, borderRadius: 2 }} />
                    <span style={{ color: COLORS.text }}>L{lay.index + 1}</span>
                  </div>
                  <div style={{ color: COLORS.textDim }}>
                    W={unit === 'inch' ? `${(lay.tape_width_mm / 25.4).toFixed(3)}"` : `${lay.tape_width_mm.toFixed(2)} mm`}{' '}
                    · {lay.overlap} → P=
                    {unit === 'inch'
                      ? `${(lay.pitch_mm / 25.4).toFixed(4)} in/rev (${(lay.pitch_mm / MIL_TO_MM).toFixed(1)} mil)`
                      : `${lay.pitch_mm.toFixed(3)} mm/rev`}
                  </div>
                  <div style={{ color: COLORS.textMuted, textAlign: 'right' }}>×{lay.passes}</div>
                  <div style={{ color: COLORS.copperBright, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {lay.harmonics.length === 0 ? (
                      <span style={{ color: COLORS.textMuted }}>(no harmonic ≤ {maxFreqGHz} GHz)</span>
                    ) : lay.harmonics.map((h) => (
                      <span key={h.n}>n{h.n}={h.f_ghz.toFixed(2)} GHz</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Aggregated notches */}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
            <Label>Predicted notches (aggregated)</Label>

            {/* Spectrum bar */}
            <NotchSpectrum aggregated={analysis.aggregated} maxFreqGHz={maxFreqGHz} />

            {analysis.aggregated.length === 0 ? (
              <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>
                No Bragg notches predicted in this band.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {analysis.aggregated.slice(0, 12).map((n) => (
                  <div key={n.f_ghz} style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr', gap: 8, alignItems: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                    <div style={{ color: COLORS.copperBright, fontWeight: 600 }}>{n.f_ghz.toFixed(2)} GHz</div>
                    <div style={{
                      color: n.depth_qual === 'STRONG' ? COLORS.red : n.depth_qual === 'MEDIUM' ? COLORS.copperBright : COLORS.teal,
                      fontWeight: 600,
                    }}>
                      {n.depth_qual === 'STRONG' && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, marginBottom: 2 }} />}
                      {n.depth_qual}
                    </div>
                    <div style={{ color: COLORS.textDim }}>
                      from L{n.contributing_layers.map((i) => i + 1).join(' + L')}
                      {n.coherent && <span style={{ color: COLORS.red, marginLeft: 8 }}>· COHERENT (same pitch — notch deepens)</span>}
                    </div>
                  </div>
                ))}
                {analysis.aggregated.length > 12 && (
                  <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' }}>
                    + {analysis.aggregated.length - 12} more harmonics above this band
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mitigation tip */}
          {analysis.aggregated.some((n) => n.coherent) && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(248,113,113,0.08)', border: `1px solid ${COLORS.red}55`, borderRadius: 3, fontSize: 11, color: COLORS.red, lineHeight: 1.5 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>⚠ Coherent notch warning</strong>
              <span style={{ color: COLORS.textDim }}>
                Two or more tape layers share the same pitch — their periodic perturbations add coherently into a deeper notch.
                Mitigate by varying tape width or overlap between layers, or by adding a small lateral offset between passes
                so the periodicity decorrelates.
              </span>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}>
            f<sub>n</sub> = n · c · VP / (2 · P<sub>axial</sub>) [Bragg condition]. Pitch P = W · (1 − overlap).
            Notches are typically 0.5–3 dB deep per coherent layer pair on a metre-scale cable run.
          </div>
        </>
      )}
    </div>
  )
}

// Mini spectrum bar showing where notches sit on a 0..maxFreq axis
function NotchSpectrum({ aggregated, maxFreqGHz }) {
  if (aggregated.length === 0) return null
  return (
    <div style={{ marginTop: 8, position: 'relative', height: 50, background: '#080503', border: `1px solid ${COLORS.border}`, borderRadius: 3, padding: '0 6px' }}>
      {/* Grid lines every 5 GHz */}
      {Array.from({ length: Math.floor(maxFreqGHz / 5) + 1 }, (_, i) => i * 5).map((f) => (
        <div key={f} style={{ position: 'absolute', left: `${(f / maxFreqGHz) * 100}%`, top: 0, bottom: 0, width: 1, background: COLORS.border, opacity: 0.4 }} />
      ))}
      {/* X-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <div key={f} style={{ position: 'absolute', left: `${f * 100}%`, bottom: -1, transform: 'translateX(-50%)', fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: COLORS.textMuted }}>
          {(f * maxFreqGHz).toFixed(0)}
        </div>
      ))}
      {/* Notch stems */}
      {aggregated.map((n) => {
        const x = (n.f_ghz / maxFreqGHz) * 100
        const color = n.depth_qual === 'STRONG' ? COLORS.red : n.depth_qual === 'MEDIUM' ? COLORS.copperBright : COLORS.teal
        const height = n.depth_qual === 'STRONG' ? 32 : n.depth_qual === 'MEDIUM' ? 24 : 16
        return (
          <div
            key={n.f_ghz}
            style={{
              position: 'absolute', left: `${x}%`, bottom: 14, transform: 'translateX(-50%)',
              width: 2, height, background: color, opacity: 0.85,
            }}
            title={`${n.f_ghz.toFixed(2)} GHz · ${n.depth_qual}`}
          />
        )
      })}
    </div>
  )
}

import React, { useState, useMemo } from 'react'
import { Plus, Trash2, Info, Layers, Settings, ChevronUp, ChevronDown } from 'lucide-react'

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
  butt: { fraction: 0,     label: 'Butt',  hint: 'No overlap',   layers: 1 },
  '1/2': { fraction: 0.5,  label: '1/2',   hint: '50% overlap',  layers: 2 },
  '2/3': { fraction: 0.667,label: '2/3',   hint: '67% overlap',  layers: 3 },
  '3/4': { fraction: 0.75, label: '3/4',   hint: '75% overlap',  layers: 4 },
}

function newLayer(idx) {
  return {
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    preset: 'high_density',
    density: 1.6,
    tape_thickness_mm: 0.10,
    tape_width_mm: 6.35,
    overlap: '1/2',
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
  const [conductorOD_mm, setConductorOD_mm] = useState(0.96) // 18 AWG ≈ 1.024 mm; 19 AWG ≈ 0.912; 18.5 AWG ≈ 0.96
  const [layers, setLayers] = useState(() => [
    { ...newLayer(0), preset: 'low_density',  density: 0.7, tape_thickness_mm: 0.10, overlap: '1/2', passes: 2 },
    { ...newLayer(1), preset: 'high_density', density: 1.6, tape_thickness_mm: 0.10, overlap: '1/2', passes: 1 },
  ])
  const [targetZ0, setTargetZ0] = useState(50)
  const [showAdvanced, setShowAdvanced] = useState(false)

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
    <div style={{ display: 'grid', gap: 14 }}>
      <style>{`
        .dsd-input {
          background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; color: ${COLORS.text};
          padding: 6px 9px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
          border-radius: 3px; outline: none; width: 100%;
        }
        .dsd-input:focus { border-color: ${COLORS.copper}; }
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
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.25em', color: COLORS.copper, textTransform: 'uppercase', marginBottom: 4 }}>
          ◆ Dielectric Stack Designer
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em', color: '#fef3c7' }}>
          PTFE tape build-up · WTM pitch calculator
        </h2>
        <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Stack PTFE tape layers to dial in target VP &amp; Z₀. Each pass adds 2·t·n<sub>overlap</sub>·τ to OD,
          where τ is the tension factor (siết càng căng OD càng nhỏ). εᵣ per layer comes from density via
          Looyenga; cumulative εᵣ_eff uses the layered-coax log mix (Wadell §3).
        </p>
      </div>

      {/* Top row: conductor input + final readout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 12 }}>
          <Label>Inner conductor OD (d)</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <input
              type="number"
              step="0.001"
              min="0.05"
              max="20"
              value={conductorOD_mm}
              onChange={(e) => setConductorOD_mm(parseFloat(e.target.value) || 0)}
              className="dsd-input"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>mm</span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.4 }}>
            18 AWG ≈ 1.024 · 19 AWG ≈ 0.912 · 20 AWG ≈ 0.812 · 22 AWG ≈ 0.643
          </div>

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
      <PitchCalculator defaultWidth={layers[0]?.tape_width_mm || 6.35} cableOD={computed.finalOD_mm || conductorOD_mm} />

      {/* Physics callouts */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 14 }}>
        <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ background: 'transparent', border: 'none', color: COLORS.copperBright, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <Info size={12} /> Physics &amp; assumptions {showAdvanced ? '▾' : '▸'}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
            <p><strong style={{ color: COLORS.text }}>εᵣ from density (Looyenga):</strong> εᵣ_eff^⅓ = vf·εᵣ_PTFE^⅓ + (1−vf), where vf = ρ/ρ_solid. ρ_solid = 2.15 g/cm³, εᵣ_solid = 2.10. So 1.6 g/cm³ → εᵣ ≈ {densityToEps(1.6).toFixed(3)}; 0.7 g/cm³ → εᵣ ≈ {densityToEps(0.7).toFixed(3)}.</p>
            <p><strong style={{ color: COLORS.text }}>Layered εᵣ_eff (Wadell):</strong> εᵣ_eff = ln(D/d) / Σᵢ ln(rᵢ₊₁/rᵢ)/εᵣ,ᵢ. Phase velocity VP = 1/√εᵣ_eff. Z₀ = (60/√εᵣ_eff)·ln(D/d).</p>
            <p><strong style={{ color: COLORS.text }}>OD per pass:</strong> ΔOD = 2 · n_overlap · t_tape · τ. n_overlap = round(1/(1−overlap)) = 1 (butt) / 2 (½) / 3 (⅔) / 4 (¾). τ ∈ [0.7, 1.0] is the tension factor — high τ = light tension (full thickness retained); low τ = WTM puts the tape under tension and squeezes it thinner.</p>
            <p><strong style={{ color: COLORS.text }}>Pitch (WTM lead screw):</strong> P = W · (1 − overlap). For a 6.35 mm tape: ½ wrap → 3.175 mm/rev; ⅔ wrap → 2.117 mm/rev; ¾ wrap → 1.588 mm/rev. The compensated pitch accounts for helix angle on large-OD cables (≪5% correction for typical RF coax).</p>
            <p style={{ color: COLORS.textMuted }}>Note: Looyenga is one of several mixing rules. For 0.5–1.0 g/cm³ foamed PTFE, manufacturer εᵣ data typically lies within ±0.05 of the Looyenga prediction. Calibrate against your in-house measurement if needed.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.textMuted, textTransform: 'uppercase' }}>{children}</div>
}

// ─────────────────────────────────────────────────────────
// Layer card
// ─────────────────────────────────────────────────────────
function LayerCard({ index, layer, compute, onChange, onRemove, onUp, onDown, canUp, canDown }) {
  const preset = PRESETS[layer.preset] || PRESETS.high_density
  const ovr = OVERLAP_PRESETS[layer.overlap] || OVERLAP_PRESETS['1/2']

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
        <NumField
          label="Tape thickness"
          value={layer.tape_thickness_mm}
          onChange={(v) => onChange({ tape_thickness_mm: v })}
          step={0.005}
          min={0.005}
          max={0.5}
          unit="mm"
          hint="Nominal — gets multiplied by τ"
        />

        {/* Tape width */}
        <NumField
          label="Tape width"
          value={layer.tape_width_mm}
          onChange={(v) => onChange({ tape_width_mm: v })}
          step={0.1}
          min={1}
          max={50}
          unit="mm"
          hint="For pitch calc"
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
          <Stat label="OD before" value={`${compute.OD_before_mm.toFixed(3)} mm`} />
          <Stat label="OD after"  value={`${compute.OD_after_mm.toFixed(3)} mm`} highlight />
          <Stat label="Δ thickness" value={`${compute.thickness_mm.toFixed(3)} mm`} />
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
          <Stat label="Final OD (D)" value={`${finalOD_mm.toFixed(3)} mm`} highlight />
          <Stat label="Dielectric Δ" value={`${totalDielectricThickness_mm.toFixed(3)} mm`} />
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
  const VW = 240, VH = 240
  const padding = 10
  const maxR = (Math.min(VW, VH) / 2) - padding
  const totalRealR = (finalOD || conductorOD) / 2
  const scale = totalRealR > 0 ? maxR / totalRealR : 1

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
        <line x1={0} y1={0} x2={1 * scale} y2={0} stroke="#d97706" strokeWidth="1.5" />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="#d97706" strokeWidth="1" />
        <line x1={1 * scale} y1={-3} x2={1 * scale} y2={3} stroke="#d97706" strokeWidth="1" />
        <text x={1 * scale + 4} y={3} fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#d97706">1 mm</text>
      </g>

      {/* Center dot */}
      <circle cx={0} cy={0} r={0.7} fill="#0a0705" />
    </svg>
  )
}

function Legend({ stack }) {
  if (stack.length === 0) return null
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stack.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
          <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
          <span style={{ color: COLORS.text }}>L{i + 1}</span>
          <span style={{ color: COLORS.textMuted, marginLeft: 'auto' }}>{s.OD_after_mm.toFixed(3)} mm</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// WTM pitch calculator
// ─────────────────────────────────────────────────────────
function PitchCalculator({ defaultWidth, cableOD }) {
  const [width, setWidth] = useState(defaultWidth || 6.35)
  const [overlap, setOverlap] = useState('1/2')
  const [customOverlap, setCustomOverlap] = useState(50)
  const [compensate, setCompensate] = useState(false)

  const overlapFraction =
    overlap === 'custom' ? Math.min(0.95, Math.max(0, customOverlap / 100)) :
    OVERLAP_PRESETS[overlap]?.fraction ?? 0.5

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
        <NumField
          label="Tape width (W)"
          value={width}
          onChange={setWidth}
          step={0.1}
          min={1}
          max={50}
          unit="mm"
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
            <button
              onClick={() => setOverlap('custom')}
              className={`dsd-pill ${overlap === 'custom' ? 'dsd-pill-active' : ''}`}
            >
              Custom
            </button>
          </div>
          {overlap === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <input
                type="range"
                min="0"
                max="95"
                step="1"
                value={customOverlap}
                onChange={(e) => setCustomOverlap(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: COLORS.copper }}
              />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: COLORS.copperBright, width: 40, textAlign: 'right' }}>
                {customOverlap}%
              </span>
            </div>
          )}
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
              cable OD {cableOD?.toFixed(2) || '—'} mm
            </span>
          </div>
          <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            On: solve implicit P from W·cos(α). Off: P = W·(1−overlap).
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Stat label="WTM pitch (P)" value={`${pitch.toFixed(3)} mm/rev`} highlight />
        <Stat label="Turns / cm" value={turnsPerCm.toFixed(2)} />
        <Stat label="Turns / inch" value={turnsPerInch.toFixed(2)} />
        <Stat label="Helix angle (from axis)" value={`${(90 - helixAngleDeg).toFixed(1)}°`} />
        {compensate && Math.abs(pitchCompensated - pitchSimple) > 0.001 && (
          <Stat
            label="Δ vs simple"
            value={`${pitchCompensated > pitchSimple ? '+' : ''}${(pitchCompensated - pitchSimple).toFixed(3)} mm`}
            color={COLORS.teal}
          />
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
        Set the WTM lead screw to <strong style={{ color: COLORS.copperBright }}>{pitch.toFixed(3)} mm/rev</strong>{' '}
        for a {OVERLAP_PRESETS[overlap]?.hint || `${customOverlap}% overlap`} on a {width.toFixed(2)} mm tape.
        Operator-side units: ≈ {turnsPerInch.toFixed(1)} turns per inch of cable advance.
      </div>
    </div>
  )
}

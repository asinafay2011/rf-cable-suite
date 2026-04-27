import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, AlertTriangle, SkipForward, Sparkles } from 'lucide-react'
import {
  STAGES,
  defaultRecipeFromStages,
  getStageRecipe,
} from './cableBuilderStages.js'
import {
  STANDARDS,
  DIELECTRICS,
  JACKETS,
  WRAP_MATERIALS,
  FOIL_MATERIALS,
  MATERIALS,
  runPipeline,
  computeIL,
} from './ProcessSim.jsx'

// ─────────────────────────────────────────────────────────
// Cable Builder — guided stage-by-stage interactive cable assembly.
//
// State shape (persisted to localStorage as 'cablelab.builder-state'):
//   { currentStage, recipe, appliedStages, mode, targetStandard, draftFields }
//
// On each Apply: merge draftFields into recipe[stageId], add stageId to
// appliedStages, advance currentStage. The 3D view re-renders showing the
// new outer ring; the spec panel re-runs runPipeline(recipe) and updates.
// ─────────────────────────────────────────────────────────

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

const STORAGE_KEY = 'cablelab.builder-state'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveState(state) {
  try {
    // Convert Set → Array for JSON
    const serializable = { ...state, appliedStages: Array.from(state.appliedStages) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  } catch {}
}

const initialDraft = (stage) => {
  const out = {}
  for (const f of stage.fields) out[f.name] = f.default
  return out
}

// ─── Convert recipe + appliedStages → renderable layers for 3D ───
function buildLayersFromRecipe(recipe, appliedStages) {
  const layers = []
  // Always show conductor if applied (or if any stage past it is applied)
  if (appliedStages.has('conductor')) {
    const m = MATERIALS[recipe.conductor?.material] || MATERIALS.spc
    layers.push({ name: m.name, color: m.color || '#c97b3f', kind: 'core' })
  }
  if (appliedStages.has('insulation')) {
    const d = DIELECTRICS[recipe.insulation?.material] || DIELECTRICS.fep_foamed
    layers.push({ name: d.name, color: '#fbbf24', kind: 'solid' })
  }
  if (appliedStages.has('pair') && (recipe.bundle?.pair_count || 4) >= 2) {
    // Pair stage doesn't add a NEW outer ring — it's a structural change.
    // We render a small "twist" indicator by replacing the insulation tint slightly.
  }
  if (appliedStages.has('pair_wrap') && recipe.pair_wrap?.material && recipe.pair_wrap.material !== 'none') {
    const w = WRAP_MATERIALS[recipe.pair_wrap.material] || WRAP_MATERIALS.ptfe_tape
    layers.push({ name: w.name, color: '#a78bfa', kind: 'striped' })
  }
  if (appliedStages.has('pair_foil') && recipe.pair_foil?.material && recipe.pair_foil.material !== 'none') {
    layers.push({ name: 'Per-pair foil', color: '#a7b0b6', kind: 'foil' })
  }
  if (appliedStages.has('bundle')) {
    layers.push({ name: 'Bundle / X-spline', color: '#5eead4', kind: 'spline' })
  }
  if (appliedStages.has('outer_foil') && recipe.outer_foil?.foil) {
    layers.push({ name: 'Outer foil', color: '#cbd5e1', kind: 'foil' })
  }
  if (appliedStages.has('shield') && recipe.shield?.braid_enabled) {
    layers.push({ name: 'Outer braid', color: '#c97b3f', kind: 'braid' })
  }
  if (appliedStages.has('jacket')) {
    const j = JACKETS[recipe.jacket?.material] || JACKETS.lszh
    layers.push({ name: j.name, color: '#1a2226', kind: 'solid', textColor: '#a7b0b6' })
  }
  // Compute equal-width outer radii (visual only) for layers that don't have one yet.
  const N = layers.length
  for (let i = 0; i < N; i++) {
    layers[i].to = (i + 1) / N
  }
  return layers
}

// ─── Spec verdict against active target ───
function verdictColor(value, lo, hi, betterLow = true) {
  if (value == null || isNaN(value)) return C.textMuted
  if (lo != null && hi != null) {
    if (value >= lo && value <= hi) return C.teal
    const tol = (hi - lo) * 0.5
    if (value >= lo - tol && value <= hi + tol) return C.amber
    return C.red
  }
  if (lo != null) return value >= lo ? C.teal : value >= lo * 0.85 ? C.amber : C.red
  if (hi != null) return value <= hi ? C.teal : value <= hi * 1.15 ? C.amber : C.red
  return C.text
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
export default function CableBuilder() {
  const initial = useMemo(() => {
    const saved = loadState()
    if (saved) {
      return {
        currentStage: saved.currentStage ?? 0,
        recipe: saved.recipe || defaultRecipeFromStages(),
        appliedStages: new Set(saved.appliedStages || []),
        mode: saved.mode || 'sandbox',
        targetStandard: saved.targetStandard || 'cat6a',
        draftFields: saved.draftFields || initialDraft(STAGES[0]),
      }
    }
    return {
      currentStage: 0,
      recipe: defaultRecipeFromStages(),
      appliedStages: new Set(),
      mode: 'sandbox',
      targetStandard: 'cat6a',
      draftFields: initialDraft(STAGES[0]),
    }
  }, [])

  const [currentStage, setCurrentStage] = useState(initial.currentStage)
  const [recipe, setRecipe] = useState(initial.recipe)
  const [appliedStages, setAppliedStages] = useState(initial.appliedStages)
  const [mode, setMode] = useState(initial.mode)
  const [targetStandard, setTargetStandard] = useState(initial.targetStandard)
  const [draftFields, setDraftFields] = useState(initial.draftFields)

  // Persist state on change
  useEffect(() => {
    saveState({ currentStage, recipe, appliedStages, mode, targetStandard, draftFields })
  }, [currentStage, recipe, appliedStages, mode, targetStandard, draftFields])

  // When the current stage changes, reset the draft from existing recipe values
  // (so navigating Back keeps the previously committed values pre-filled).
  const stage = STAGES[currentStage] || STAGES[STAGES.length - 1]
  useEffect(() => {
    const existing = getStageRecipe(recipe, stage.id)
    const draft = {}
    for (const f of stage.fields) {
      draft[f.name] = existing[f.name] !== undefined ? existing[f.name] : f.default
    }
    setDraftFields(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage])

  // ── Pipeline: compute live specs from current recipe ──
  const sim = useMemo(() => {
    try {
      return runPipeline(recipe)
    } catch {
      return null
    }
  }, [recipe])

  const std = STANDARDS[targetStandard] || STANDARDS.cat6a

  // ── Actions ──
  const apply = () => {
    setRecipe((r) => ({ ...r, [stage.id]: { ...(r[stage.id] || {}), ...draftFields } }))
    setAppliedStages((s) => new Set([...s, stage.id]))
    if (currentStage < STAGES.length - 1) setCurrentStage(currentStage + 1)
  }

  const skip = () => {
    if (!stage.optional) return
    setRecipe((r) => ({ ...r, [stage.id]: { ...(r[stage.id] || {}), ...(stage.skipDefault || {}) } }))
    setAppliedStages((s) => new Set([...s, stage.id]))
    if (currentStage < STAGES.length - 1) setCurrentStage(currentStage + 1)
  }

  const back = () => {
    if (currentStage <= 0) return
    setCurrentStage(currentStage - 1)
    setAppliedStages((s) => {
      const next = new Set(s)
      next.delete(STAGES[currentStage - 1].id)
      return next
    })
  }

  const reset = () => {
    if (!window.confirm('Reset the build and start over?')) return
    setRecipe(defaultRecipeFromStages())
    setAppliedStages(new Set())
    setCurrentStage(0)
    setDraftFields(initialDraft(STAGES[0]))
  }

  // ── Render ──
  const totalApplied = appliedStages.size
  const isFinal = currentStage >= STAGES.length - 1 && appliedStages.has(STAGES[STAGES.length - 1].id)

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes builderFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .builder-fade { animation: builderFadeUp 0.4s ease-out; }
        @keyframes builderRingGrow { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
      `}</style>

      {/* Header strip with mode toggle + reset */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: C.copper }}>
            ◆ Cable Builder · Stage {currentStage + 1} of {STAGES.length}
          </div>
          {/* Mode toggle */}
          <div className="flex items-center bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden">
            <button
              onClick={() => setMode('sandbox')}
              className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
              style={{
                background: mode === 'sandbox' ? C.teal + '20' : 'transparent',
                color: mode === 'sandbox' ? C.teal : C.textMuted,
                borderRight: '1px solid ' + C.border,
              }}
            >
              Sandbox
            </button>
            <button
              onClick={() => setMode('challenge')}
              className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
              style={{
                background: mode === 'challenge' ? C.copper + '25' : 'transparent',
                color: mode === 'challenge' ? C.copperBright : C.textMuted,
              }}
            >
              Challenge
            </button>
          </div>
          {mode === 'challenge' && (
            <select
              value={targetStandard}
              onChange={(e) => setTargetStandard(e.target.value)}
              className="bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1 text-[11px] font-mono"
              style={{ color: C.amber }}
            >
              {Object.entries(STANDARDS).map(([id, s]) => (
                <option key={id} value={id}>Target: {s.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={reset}
          className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1"
          style={{ borderColor: C.borderHi, color: C.textDim }}
        >
          <RotateCcw size={11} /> Reset build
        </button>
      </div>

      {/* Progress strip */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => {
            const applied = appliedStages.has(s.id)
            const active = i === currentStage
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => i <= currentStage && setCurrentStage(i)}
                disabled={i > currentStage}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider whitespace-nowrap disabled:opacity-40 transition-colors"
                style={{
                  background: active ? C.copper + '20' : applied ? '#0d1f1d' : 'transparent',
                  border: '1px solid ' + (active ? C.copper + '60' : applied ? C.teal + '40' : C.border),
                  color: active ? C.copperBright : applied ? C.teal : C.textMuted,
                }}
              >
                {applied ? <CheckCircle2 size={10} /> : <Icon size={10} />}
                <span className="hidden md:inline">{s.label}</span>
                <span className="md:hidden">{i + 1}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        {/* LEFT: 3D preview + live specs */}
        <div className="space-y-3">
          {/* 3D cable */}
          <div className="bg-[#0a0d0f] border border-[#252e33] rounded relative" style={{ minHeight: 360 }}>
            <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>
              ◆ {totalApplied === 0 ? 'Empty stage — apply Stage 1 to start' : `${totalApplied} layer${totalApplied === 1 ? '' : 's'} applied`}
            </div>
            <div className="absolute top-2 right-2 font-mono text-[10px]" style={{ color: C.textMuted }}>
              ϕ {sim?.jacket?.final_od_mm?.toFixed(2) || '—'} mm
            </div>
            <CableBuildSvg
              recipe={recipe}
              appliedStages={appliedStages}
            />
            {totalApplied === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center" style={{ color: C.textMuted }}>
                  <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
                  <div className="font-mono text-[11px] uppercase tracking-wider">Pick a copper wire to start</div>
                </div>
              </div>
            )}
          </div>

          {/* Live specs */}
          <SpecsPanel sim={sim} std={std} mode={mode} appliedStages={appliedStages} recipe={recipe} />
        </div>

        {/* RIGHT: stage card */}
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 builder-fade" key={stage.id}>
          {!isFinal ? (
            <StageCard
              stage={stage}
              draftFields={draftFields}
              setDraftFields={setDraftFields}
              onApply={apply}
              onSkip={skip}
              onBack={back}
              canBack={currentStage > 0}
            />
          ) : (
            <CompletionCard
              recipe={recipe}
              sim={sim}
              std={std}
              mode={mode}
              onReset={reset}
              onBack={back}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Stage card — renders the current stage's input controls
// ─────────────────────────────────────────────────────────
function StageCard({ stage, draftFields, setDraftFields, onApply, onSkip, onBack, canBack }) {
  const Icon = stage.icon
  const set = (name, v) => setDraftFields((d) => ({ ...d, [name]: v }))

  return (
    <div className="space-y-4">
      {/* Stage header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded flex items-center justify-center shrink-0"
          style={{ background: C.copper + '15', border: '1px solid ' + C.copper + '60' }}
        >
          <Icon size={20} style={{ color: C.copperBright }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copper }}>
            Stage · {stage.id} {stage.optional && <span className="text-[#6b7479]">(optional)</span>}
          </div>
          <h2 className="text-xl font-light mt-0.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: C.text }}>
            {stage.label}
          </h2>
          <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: C.textDim }}>{stage.blurb}</p>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {stage.fields.map((f) => (
          <FieldRow key={f.name} field={f} value={draftFields[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
        <button
          onClick={onBack}
          disabled={!canBack}
          className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1 disabled:opacity-40"
          style={{ borderColor: C.borderHi, color: C.textDim }}
        >
          <ChevronLeft size={11} /> Back
        </button>
        {stage.optional && (
          <button
            onClick={onSkip}
            className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1"
            style={{ borderColor: C.amber + '60', color: C.amber }}
          >
            <SkipForward size={11} /> Skip
          </button>
        )}
        <button
          onClick={onApply}
          className="ml-auto px-4 py-2 text-[11px] font-mono uppercase tracking-wider rounded flex items-center gap-1.5"
          style={{ background: C.copper, color: '#0a0d0f', fontWeight: 600 }}
        >
          Apply <ChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}

// One field of the stage card
function FieldRow({ field, value, onChange }) {
  // Defend against the brief render where value is undefined (between stage
  // change and the useEffect that resets draftFields). Falling back to the
  // field's default keeps inputs controlled.
  const v = value !== undefined ? value : field.default
  if (field.type === 'cards') {
    return (
      <div>
        <Label text={field.label} hint={field.help} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mt-1.5">
          {field.options.map((o) => {
            const sel = String(v) === String(o.value)
            return (
              <button
                key={o.value}
                onClick={() => onChange(o.value)}
                className="text-left px-2 py-1.5 rounded border transition-colors"
                style={{
                  background: sel ? C.copper + '20' : '#0a0d0f',
                  borderColor: sel ? C.copper + '80' : C.border,
                  color: sel ? C.copperBright : C.textDim,
                }}
              >
                <div className="font-mono text-[11px] font-medium">{o.label}</div>
                {o.desc && <div className="text-[10px] mt-0.5" style={{ color: sel ? C.text : C.textMuted }}>{o.desc}</div>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (field.type === 'slider') {
    return (
      <div>
        <Label text={field.label} hint={field.help} />
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={v}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1"
            style={{ accentColor: C.copper }}
          />
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={v}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-16 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-1 text-[11px] font-mono text-right"
            style={{ color: C.amber }}
          />
          {field.unit && <span className="font-mono text-[10px] w-10" style={{ color: C.textMuted }}>{field.unit}</span>}
        </div>
      </div>
    )
  }
  if (field.type === 'toggle') {
    return (
      <div className="flex items-center justify-between">
        <Label text={field.label} hint={field.help} />
        <button
          onClick={() => onChange(!v)}
          className="px-3 py-1 rounded font-mono text-[10px] uppercase tracking-wider border"
          style={{
            background: v ? C.teal + '15' : 'transparent',
            borderColor: v ? C.teal + '60' : C.borderHi,
            color: v ? C.teal : C.textDim,
          }}
        >
          {v ? 'On' : 'Off'}
        </button>
      </div>
    )
  }
  return null
}
function Label({ text, hint }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.textDim }}>{text}</div>
      {hint && <div className="text-[10px] mt-0.5 italic" style={{ color: C.textMuted }}>{hint}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Live specs panel — Z₀ / IL / NEXT / skew / cost / coverage
// ─────────────────────────────────────────────────────────
function SpecsPanel({ sim, std, mode, appliedStages, recipe }) {
  if (!sim || appliedStages.size === 0) {
    return (
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 text-center text-[11px]" style={{ color: C.textMuted }}>
        Live specs appear after the first stage is applied.
      </div>
    )
  }

  const j = sim.jacket || {}
  const il100 = computeIL(j, std?.freq_il_mhz || 500, 100)

  const tiles = [
    {
      label: `Z₀ ${std.z0_diff} ±${std.z0_tol} Ω`,
      value: j.z_diff,
      fmt: (v) => `${v?.toFixed(1)} Ω`,
      verdict: mode === 'challenge' ? verdictColor(j.z_diff, std.z0_diff - std.z0_tol, std.z0_diff + std.z0_tol) : C.text,
      ready: appliedStages.has('insulation'),
    },
    {
      label: `IL ≤ ${std.max_il_db_per_100m} dB/100m`,
      value: il100,
      fmt: (v) => `${v?.toFixed(1)} dB`,
      verdict: mode === 'challenge' ? verdictColor(il100, null, std.max_il_db_per_100m) : C.text,
      ready: appliedStages.has('insulation'),
    },
    {
      label: std.min_next_db > 0 ? `NEXT ≥ ${std.min_next_db} dB` : 'NEXT',
      value: j.next_db_estimate,
      fmt: (v) => `${v?.toFixed(1)} dB`,
      verdict: std.min_next_db > 0 && mode === 'challenge' ? verdictColor(j.next_db_estimate, std.min_next_db, null) : C.text,
      ready: appliedStages.has('bundle'),
    },
    {
      label: std.max_skew_ps_per_m > 0 ? `Skew ≤ ${std.max_skew_ps_per_m} ps/m` : 'Skew',
      value: j.pair_skew_ps_per_m,
      fmt: (v) => `${v?.toFixed(1)} ps/m`,
      verdict: std.max_skew_ps_per_m > 0 && mode === 'challenge' ? verdictColor(j.pair_skew_ps_per_m, null, std.max_skew_ps_per_m) : C.text,
      ready: appliedStages.has('pair'),
    },
    {
      label: 'Mass',
      value: j.mass_g_per_m,
      fmt: (v) => `${v?.toFixed(0)} g/m`,
      verdict: C.text,
      ready: appliedStages.has('jacket'),
    },
    {
      label: 'Cost / m',
      value: j.cost_per_m,
      fmt: (v) => `$${v?.toFixed(2)}`,
      verdict: C.copperBright,
      ready: appliedStages.has('jacket'),
    },
  ]

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.teal }}>
        Live specs · {mode === 'challenge' ? `vs ${std.name}` : 'sandbox readouts'}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {tiles.map((t, i) => (
          <div key={i} className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: C.textMuted }}>{t.label}</div>
            <div className="font-mono text-[14px] mt-0.5" style={{ color: t.ready ? t.verdict : C.textMuted }}>
              {t.ready && t.value != null ? t.fmt(t.value) : 'pending…'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Completion card — shown after the jacket stage is applied
// ─────────────────────────────────────────────────────────
function CompletionCard({ recipe, sim, std, mode, onReset, onBack }) {
  const j = sim?.jacket || {}
  const il100 = sim ? computeIL(j, std.freq_il_mhz, 100) : null

  const checks = []
  if (j.z_diff != null) {
    const off = Math.abs(j.z_diff - std.z0_diff)
    checks.push({ label: `Z₀ ${std.z0_diff} ±${std.z0_tol} Ω`, ok: off <= std.z0_tol, value: `${j.z_diff.toFixed(1)} Ω` })
  }
  if (il100 != null) {
    checks.push({ label: `IL ≤ ${std.max_il_db_per_100m} dB/100m`, ok: il100 <= std.max_il_db_per_100m, value: `${il100.toFixed(1)} dB` })
  }
  if (std.min_next_db > 0 && j.next_db_estimate != null) {
    checks.push({ label: `NEXT ≥ ${std.min_next_db} dB`, ok: j.next_db_estimate >= std.min_next_db, value: `${j.next_db_estimate.toFixed(1)} dB` })
  }
  if (std.max_skew_ps_per_m > 0 && j.pair_skew_ps_per_m != null) {
    checks.push({ label: `Skew ≤ ${std.max_skew_ps_per_m} ps/m`, ok: j.pair_skew_ps_per_m <= std.max_skew_ps_per_m, value: `${j.pair_skew_ps_per_m.toFixed(1)} ps/m` })
  }
  const allPass = checks.length > 0 && checks.every((c) => c.ok)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ background: (allPass ? C.teal : C.copper) + '15', border: '1px solid ' + (allPass ? C.teal : C.copper) + '60' }}>
          <CheckCircle2 size={20} style={{ color: allPass ? C.teal : C.copperBright }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: allPass ? C.teal : C.copper }}>
            ◆ Build complete
          </div>
          <h2 className="text-xl font-light mt-0.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: C.text }}>
            {allPass ? 'All checks pass' : 'Build done — review specs'}
          </h2>
          <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: C.textDim }}>
            Final OD ϕ {j.final_od_mm?.toFixed(2)} mm · mass {j.mass_g_per_m?.toFixed(0)} g/m · cost ${j.cost_per_m?.toFixed(2)}/m
          </p>
        </div>
      </div>

      {mode === 'challenge' && checks.length > 0 && (
        <ul className="space-y-1 text-[12px]">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: C.teal }} /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.red }} />}
              <span style={{ color: C.textDim }}>{c.label}: <span style={{ color: c.ok ? C.teal : C.red }}>{c.value}</span></span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
        <button
          onClick={onBack}
          className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1"
          style={{ borderColor: C.borderHi, color: C.textDim }}
        >
          <ChevronLeft size={11} /> Tweak last stage
        </button>
        <button
          onClick={onReset}
          className="ml-auto px-4 py-2 text-[10px] font-mono uppercase tracking-wider rounded flex items-center gap-1.5 border"
          style={{ borderColor: C.copper, color: C.copperBright }}
        >
          <RotateCcw size={11} /> New build
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Structural visualisation: TWO panels.
//
//   1. Cross-section (left)  — shows the actual conductor arrangement:
//                              1 wire → 2 wires → 4 pairs around X-spline.
//                              Auto-rotates so it feels 3D.
//
//   2. Side / helix view (right) — shows the cable lying horizontally.
//                                  Each conductor draws its sine-wave
//                                  helical path along the length so the
//                                  engineer SEES the twist visibly.
//
// Both panels animate together — `phase` advances every frame for the
// helices; `spin` rotates the cross-section.
// ─────────────────────────────────────────────────────────

// Determine the structural "tier" from applied stages
function structureTier(appliedStages) {
  if (!appliedStages || appliedStages.size === 0) return 'empty'
  if (appliedStages.has('bundle')) return 'bundle'
  if (appliedStages.has('pair_foil')) return 'pair_foil'
  if (appliedStages.has('pair_wrap')) return 'pair_wrap'
  if (appliedStages.has('pair')) return 'pair'
  if (appliedStages.has('insulation')) return 'insulated'
  return 'conductor'
}

// Conductor positions inside the cross-section, depending on tier.
// Returns an array of { x, y, conductorR, insulationR, color, insColor, groupIdx }
function conductorsFor(tier, recipe) {
  const condColor = '#c97b3f'
  const insColor = '#fbbf24'
  const condR = 6
  const insR = condR + 6
  if (tier === 'empty') return []
  if (tier === 'conductor' || tier === 'insulated') {
    return [{ x: 0, y: 0, conductorR: condR, insulationR: tier === 'insulated' ? insR : condR + 2, insColor: tier === 'insulated' ? insColor : '#0a0d0f', condColor, groupIdx: 0 }]
  }
  if (tier === 'pair' || tier === 'pair_wrap' || tier === 'pair_foil') {
    // 2 insulated wires touching at center
    return [
      { x: -insR, y: 0, conductorR: condR, insulationR: insR, condColor, insColor: '#fbbf24', groupIdx: 0 },
      { x:  insR, y: 0, conductorR: condR, insulationR: insR, condColor, insColor: '#7dd3fc', groupIdx: 0 },
    ]
  }
  if (tier === 'bundle') {
    const pairCount = recipe?.bundle?.pair_count || 4
    if (pairCount === 1) {
      return [{ x: 0, y: 0, conductorR: condR, insulationR: insR, condColor, insColor, groupIdx: 0 }]
    }
    if (pairCount === 2) {
      // 2 pairs side-by-side
      const out = []
      const yOff = 0
      const xOff = insR + 2
      out.push({ x: -2*insR - xOff, y: yOff, conductorR: condR, insulationR: insR, condColor, insColor: '#fbbf24', groupIdx: 0 })
      out.push({ x: -xOff,           y: yOff, conductorR: condR, insulationR: insR, condColor, insColor: '#7dd3fc', groupIdx: 0 })
      out.push({ x:  xOff,           y: yOff, conductorR: condR, insulationR: insR, condColor, insColor: '#fbbf24', groupIdx: 1 })
      out.push({ x:  2*insR + xOff,  y: yOff, conductorR: condR, insulationR: insR, condColor, insColor: '#a78bfa', groupIdx: 1 })
      return out
    }
    // 4 pairs in quadrants — each pair has 2 conductors arranged tangentially
    const RR = insR * 1.6  // distance from center to pair center
    const pairCenters = [
      { cx: 0,  cy: -RR, ang: 0   },     // top
      { cx: RR, cy: 0,   ang: 90  },     // right
      { cx: 0,  cy: RR,  ang: 180 },     // bottom
      { cx: -RR, cy: 0,  ang: 270 },     // left
    ]
    const pairColors = [
      ['#fbbf24', '#7dd3fc'],   // orange / blue
      ['#fb923c', '#fbbf24'],   // orange / orange (different shade)
      ['#a78bfa', '#7dd3fc'],   // purple / blue
      ['#5eead4', '#fbbf24'],   // teal / yellow (mock Cat 6A pair colors)
    ]
    const out = []
    pairCenters.forEach((pc, i) => {
      // 2 conductors of the pair, tangent to the bundle circumference
      // (perpendicular to the radial direction). Tangent direction at
      // angle ang (CW from "top"): (cos ang, sin ang).
      const tx = Math.cos((pc.ang * Math.PI) / 180) * insR
      const ty = Math.sin((pc.ang * Math.PI) / 180) * insR
      out.push({
        x: pc.cx + tx, y: pc.cy + ty,
        conductorR: condR, insulationR: insR, condColor,
        insColor: pairColors[i][0], groupIdx: i,
      })
      out.push({
        x: pc.cx - tx, y: pc.cy - ty,
        conductorR: condR, insulationR: insR, condColor,
        insColor: pairColors[i][1], groupIdx: i,
      })
    })
    return out
  }
  return []
}

// Outer ring layers (from inside out) for the cross-section panel
function outerLayersFor(appliedStages, recipe) {
  const tier = structureTier(appliedStages)
  // Compute the inner-most "core radius" of the structure (so outer
  // layers stack outside that)
  let coreR
  if (tier === 'bundle') {
    coreR = recipe?.bundle?.pair_count >= 4 ? 36 : 28
  } else if (tier === 'pair_foil' || tier === 'pair_wrap' || tier === 'pair') {
    coreR = 18
  } else if (tier === 'insulated') {
    coreR = 14
  } else {
    coreR = 8
  }
  const layers = []
  // Pair wrap (only inside pair, before foil — drawn in pair tier already)
  // For bundle tier we don't render pair wrap as a separate ring (it's per-pair, baked in)
  if (tier === 'pair_wrap' || tier === 'pair_foil') {
    const wrap = WRAP_MATERIALS[recipe?.pair_wrap?.material] || WRAP_MATERIALS.ptfe_tape
    if (recipe?.pair_wrap?.material && recipe.pair_wrap.material !== 'none') {
      layers.push({ kind: 'striped', color: '#a78bfa', label: wrap.name, thick: 4, isPairLevel: true })
      coreR += 4
    }
  }
  if (tier === 'pair_foil') {
    layers.push({ kind: 'foil', color: '#a7b0b6', label: 'Per-pair foil', thick: 5, isPairLevel: true })
    coreR += 5
  }
  if (tier === 'bundle') {
    if (appliedStages.has('outer_foil') && recipe?.outer_foil?.foil) {
      layers.push({ kind: 'foil', color: '#cbd5e1', label: 'Outer foil', thick: 6 })
      coreR += 6
    }
    if (appliedStages.has('shield') && recipe?.shield?.braid_enabled) {
      layers.push({ kind: 'braid', color: '#c97b3f', label: 'Outer braid', thick: 10 })
      coreR += 10
    }
    if (appliedStages.has('jacket')) {
      layers.push({ kind: 'jacket', color: '#1a2226', label: (JACKETS[recipe?.jacket?.material] || JACKETS.lszh).name, thick: 14 })
      coreR += 14
    }
  }
  return { layers, finalR: coreR + 4 }
}

// ─────────────────────────────────────────────────────────
// Main split-view renderer
// ─────────────────────────────────────────────────────────
function CableBuildSvg({ recipe, appliedStages }) {
  const [phase, setPhase] = useState(0)  // helical animation phase 0..1
  const [spin, setSpin] = useState(0)     // cross-section rotation, deg
  useEffect(() => {
    let raf, last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setPhase((p) => (p + dt * 0.3) % 1)
      setSpin((s) => (s + dt * 14) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="absolute inset-0 grid lg:grid-cols-[260px_1fr] gap-2 p-2">
      {/* Cross-section square */}
      <div className="bg-[#0a0d0f] border border-[#252e33] rounded relative overflow-hidden">
        <div className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#5eead4] z-10">
          ◆ Cross-section
        </div>
        <CrossSectionSvg recipe={recipe} appliedStages={appliedStages} spin={spin} />
      </div>
      {/* Helical side view */}
      <div className="bg-[#0a0d0f] border border-[#252e33] rounded relative overflow-hidden">
        <div className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#fbbf24] z-10">
          ◆ Side view · twist visible
        </div>
        <HelixSideSvg recipe={recipe} appliedStages={appliedStages} phase={phase} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Cross-section SVG: shows the actual conductor arrangement.
// ─────────────────────────────────────────────────────────
function CrossSectionSvg({ recipe, appliedStages, spin }) {
  const tier = structureTier(appliedStages)
  const conductors = useMemo(() => conductorsFor(tier, recipe), [tier, recipe])
  const { layers, finalR } = useMemo(() => outerLayersFor(appliedStages, recipe), [appliedStages, recipe])

  const VW = 240
  const VH = 240
  // Radii of outer ring stack
  let runningR = (() => {
    // Compute the inner radius where outer layers start
    if (tier === 'bundle') return recipe?.bundle?.pair_count >= 4 ? 36 : 28
    if (tier === 'pair_foil' || tier === 'pair_wrap' || tier === 'pair') return 18
    if (tier === 'insulated') return 14
    return 8
  })()

  return (
    <svg viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} className="absolute inset-0 w-full h-full">
      <defs>
        <pattern id="xs-braid" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.5)" strokeWidth="1.6" />
          <line x1="3" y1="0" x2="3" y2="6" stroke="rgba(255,255,255,0.22)" strokeWidth="1.1" />
        </pattern>
        <pattern id="xs-foil" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(0,0,0,0.3)" strokeWidth="0.7" />
        </pattern>
        <pattern id="xs-striped" width="8" height="8" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="8" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="1.6" />
          <line x1="0" y1="4" x2="8" y2="4" stroke="rgba(255,255,255,0.1)" strokeWidth="0.7" />
        </pattern>
        <radialGradient id="xs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c97b3f" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0a0d0f" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle background glow */}
      <rect x={-VW / 2} y={-VH / 2} width={VW} height={VH} fill="url(#xs-glow)" />

      {/* Rotate the entire structure for the auto-spin "3D" feel */}
      <g transform={`rotate(${spin})`}>
        {tier === 'empty' && (
          <text x="0" y="0" fontSize="10" fill="#6b7479" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
            empty
          </text>
        )}

        {/* Bundle's X-spline filler (rendered behind conductors) */}
        {tier === 'bundle' && (recipe?.bundle?.pair_count >= 2) && (recipe?.bundle?.filler === 'x_spline' || recipe?.bundle?.filler == null) && (
          <g>
            <rect x={-2} y={-(recipe?.bundle?.pair_count >= 4 ? 36 : 28)} width="4" height={(recipe?.bundle?.pair_count >= 4 ? 72 : 56)} fill="#5eead4" opacity="0.35" />
            {recipe?.bundle?.pair_count >= 4 && (
              <rect x={-(recipe?.bundle?.pair_count >= 4 ? 36 : 28)} y={-2} width={(recipe?.bundle?.pair_count >= 4 ? 72 : 56)} height="4" fill="#5eead4" opacity="0.35" />
            )}
          </g>
        )}

        {/* Conductors */}
        {conductors.map((c, i) => (
          <g key={i}>
            {/* Insulation ring */}
            <circle cx={c.x} cy={c.y} r={c.insulationR} fill={c.insColor} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
            {/* Copper core */}
            <circle cx={c.x} cy={c.y} r={c.conductorR} fill={c.condColor} stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" />
            {/* Highlight on copper */}
            <circle cx={c.x - c.conductorR * 0.3} cy={c.y - c.conductorR * 0.3} r={c.conductorR * 0.3} fill="#fbbf24" opacity="0.6" />
          </g>
        ))}

        {/* Pair-level wrap / foil for tier='pair_wrap' or 'pair_foil' — drawn around the 2 wires */}
        {(tier === 'pair_wrap' || tier === 'pair_foil') && (
          <g>
            {/* Stadium-shaped pair-level wrap */}
            <rect
              x={-26} y={-13}
              width={52} height={26}
              rx={13} ry={13}
              fill="none"
              stroke={tier === 'pair_foil' ? '#a7b0b6' : '#a78bfa'}
              strokeWidth={tier === 'pair_foil' ? 5 : 3}
              strokeDasharray={tier === 'pair_foil' ? 'none' : '3 2'}
              opacity={tier === 'pair_foil' ? 0.85 : 0.7}
            />
            {tier === 'pair_foil' && (
              <circle cx={28} cy={0} r={2.5} fill="#fbbf24" stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
            )}
          </g>
        )}

        {/* Bundle: subtle pair-level outline (stadium) around each quadrant pair.
            Each pair spans ~4×insR tangentially × 2×insR radially. */}
        {tier === 'bundle' && recipe?.bundle?.pair_count >= 4 && (
          <g>
            {[0, 90, 180, 270].map((ang, i) => {
              const insR = 12
              const RR = insR * 1.6
              const cx = Math.sin((ang * Math.PI) / 180) * RR
              const cy = -Math.cos((ang * Math.PI) / 180) * RR
              return (
                <g key={i} transform={`translate(${cx} ${cy}) rotate(${ang})`}>
                  <rect
                    x={-2 * insR - 2} y={-insR - 2}
                    width={4 * insR + 4} height={2 * insR + 4}
                    rx={insR + 2} ry={insR + 2}
                    fill="none"
                    stroke="#6b7479"
                    strokeWidth="0.8"
                    strokeDasharray="2 2"
                    opacity="0.55"
                  />
                </g>
              )
            })}
          </g>
        )}

        {/* Outer ring stack (jacket / braid / outer foil etc.) — drawn as
            stroked annuli so the inner conductors stay visible. */}
        {layers.filter((l) => !l.isPairLevel).map((layer, i) => {
          const innerR = runningR
          runningR += layer.thick
          const midR = (innerR + runningR) / 2
          const stroke =
            layer.kind === 'braid' ? 'url(#xs-braid)' :
            layer.kind === 'foil' ? layer.color :
            layer.color
          return (
            <g key={i}>
              <circle cx={0} cy={0} r={midR} fill="none" stroke={stroke} strokeWidth={layer.thick} />
              {/* Subtle outline edge */}
              <circle cx={0} cy={0} r={runningR} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
              <circle cx={0} cy={0} r={innerR} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="0.4" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────
// Helical side view — shows the actual twist of pairs / bundle
// ─────────────────────────────────────────────────────────
function HelixSideSvg({ recipe, appliedStages, phase }) {
  const tier = structureTier(appliedStages)
  const VW = 600
  const VH = 240
  const centerY = 0
  const N = 100  // points per helix

  // Decide what threads to draw based on tier
  const threads = useMemo(() => {
    const list = []
    const condColor = '#c97b3f'
    const insColor1 = '#fbbf24'
    const insColor2 = '#7dd3fc'
    if (tier === 'empty') return []
    if (tier === 'conductor' || tier === 'insulated') {
      list.push({ baseY: 0, ampY: 0, phase: 0, color: tier === 'insulated' ? insColor1 : condColor, condColor, width: tier === 'insulated' ? 16 : 6 })
    }
    if (tier === 'pair' || tier === 'pair_wrap' || tier === 'pair_foil') {
      // 2 helices, opposite phase, lay 50 px (visual)
      list.push({ baseY: 0, ampY: 14, phase: 0,    color: insColor1, condColor, width: 14 })
      list.push({ baseY: 0, ampY: 14, phase: 0.5,  color: insColor2, condColor, width: 14 })
    }
    if (tier === 'bundle') {
      const pairCount = recipe?.bundle?.pair_count || 4
      const pairColors = [
        ['#fbbf24', '#7dd3fc'],
        ['#fb923c', '#fbbf24'],
        ['#a78bfa', '#7dd3fc'],
        ['#5eead4', '#fbbf24'],
      ]
      const bundleAmp = pairCount >= 4 ? 36 : 18
      // Each pair has its own internal twist + the bundle twist
      for (let p = 0; p < pairCount; p++) {
        const pairPhase = p / pairCount  // bundle phase
        const colors = pairColors[p % 4]
        list.push({
          baseY: 0,
          ampY: bundleAmp,
          phase: pairPhase,
          color: colors[0], condColor, width: 11,
          internalAmp: 8, internalPhase: 0,
        })
        list.push({
          baseY: 0,
          ampY: bundleAmp,
          phase: pairPhase,
          color: colors[1], condColor, width: 11,
          internalAmp: 8, internalPhase: 0.5,
        })
      }
    }
    return list
  }, [tier, recipe])

  const buildPath = (thread) => {
    // Helical sine curve from x=-(VW/2 - 20) to +(VW/2 - 20)
    const x0 = -VW / 2 + 30
    const x1 =  VW / 2 - 30
    const span = x1 - x0
    const cycles = 4 // 4 wavelengths visible
    const pts = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const x = x0 + t * span
      const helix = Math.sin((t * cycles + thread.phase + phase) * 2 * Math.PI) * thread.ampY
      const internal = thread.internalAmp != null ? Math.sin((t * cycles * 2 + thread.internalPhase + phase * 2) * 2 * Math.PI) * thread.internalAmp : 0
      const y = thread.baseY + helix + internal
      pts.push([x, y])
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  }

  return (
    <svg viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} className="absolute inset-0 w-full h-full">
      <defs>
        <linearGradient id="hx-fade-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a0d0f" stopOpacity="1" />
          <stop offset="8%" stopColor="#0a0d0f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hx-fade-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a0d0f" stopOpacity="0" />
          <stop offset="100%" stopColor="#0a0d0f" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* When outer layers exist, draw the outer cylinder envelope */}
      {(appliedStages.has('jacket') || appliedStages.has('shield') || appliedStages.has('outer_foil')) && (() => {
        const r = appliedStages.has('jacket') ? 80 : appliedStages.has('shield') ? 65 : 55
        const jColor = appliedStages.has('jacket') ? '#1a2226'
                     : appliedStages.has('shield') ? '#c97b3f'
                     : '#cbd5e1'
        const fillPattern = appliedStages.has('shield') && !appliedStages.has('jacket') ? 'url(#xs-braid-side)' : null
        return (
          <g>
            <defs>
              <pattern id="xs-braid-side" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.45)" strokeWidth="2" />
                <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" />
              </pattern>
            </defs>
            <rect x={-VW / 2 + 20} y={-r} width={VW - 40} height={r * 2} fill={fillPattern || jColor} stroke={mixHex(jColor, '#000', 0.3)} strokeWidth="0.6" />
            {fillPattern && (
              <rect x={-VW / 2 + 20} y={-r} width={VW - 40} height={r * 2} fill={jColor} opacity="0.35" />
            )}
            {/* End cap ellipses */}
            <ellipse cx={-VW / 2 + 20} cy={0} rx={6} ry={r} fill={mixHex(jColor, '#000', 0.4)} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
            <ellipse cx={ VW / 2 - 20} cy={0} rx={6} ry={r} fill={mixHex(jColor, '#fff', 0.15)} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
          </g>
        )
      })()}

      {/* Helical threads */}
      {threads.map((t, i) => (
        <g key={i}>
          {/* Insulation outer (thick semi-transparent stroke) */}
          <path d={buildPath(t)} stroke={t.color} strokeWidth={t.width} fill="none" strokeLinecap="round" opacity="0.85" />
          {/* Copper core (thin stroke inside) */}
          <path d={buildPath(t)} stroke={t.condColor} strokeWidth={Math.max(2, t.width * 0.35)} fill="none" strokeLinecap="round" opacity="0.95" />
        </g>
      ))}

      {/* Subtle fade-out at the ends */}
      <rect x={-VW / 2} y={-VH / 2} width={36} height={VH} fill="url(#hx-fade-l)" />
      <rect x={ VW / 2 - 36} y={-VH / 2} width={36} height={VH} fill="url(#hx-fade-r)" />

      {tier === 'empty' && (
        <text x="0" y="0" fontSize="11" fill="#6b7479" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
          waiting for first stage
        </text>
      )}
    </svg>
  )
}

function mixHex(a, b, t) {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const r = Math.round(pa.r * (1 - t) + pb.r * t)
  const g = Math.round(pa.g * (1 - t) + pb.g * t)
  const bl = Math.round(pa.b * (1 - t) + pb.b * t)
  return `rgb(${r}, ${g}, ${bl})`
}
function parseHex(s) {
  if (typeof s !== 'string') return { r: 200, g: 123, b: 63 }
  if (s.startsWith('rgb')) {
    const m = s.match(/\d+/g)
    return { r: +m[0], g: +m[1], b: +m[2] }
  }
  const h = s.replace('#', '')
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  }
}

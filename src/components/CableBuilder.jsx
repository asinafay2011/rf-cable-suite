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
// 3D-ish SVG renderer for the in-progress build
// Same isometric cutaway approach as Cable3D, kept focused / simpler.
// ─────────────────────────────────────────────────────────
function CableBuildSvg({ recipe, appliedStages }) {
  const [yaw, setYaw] = useState(0)
  // Auto-spin
  useEffect(() => {
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setYaw((y) => (y + dt * 14) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pitch = 0.45
  const layers = useMemo(() => buildLayersFromRecipe(recipe, appliedStages), [recipe, appliedStages])
  const baseR = 110
  const BL = 320
  const xFront = BL / 2
  const xBack = -BL / 2
  const ryFor = (r) => r * (1 - pitch * 0.65)
  const yawRad = (yaw * Math.PI) / 180
  const litX = Math.cos(yawRad) * 0.5 + 0.5

  const VW = 720
  const VH = 320

  if (layers.length === 0) {
    return (
      <svg viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} className="absolute inset-0 w-full h-full" />
    )
  }

  const outermost = layers[layers.length - 1]
  const rOut = baseR * outermost.to
  const ryOut = ryFor(rOut)
  const lighter = mixHex(outermost.color, '#ffffff', 0.18)
  const darker = mixHex(outermost.color, '#000000', 0.45)
  const patternFill = patternForKind(outermost.kind, false, yaw)

  return (
    <svg viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} className="absolute inset-0 w-full h-full">
      <defs>
        <linearGradient id="cb-bodyGrad" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor={darker} />
          <stop offset={`${litX * 100}%`} stopColor={lighter} />
          <stop offset="100%" stopColor={darker} />
        </linearGradient>
        <pattern id="cb-braid" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) translate(${yaw * 0.4}, 0)`}>
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
        </pattern>
        <pattern id="cb-spline" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform={`rotate(30) translate(${yaw * 0.4}, 0)`}>
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          <line x1="5" y1="0" x2="5" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
        </pattern>
        <pattern id="cb-striped" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`translate(${yaw * 0.6}, 0)`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="2.4" />
          <line x1="0" y1="7" x2="14" y2="7" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        </pattern>
        <pattern id="cb-foil" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(15) translate(${yaw * 0.4}, 0)`}>
          <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(0,0,0,0.3)" strokeWidth="0.9" />
        </pattern>
        <pattern id="cb-braid-cap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${45 + yaw})`}>
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
        </pattern>
        <pattern id="cb-spline-cap" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform={`rotate(${30 + yaw * 0.5})`}>
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          <line x1="5" y1="0" x2="5" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
        </pattern>
        <pattern id="cb-striped-cap" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(${yaw * 0.6})`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="2.4" />
        </pattern>
        <pattern id="cb-foil-cap" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(${15 + yaw * 0.5})`}>
          <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(0,0,0,0.3)" strokeWidth="0.9" />
        </pattern>
      </defs>

      {/* Back cap */}
      <ellipse cx={xBack} cy={0} rx={rOut} ry={ryOut} fill={mixHex(outermost.color, '#000', 0.6)} stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />

      {/* Body */}
      <rect x={xBack} y={-ryOut} width={xFront - xBack} height={ryOut * 2} fill="url(#cb-bodyGrad)" stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" />
      {patternFill && <rect x={xBack} y={-ryOut} width={xFront - xBack} height={ryOut * 2} fill={patternFill} opacity="0.55" />}
      <line x1={xBack} y1={-ryOut} x2={xFront} y2={-ryOut} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
      <line x1={xBack} y1={ryOut} x2={xFront} y2={ryOut} stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />

      {/* Front cross-section: outermost first, then inner rings on top */}
      {layers.slice().reverse().map((l, i) => {
        const r = baseR * l.to
        const ry = ryFor(r)
        const lay_lighter = mixHex(l.color, '#ffffff', 0.22)
        const pattern = patternForKind(l.kind, true, yaw)
        const isCore = l.kind === 'core'
        return (
          <g key={i}>
            <ellipse cx={xFront} cy={0} rx={r} ry={ry} fill={lay_lighter} stroke="rgba(0,0,0,0.55)" strokeWidth={isCore ? 0.6 : 0.5} />
            {pattern && <ellipse cx={xFront} cy={0} rx={r} ry={ry} fill={pattern} opacity="0.5" pointerEvents="none" />}
            {isCore && (
              <ellipse cx={xFront - r * 0.35} cy={-ry * 0.35} rx={r * 0.18} ry={Math.max(2, ry * 0.22)} fill="#fbbf24" opacity="0.65" />
            )}
          </g>
        )
      })}

      {/* Outermost layer label below */}
      <text
        x={(xBack + xFront) / 2}
        y={ryOut + 18}
        fontSize="11"
        fill={outermost.textColor || outermost.color}
        fontFamily="JetBrains Mono, monospace"
        textAnchor="middle"
        opacity="0.8"
      >
        {outermost.name}
      </text>
    </svg>
  )
}

function patternForKind(kind, isCap, yaw) {
  // yaw arg is included so the caller can change it; we only need it inline
  // for pattern rotation declared in <defs>.
  const suf = isCap ? '-cap' : ''
  if (kind === 'braid') return `url(#cb-braid${suf})`
  if (kind === 'spline') return `url(#cb-spline${suf})`
  if (kind === 'striped') return `url(#cb-striped${suf})`
  if (kind === 'foil') return `url(#cb-foil${suf})`
  return null
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

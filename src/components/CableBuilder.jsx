import React, { useState, useMemo, useEffect } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  History,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  SkipForward,
  Sparkles,
  Wand2,
} from 'lucide-react'
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
  MATERIALS,
  RECIPE_TEMPLATES,
  runPipeline,
  computeIL,
  autoFix,
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
const BASELINE_KEY = 'cablelab.builder-baseline'

const STAGE_LABELS = {
  conductor: 'Conductor',
  stranding: 'Stranding',
  insulation: 'Insulation',
  pair: 'Twisted pair',
  pair_wrap: 'Pair wrap',
  pair_foil: 'Per-pair foil',
  bundle: 'Bundle',
  outer_foil: 'Outer foil',
  shield: 'Outer shield',
  jacket: 'Jacket',
}

const STAGE_FLOW = ['conductor', 'stranding', 'insulation', 'pair', 'pair_wrap', 'pair_foil', 'bundle', 'outer_foil', 'shield', 'jacket']

const BUILDER_BLENDER_ASSETS = {
  video: '/videos/highspeed-cable-bundle-build.mp4',
  poster: '/cable-renders/highspeed-cable-bundle-build-preview.png',
  glb: '/models/highspeed-cable-bundle-build.glb',
}

const BUILDER_STAGE_VISUALS = {
  empty: {
    label: 'Ready to build',
    image: '/cable-renders/highspeed-cable-bundle-build-preview.png',
    cue: 'Start at conductor, then build each cable layer in order.',
    step: '00',
  },
  conductor: {
    label: 'Conductor',
    image: '/cable-renders/process-stage-01-conductor.png',
    cue: 'Copper or plated copper is the signal carrier before any polymer is added.',
    step: '01',
  },
  stranding: {
    label: 'Stranding',
    image: '/cable-renders/process-stage-02-stranding.png',
    cue: 'Optional bunching improves flex before the dielectric extrusion step.',
    step: '02',
  },
  insulation: {
    label: 'Insulation',
    image: '/cable-renders/process-stage-03-insulation.png',
    cue: 'Dielectric wall and material set impedance, capacitance, and velocity.',
    step: '03',
  },
  pair: {
    label: '2-wire twist',
    image: '/cable-renders/process-stage-04-pair-twist.png',
    cue: 'Two insulated wires twist evenly; lay length drives skew and NEXT.',
    step: '04',
  },
  pair_wrap: {
    label: 'PTFE tape',
    image: '/cable-renders/process-stage-05-pair-wrap.png',
    cue: 'Binder tape locks pair geometry before foil is applied.',
    step: '05',
  },
  pair_foil: {
    label: 'Foil shield',
    image: '/cable-renders/process-stage-06-pair-foil.png',
    cue: 'Per-pair foil adds local shielding and a drain path.',
    step: '06',
  },
  bundle: {
    label: '4-pair bundle',
    image: '/cable-renders/process-stage-07-bundle.png',
    cue: 'Blue, orange, green, and brown pairs gather around the spline.',
    step: '07',
  },
  outer_foil: {
    label: 'Outer foil',
    image: '/cable-renders/process-stage-08-outer-shield.png',
    cue: 'Bundle-level foil closes the high-frequency shield before braid.',
    step: '08',
  },
  shield: {
    label: 'Braid',
    image: '/cable-renders/process-stage-08-outer-shield.png',
    cue: 'The braid follows the non-round bundle and adds LF shielding.',
    step: '09',
  },
  jacket: {
    label: 'Jacket',
    image: '/cable-renders/process-stage-09-jacket.png',
    cue: 'The outer extrusion locks the shield stack and sets final OD.',
    step: '10',
  },
}

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

function loadBaseline() {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveBaseline(snapshot) {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(snapshot))
  } catch {}
}

function clearSavedBaseline() {
  try {
    localStorage.removeItem(BASELINE_KEY)
  } catch {}
}

function cloneRecipe(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function allStagesApplied() {
  return new Set(STAGES.map((s) => s.id))
}

function hydrateBuilderRecipe(input) {
  const base = defaultRecipeFromStages()
  const src = cloneRecipe(input)
  const next = {
    ...base,
    ...src,
    product: { ...base.product, ...(src.product || {}) },
    test: { ...base.test, ...(src.test || {}) },
  }

  for (const stage of STAGES) {
    next[stage.id] = { ...(base[stage.id] || {}), ...(src[stage.id] || {}) }
  }

  // Builder has a dedicated outer_foil stage; the process simulator expects
  // the same knobs inside shield. Keep both views synchronized.
  next.outer_foil = {
    ...base.outer_foil,
    ...(src.outer_foil || {}),
    foil: src.outer_foil?.foil ?? src.shield?.foil ?? base.outer_foil.foil,
    foil_overlap: src.outer_foil?.foil_overlap ?? src.shield?.foil_overlap ?? base.outer_foil.foil_overlap,
  }
  next.shield = {
    ...next.shield,
    foil: next.outer_foil.foil,
    foil_overlap: next.outer_foil.foil_overlap,
  }

  return next
}

function toPipelineRecipe(recipe) {
  const next = hydrateBuilderRecipe(recipe)
  return {
    ...next,
    shield: {
      ...next.shield,
      foil: next.outer_foil?.foil ?? next.shield?.foil ?? false,
      foil_overlap: next.outer_foil?.foil_overlap ?? next.shield?.foil_overlap ?? 0,
    },
  }
}

function fmtNum(value, digits = 1, suffix = '') {
  if (value == null || isNaN(value)) return '—'
  return `${Number(value).toFixed(digits)}${suffix}`
}

function buildChecks(sim, std) {
  if (!sim || !std) return []
  const j = sim.jacket || {}
  const checks = []
  if (j.z_diff != null) {
    const off = Math.abs(j.z_diff - std.z0_diff)
    checks.push({ label: `Z0 ${std.z0_diff} +/-${std.z0_tol} ohm`, ok: off <= std.z0_tol, value: `${j.z_diff.toFixed(1)} ohm` })
  }
  const il100 = computeIL(j, std.freq_il_mhz, 100)
  if (il100 != null) {
    checks.push({ label: `IL <= ${std.max_il_db_per_100m} dB/100m @ ${std.freq_il_mhz} MHz`, ok: il100 <= std.max_il_db_per_100m, value: `${il100.toFixed(1)} dB` })
  }
  if (std.min_next_db > 0 && j.next_db_estimate != null) {
    checks.push({ label: `NEXT >= ${std.min_next_db} dB`, ok: j.next_db_estimate >= std.min_next_db, value: `${j.next_db_estimate.toFixed(1)} dB` })
  }
  if (std.max_skew_ps_per_m > 0 && j.pair_skew_ps_per_m != null) {
    checks.push({ label: `Skew <= ${std.max_skew_ps_per_m} ps/m`, ok: j.pair_skew_ps_per_m <= std.max_skew_ps_per_m, value: `${j.pair_skew_ps_per_m.toFixed(1)} ps/m` })
  }
  return checks
}

function collectWarnings(sim) {
  if (!sim) return []
  return STAGE_FLOW.flatMap((stageId) => {
    const warn = sim[stageId]?.warn || []
    return warn.map((message) => ({ stageId, label: STAGE_LABELS[stageId] || stageId, message }))
  })
}

function metricsFromSim(sim, std, recipe) {
  const j = sim?.jacket || {}
  return {
    z0: j.z_diff,
    il100: sim ? computeIL(j, std?.freq_il_mhz || recipe?.test?.freq_mhz || 500, 100) : null,
    testIl: sim?.il_db,
    next: j.next_db_estimate,
    skew: j.pair_skew_ps_per_m,
    coverage: j.coverage_pct,
    od: j.final_od_mm,
    mass: j.mass_g_per_m,
    cost: j.cost_per_m,
  }
}

function buildReport({ recipe, sim, std, mode, appliedStages }) {
  const warnings = collectWarnings(sim)
  const checks = buildChecks(sim, std)
  return {
    generated_at: new Date().toISOString(),
    target: std?.name || recipe.product?.target || 'Custom',
    mode,
    applied_stages: Array.from(appliedStages || []),
    metrics: metricsFromSim(sim, std, recipe),
    checks,
    warnings,
    recipe: toPipelineRecipe(recipe),
  }
}

function reportToCsv(report) {
  const rows = [
    ['section', 'name', 'value', 'status'],
    ...Object.entries(report.metrics || {}).map(([name, value]) => ['metric', name, value ?? '', '']),
    ...(report.checks || []).map((check) => ['check', check.label, check.value, check.ok ? 'PASS' : 'REVIEW']),
    ...(report.warnings || []).map((warning) => ['warning', warning.label, warning.message, '']),
  ]
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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

function latestAppliedStageId(appliedStages) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (appliedStages.has(STAGES[i].id)) return STAGES[i].id
  }
  return null
}

function builderVisualFor(currentStage, appliedStages) {
  const currentId = STAGES[currentStage]?.id
  const latestId = latestAppliedStageId(appliedStages)
  const visualId = appliedStages.has(currentId) ? currentId : latestId || 'empty'
  return BUILDER_STAGE_VISUALS[visualId] || BUILDER_STAGE_VISUALS.empty
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
        recipe: hydrateBuilderRecipe(saved.recipe || defaultRecipeFromStages()),
        appliedStages: new Set(saved.appliedStages || []),
        mode: saved.mode || 'sandbox',
        targetStandard: saved.targetStandard || 'cat6a',
        draftFields: saved.draftFields || initialDraft(STAGES[0]),
      }
    }
    return {
      currentStage: 0,
      recipe: hydrateBuilderRecipe(defaultRecipeFromStages()),
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
  const [baseline, setBaseline] = useState(() => loadBaseline())
  const [notice, setNotice] = useState('')
  const [optimizing, setOptimizing] = useState(false)

  // Persist state on change
  useEffect(() => {
    saveState({ currentStage, recipe, appliedStages, mode, targetStandard, draftFields })
  }, [currentStage, recipe, appliedStages, mode, targetStandard, draftFields])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(t)
  }, [notice])

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
  const pipelineRecipe = useMemo(() => toPipelineRecipe(recipe), [recipe])
  const sim = useMemo(() => {
    try {
      return runPipeline(pipelineRecipe)
    } catch {
      return null
    }
  }, [pipelineRecipe])

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
    setRecipe(hydrateBuilderRecipe(defaultRecipeFromStages()))
    setAppliedStages(new Set())
    setCurrentStage(0)
    setDraftFields(initialDraft(STAGES[0]))
  }

  const loadRecipeIntoBuilder = (nextRecipe, message = 'Loaded build') => {
    const hydrated = hydrateBuilderRecipe(nextRecipe)
    setRecipe(hydrated)
    setTargetStandard(hydrated.product?.target || targetStandard)
    setAppliedStages(allStagesApplied())
    setCurrentStage(STAGES.length - 1)
    setDraftFields(hydrated[STAGES[STAGES.length - 1].id] || initialDraft(STAGES[STAGES.length - 1]))
    setNotice(message)
  }

  const loadTemplate = (id) => {
    const template = RECIPE_TEMPLATES[id]
    if (!template) return
    loadRecipeIntoBuilder(template.recipe, `Loaded preset: ${template.name}`)
  }

  const finishRemainingStages = () => {
    const next = hydrateBuilderRecipe({
      ...recipe,
      [stage.id]: { ...(recipe[stage.id] || {}), ...draftFields },
      product: { ...(recipe.product || {}), target: targetStandard },
    })
    loadRecipeIntoBuilder(next, 'Filled remaining stages with current defaults')
  }

  const runBuilderAutoFix = () => {
    setOptimizing(true)
    setTimeout(() => {
      try {
        const result = autoFix({
          ...pipelineRecipe,
          product: { ...(pipelineRecipe.product || {}), target: targetStandard },
        }, 50)
        loadRecipeIntoBuilder(result.recipe, result.converged ? `Auto-fix passed in ${result.iterations} steps` : `Auto-fix found best score ${result.score.toFixed(2)}`)
      } catch (err) {
        setNotice(`Auto-fix error: ${err.message || err}`)
      } finally {
        setOptimizing(false)
      }
    }, 20)
  }

  const pinBaseline = () => {
    if (!sim) return
    const snapshot = {
      label: `${std.name} baseline · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      recipe: pipelineRecipe,
      targetStandard,
    }
    setBaseline(snapshot)
    saveBaseline(snapshot)
    setNotice('Baseline pinned for comparison')
  }

  const removeBaseline = () => {
    setBaseline(null)
    clearSavedBaseline()
    setNotice('Baseline cleared')
  }

  const makeCurrentReport = () => buildReport({ recipe, sim, std, mode, appliedStages })

  const copyReport = async () => {
    const text = JSON.stringify(makeCurrentReport(), null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setNotice('JSON report copied')
    } catch {
      downloadText('cable-builder-report.json', text, 'application/json')
      setNotice('Clipboard blocked, downloaded JSON instead')
    }
  }

  const downloadCsv = () => {
    downloadText('cable-builder-report.csv', reportToCsv(makeCurrentReport()), 'text/csv')
    setNotice('CSV report downloaded')
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
                onClick={() => (i <= currentStage || applied) && setCurrentStage(i)}
                disabled={i > currentStage && !applied}
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

      <BuilderTools
        targetStandard={targetStandard}
        setTargetStandard={setTargetStandard}
        onLoadTemplate={loadTemplate}
        onFinish={finishRemainingStages}
        onAutoFix={runBuilderAutoFix}
        optimizing={optimizing}
        onPinBaseline={pinBaseline}
        onClearBaseline={removeBaseline}
        hasBaseline={!!baseline}
        onCopyReport={copyReport}
        onDownloadCsv={downloadCsv}
        notice={notice}
        checks={appliedStages.size > 0 ? buildChecks(sim, std) : []}
      />

      {/* Main two-column layout */}
      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        {/* LEFT: Blender preview + live specs */}
        <div className="space-y-3">
          <BuilderBlenderPreview
            currentStage={currentStage}
            appliedStages={appliedStages}
            sim={sim}
            totalApplied={totalApplied}
          />

          {/* Live specs */}
          <SpecsPanel sim={sim} std={std} mode={mode} appliedStages={appliedStages} recipe={recipe} setRecipe={setRecipe} />
          {appliedStages.size > 0 && (
            <>
              <DesignReviewPanel sim={sim} std={std} mode={mode} />
              <BomPanel sim={sim} />
              <ComparisonPanel baseline={baseline} current={{ recipe: pipelineRecipe, sim, std }} onClear={removeBaseline} />
            </>
          )}
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

function BuilderBlenderPreview({ currentStage, appliedStages, sim, totalApplied }) {
  const visual = builderVisualFor(currentStage, appliedStages)
  const latestId = latestAppliedStageId(appliedStages)
  const currentLabel = STAGES[currentStage]?.label || visual.label
  const isEmpty = totalApplied === 0
  const isFinal = appliedStages.has('jacket')
  const progressPct = Math.round((totalApplied / STAGES.length) * 100)

  return (
    <section
      data-testid="builder-blender-preview-panel"
      className="bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden"
    >
      <div className="relative">
        <div className="aspect-video min-h-[340px] bg-[#0a0d0f]">
          <img
            data-testid="builder-blender-preview"
            src={visual.image}
            alt={`${visual.label} Blender build preview`}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5 text-[#5eead4]">
          <Film size={12} /> Blender builder preview
        </div>
        <div className="absolute top-2 right-2 font-mono text-[10px] px-2 py-1 rounded border bg-[#0a0d0f]/85 border-[#252e33] text-[#a7b0b6]">
          {progressPct}% built
        </div>

        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center bg-[#0a0d0f]/75 border border-[#252e33] rounded px-4 py-3">
              <Sparkles size={24} className="mx-auto mb-2 opacity-60" style={{ color: C.copperBright }} />
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#a7b0b6]">Pick a copper wire to start</div>
            </div>
          </div>
        )}

        <div className="absolute bottom-2 left-2 right-2 grid sm:grid-cols-4 gap-2">
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Visual stage</div>
            <div className="font-mono text-[11px] text-[#f0ebe2]">{visual.step} · {visual.label}</div>
          </div>
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Builder focus</div>
            <div className="font-mono text-[11px] text-[#fbbf24]">{currentLabel}</div>
          </div>
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Latest layer</div>
            <div className="font-mono text-[11px] text-[#5eead4]">{latestId ? (STAGE_LABELS[latestId] || latestId) : 'none'}</div>
          </div>
          <div className="bg-[#0a0d0f]/85 border border-[#252e33] rounded p-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479]">Final OD</div>
            <div className="font-mono text-[11px] text-[#e89357]">{sim?.jacket?.final_od_mm?.toFixed(2) || '—'} mm</div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-[#252e33] flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-[#a7b0b6] leading-relaxed max-w-2xl">
          {visual.cue}
        </p>
        <div className="flex gap-2">
          <a
            href={BUILDER_BLENDER_ASSETS.video}
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent text-[#a7b0b6] hover:text-[#fbbf24]"
            style={{ borderColor: C.borderHi }}
          >
            <Download size={11} /> MP4
          </a>
          <a
            href={BUILDER_BLENDER_ASSETS.glb}
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent text-[#a7b0b6] hover:text-[#fbbf24]"
            style={{ borderColor: C.borderHi }}
          >
            <Download size={11} /> GLB
          </a>
          {isFinal && (
            <span className="inline-flex items-center justify-center px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border text-[#5eead4] border-[#2f7a6e]">
              Complete
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function BuilderTools({
  targetStandard,
  setTargetStandard,
  onLoadTemplate,
  onFinish,
  onAutoFix,
  optimizing,
  onPinBaseline,
  onClearBaseline,
  hasBaseline,
  onCopyReport,
  onDownloadCsv,
  notice,
  checks,
}) {
  const failing = checks.filter((c) => !c.ok).length
  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>
            Builder tools
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.textMuted }}>
            Presets, optimizer, reports, baseline compare, and fast finish controls.
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: failing ? C.amber : C.teal }}>
          {checks.length ? `${checks.length - failing}/${checks.length} checks passing` : 'No checks yet'}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Load preset</div>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onLoadTemplate(e.target.value)
              e.target.value = ''
            }}
            className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-2 text-[11px] font-mono focus:outline-none focus:border-[#c97b3f]"
            style={{ color: C.text }}
          >
            <option value="" disabled>Choose a full cable recipe...</option>
            {Object.entries(RECIPE_TEMPLATES).map(([id, t]) => (
              <option key={id} value={id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Target standard</div>
          <select
            value={targetStandard}
            onChange={(e) => setTargetStandard(e.target.value)}
            className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-2 text-[11px] font-mono focus:outline-none focus:border-[#c97b3f]"
            style={{ color: C.amber }}
          >
            {Object.entries(STANDARDS).map(([id, s]) => (
              <option key={id} value={id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap md:justify-end">
          <ToolButton onClick={onFinish} icon={<SkipForward size={12} />} label="Finish" />
          <ToolButton onClick={onAutoFix} disabled={optimizing} icon={optimizing ? <Activity size={12} className="animate-pulse" /> : <Wand2 size={12} />} label={optimizing ? 'Fixing' : 'Auto-fix'} accent />
          <ToolButton onClick={onPinBaseline} icon={<Save size={12} />} label="Pin" />
          {hasBaseline && <ToolButton onClick={onClearBaseline} icon={<History size={12} />} label="Clear" />}
          <ToolButton onClick={onCopyReport} icon={<Download size={12} />} label="JSON" />
          <ToolButton onClick={onDownloadCsv} icon={<Download size={12} />} label="CSV" />
        </div>
      </div>

      {notice && (
        <div className="mt-2 text-[11px] font-mono" style={{ color: C.copperBright }}>
          {notice}
        </div>
      )}
    </div>
  )
}

function ToolButton({ onClick, icon, label, disabled, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-2 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent flex items-center gap-1 disabled:opacity-40"
      style={{
        borderColor: accent ? C.copper + '80' : C.borderHi,
        color: accent ? C.copperBright : C.textDim,
      }}
    >
      {icon}
      {label}
    </button>
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
function SpecsPanel({ sim, std, mode, appliedStages, recipe, setRecipe }) {
  if (!sim || appliedStages.size === 0) {
    return (
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 text-center text-[11px]" style={{ color: C.textMuted }}>
        Live specs appear after the first stage is applied.
      </div>
    )
  }

  const j = sim.jacket || {}
  const il100 = computeIL(j, std?.freq_il_mhz || 500, 100)
  const testLength = recipe.test?.length_m ?? 100
  const testFreq = recipe.test?.freq_mhz ?? std?.freq_il_mhz ?? 500
  const updateTest = (field, value) => {
    setRecipe((r) => ({ ...r, test: { ...(r.test || {}), [field]: value } }))
  }

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
      label: `Link IL · ${testLength} m @ ${testFreq} MHz`,
      value: sim.il_db,
      fmt: (v) => `${v?.toFixed(2)} dB`,
      verdict: C.amber,
      ready: appliedStages.has('jacket'),
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
      label: 'Shield coverage',
      value: j.coverage_pct,
      fmt: (v) => `${v?.toFixed(0)}%`,
      verdict: j.coverage_pct >= 85 ? C.teal : j.coverage_pct >= 65 ? C.amber : C.red,
      ready: appliedStages.has('shield'),
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
      <div className="grid md:grid-cols-2 gap-2 mb-3">
        <TestInput
          label="Test length"
          value={testLength}
          min={0.1}
          max={500}
          step={0.1}
          unit="m"
          onChange={(v) => updateTest('length_m', v)}
        />
        <TestInput
          label="Test frequency"
          value={testFreq}
          min={1}
          max={40000}
          step={1}
          unit="MHz"
          onChange={(v) => updateTest('freq_mhz', v)}
        />
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

function TestInput({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="bg-[#0a0d0f] border border-[#252e33] rounded p-2 block">
      <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          className="w-full bg-transparent text-[13px] font-mono focus:outline-none"
          style={{ color: C.amber }}
        />
        <span className="font-mono text-[10px]" style={{ color: C.textMuted }}>{unit}</span>
      </div>
    </label>
  )
}

function DesignReviewPanel({ sim, std }) {
  if (!sim) return null
  const checks = buildChecks(sim, std)
  const warnings = collectWarnings(sim)
  const failing = checks.filter((c) => !c.ok)
  const topWarnings = warnings.slice(0, 4)

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>
          Manufacturing review
        </div>
        <div className="font-mono text-[10px]" style={{ color: failing.length ? C.amber : C.teal }}>
          {failing.length ? `${failing.length} spec item${failing.length === 1 ? '' : 's'} need tuning` : 'Spec checks look good'}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <div className="space-y-1.5">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              {check.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: C.teal }} /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.amber }} />}
              <span style={{ color: C.textDim }}>{check.label}: <span style={{ color: check.ok ? C.teal : C.amber }}>{check.value}</span></span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {topWarnings.length === 0 ? (
            <div className="text-[11px]" style={{ color: C.textMuted }}>No process warnings from the active recipe.</div>
          ) : (
            topWarnings.map((warning, i) => (
              <div key={i} className="text-[11px] leading-relaxed" style={{ color: C.textDim }}>
                <span className="font-mono uppercase" style={{ color: C.amber }}>{warning.label}</span> · {warning.message}
              </div>
            ))
          )}
          {warnings.length > topWarnings.length && (
            <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
              +{warnings.length - topWarnings.length} more warnings in later stages
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BomPanel({ sim }) {
  if (!sim) return null
  let previousMass = 0
  let previousCost = 0
  const rows = STAGE_FLOW
    .map((stageId) => {
      const data = sim[stageId]
      if (!data || data.mass_g_per_m == null || data.cost_per_m == null) return null
      const mass = Math.max(0, data.mass_g_per_m - previousMass)
      const cost = Math.max(0, data.cost_per_m - previousCost)
      previousMass = data.mass_g_per_m
      previousCost = data.cost_per_m
      return { stageId, label: STAGE_LABELS[stageId] || stageId, mass, cost, yieldPct: data.yield_pct }
    })
    .filter(Boolean)

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.teal }}>
        BOM / process cost
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="font-mono uppercase tracking-wider" style={{ color: C.textMuted }}>
              <th className="text-left font-normal py-1">Stage</th>
              <th className="text-right font-normal py-1">Mass</th>
              <th className="text-right font-normal py-1">Cost</th>
              <th className="text-right font-normal py-1">Yield</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stageId} className="border-t" style={{ borderColor: C.border }}>
                <td className="py-1.5" style={{ color: C.textDim }}>{row.label}</td>
                <td className="py-1.5 text-right font-mono" style={{ color: C.text }}>{fmtNum(row.mass, 1, ' g/m')}</td>
                <td className="py-1.5 text-right font-mono" style={{ color: C.copperBright }}>{fmtNum(row.cost, 3, ' $/m')}</td>
                <td className="py-1.5 text-right font-mono" style={{ color: row.yieldPct >= 96 ? C.teal : C.amber }}>{fmtNum(row.yieldPct, 1, '%')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ComparisonPanel({ baseline, current, onClear }) {
  if (!baseline || !current?.sim) return null

  let baseSim = null
  try {
    baseSim = runPipeline(toPipelineRecipe(baseline.recipe))
  } catch {
    baseSim = null
  }
  if (!baseSim) return null

  const baseStd = STANDARDS[baseline.targetStandard] || current.std
  const base = metricsFromSim(baseSim, baseStd, baseline.recipe)
  const now = metricsFromSim(current.sim, current.std, current.recipe)
  const rows = [
    { label: 'OD', key: 'od', digits: 2, unit: ' mm' },
    { label: 'Z0', key: 'z0', digits: 1, unit: ' ohm' },
    { label: 'IL / 100m', key: 'il100', digits: 1, unit: ' dB' },
    { label: 'Mass', key: 'mass', digits: 0, unit: ' g/m' },
    { label: 'Cost', key: 'cost', digits: 2, unit: ' $/m' },
  ]

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>
            Baseline compare
          </div>
          <div className="text-[10px] mt-1" style={{ color: C.textMuted }}>{baseline.label}</div>
        </div>
        <button
          onClick={onClear}
          className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
          style={{ borderColor: C.borderHi, color: C.textDim }}
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {rows.map((row) => {
          const delta = (now[row.key] ?? 0) - (base[row.key] ?? 0)
          const sign = delta > 0 ? '+' : ''
          return (
            <div key={row.key} className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
              <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: C.textMuted }}>{row.label}</div>
              <div className="font-mono text-[13px] mt-0.5" style={{ color: C.text }}>{fmtNum(now[row.key], row.digits, row.unit)}</div>
              <div className="font-mono text-[10px]" style={{ color: Math.abs(delta) < 0.001 ? C.textMuted : C.amber }}>
                {sign}{fmtNum(delta, row.digits, row.unit)}
              </div>
            </div>
          )
        })}
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

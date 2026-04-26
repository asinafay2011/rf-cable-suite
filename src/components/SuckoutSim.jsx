import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import { Plus, Trash2, Copy, Layers as LayersIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Tape Suckout Simulator (multi-layer)
// ─────────────────────────────────────────────────────────────
// Periodic structures on a coax — helical PTFE dielectric tape, helical
// foil shield wrap, or braided shield — produce Bragg-style reflection
// notches at f_n = n·c·VF / (2·P), where P is the AXIAL period.
//
// Real semi-rigid cables (UT-141, SF-141, phase-stable assemblies) stack
// 8-15 PTFE layers — sometimes mixing widths deliberately to spread the
// notch.  This sim lets you build the full stack and see the COMBINED
// S21 response, not just one layer at a time.
// ─────────────────────────────────────────────────────────────

const C = {
  amber: '#fbbf24',
  copper: '#c97b3f',
  copperBright: '#e89357',
  teal: '#5eead4',
  red: '#f87171',
  text: '#f0ebe2',
  textDim: '#a7b0b6',
  textMuted: '#6b7479',
  bg: '#0a0d0f',
  bgCard: '#12171a',
  border: '#252e33',
  borderHi: '#384249',
}

// Color palette for layer stripes (each layer gets a distinct hue)
const LAYER_COLORS = [
  '#c97b3f', // copper
  '#fbbf24', // amber
  '#5eead4', // teal
  '#a78bfa', // purple
  '#7dd3fc', // sky
  '#f87171', // red
  '#84cc16', // lime
  '#fb923c', // orange
  '#e879f9', // pink
  '#facc15', // yellow
  '#38bdf8', // light blue
  '#a3e635', // green
]
const colorFor = (i) => LAYER_COLORS[i % LAYER_COLORS.length]

// ─────────── Presets ───────────
const PRESETS = {
  single: {
    label: 'Single layer (sandbox)',
    stack: [{ kind: 'ptfe', width: 12, overlap: 25, count: 1 }],
  },
  ut141: {
    label: 'UT-141 style · 10× PTFE identical',
    stack: [{ kind: 'ptfe', width: 6.0, overlap: 50, count: 10 }],
  },
  ut141_staggered: {
    label: 'UT-141 staggered · 5 widths × 2 wraps',
    stack: [
      { kind: 'ptfe', width: 5.0, overlap: 50, count: 2 },
      { kind: 'ptfe', width: 6.0, overlap: 50, count: 2 },
      { kind: 'ptfe', width: 7.0, overlap: 50, count: 2 },
      { kind: 'ptfe', width: 8.0, overlap: 50, count: 2 },
      { kind: 'ptfe', width: 9.0, overlap: 50, count: 2 },
    ],
  },
  phase_stable: {
    label: 'Phase-stable · 8× alternating widths + foil',
    stack: [
      { kind: 'ptfe', width: 8.0, overlap: 50, count: 4 },
      { kind: 'ptfe', width: 6.0, overlap: 50, count: 4 },
      { kind: 'foil', width: 12.0, overlap: 25, count: 1 },
    ],
  },
  semirigid_full: {
    label: 'Mil-spec semi-rigid · 12× PTFE + foil + braid',
    stack: [
      { kind: 'ptfe', width: 7.0, overlap: 50, count: 6 },
      { kind: 'ptfe', width: 9.0, overlap: 50, count: 6 },
      { kind: 'foil', width: 10.0, overlap: 25, count: 1 },
      { kind: 'braid', carriers: 24, picksPerIn: 14, count: 1 },
    ],
  },
}

// ─────────── Helpers ───────────
function newLayer(kind = 'ptfe') {
  if (kind === 'braid') return { kind: 'braid', carriers: 24, picksPerIn: 14, count: 1 }
  return { kind, width: kind === 'foil' ? 10 : 12, overlap: 25, count: 1 }
}
function pitchOf(layer, cableOD) {
  if (layer.kind === 'braid') {
    return 25.4 / Math.max(2, layer.picksPerIn)
  }
  const o = Math.max(0, Math.min(0.95, layer.overlap / 100))
  const circ = Math.PI * Math.max(0.5, cableOD)
  const sinG = Math.min(0.95, layer.width / circ)
  const cosG = Math.sqrt(1 - sinG * sinG)
  return layer.width * (1 - o) * cosG
}
function helixAngleOf(layer, cableOD) {
  if (layer.kind === 'braid') {
    const P = pitchOf(layer, cableOD)
    return (Math.atan2(Math.PI * cableOD, (layer.carriers / 2) * P) * 180) / Math.PI
  }
  const circ = Math.PI * Math.max(0.5, cableOD)
  const sinG = Math.min(0.95, layer.width / circ)
  return 90 - (Math.asin(sinG) * 180) / Math.PI
}
function notchesOf(layer, cableOD, vf, maxFreq = 60000) {
  const P = pitchOf(layer, cableOD)
  if (P <= 0) return []
  const list = []
  for (let n = 1; n <= 5; n++) {
    const f = (150000 * vf * n) / P
    if (f > maxFreq) break
    list.push({ order: n, f_mhz: f })
  }
  return list
}
function layerLabel(kind) {
  return kind === 'ptfe' ? 'PTFE' : kind === 'foil' ? 'Foil' : 'Braid'
}

// ─────────── Component ───────────
export default function SuckoutSim({ accent = '#c97b3f' }) {
  const [stack, setStack] = useState(() => PRESETS.single.stack.map((l) => ({ ...l, id: nextId() })))
  const [cableOD, setCableOD] = useState(5.0)
  const [vf, setVf] = useState(0.70)
  const [bandLo, setBandLo] = useState(1000)
  const [bandHi, setBandHi] = useState(18000)
  const [notchDepth, setNotchDepth] = useState(8)
  const [insertionLossBase, setInsertionLossBase] = useState(0.5)
  // Display units for length values (mm or inch). Internal state stays in mm.
  const [units, setUnits] = useState(() => {
    try { return localStorage.getItem('suckout.units') || 'mm' } catch { return 'mm' }
  })
  const setUnitsAndPersist = (u) => {
    setUnits(u)
    try { localStorage.setItem('suckout.units', u) } catch {}
  }

  const addLayer = (kind) => setStack([...stack, { ...newLayer(kind), id: nextId() }])
  const removeLayer = (id) => setStack(stack.filter((l) => l.id !== id))
  const updateLayer = (id, patch) => setStack(stack.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const duplicateLayer = (id) => {
    const idx = stack.findIndex((l) => l.id === id)
    if (idx < 0) return
    const copy = { ...stack[idx], id: nextId() }
    setStack([...stack.slice(0, idx + 1), copy, ...stack.slice(idx + 1)])
  }
  const loadPreset = (key) => {
    const p = PRESETS[key]
    if (!p) return
    setStack(p.stack.map((l) => ({ ...l, id: nextId() })))
  }

  // Aggregate notches across the whole stack
  const allNotches = useMemo(() => {
    const list = []
    stack.forEach((layer, i) => {
      const ns = notchesOf(layer, cableOD, vf)
      ns.forEach((n) => {
        // Depth contribution scales with count (coherent stacking) and 1/order
        list.push({
          ...n,
          depth: (notchDepth * Math.max(1, layer.count)) / n.order,
          layerIdx: i,
          layerId: layer.id,
          layerKind: layer.kind,
        })
      })
    })
    list.sort((a, b) => a.f_mhz - b.f_mhz)
    return list
  }, [stack, cableOD, vf, notchDepth])

  // Total layer wrap count (sum of count fields), used in summary
  const totalWraps = stack.reduce((sum, l) => sum + Math.max(1, l.count), 0)
  const inBand = allNotches.filter((n) => n.f_mhz >= bandLo && n.f_mhz <= bandHi)
  const verdict =
    inBand.length === 0
      ? { state: 'CLEAR', color: C.teal, glyph: '✓', detail: 'No layer puts a notch inside the operating band.' }
      : inBand.length <= 2
      ? { state: 'WARNING', color: C.amber, glyph: '!', detail: `${inBand.length} notch${inBand.length === 1 ? '' : 'es'} inside band — review staggering.` }
      : { state: 'FAIL', color: C.red, glyph: '✗', detail: `${inBand.length} notches in band from ${new Set(inBand.map((n) => n.layerId)).size} layer(s) — re-engineer the stack.` }

  // Synthetic |S21| sweep
  const sweep = useMemo(() => {
    const arr = []
    const f0 = 100, f1 = 60000, N = 260
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const f = f0 * Math.pow(f1 / f0, t)
      const baseLoss = insertionLossBase * Math.sqrt(f / 1000)
      let notchSum = 0
      for (const nt of allNotches) {
        const sigma = nt.f_mhz * 0.025
        const dx = (f - nt.f_mhz) / sigma
        notchSum += nt.depth * Math.exp(-dx * dx)
      }
      arr.push({ f, s21: -(baseLoss + notchSum) })
    }
    return arr
  }, [allNotches, insertionLossBase])

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: accent }}>
              ◆ Tape Suckout Sim · multi-layer Bragg notch designer
            </div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight" style={{ fontFamily: 'Bricolage Grotesque' }}>
              Stack many tapes — see every Bragg notch at once
            </h1>
          </div>
          {/* Units toggle */}
          <div className="flex items-center bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden shrink-0">
            <button
              onClick={() => setUnitsAndPersist('mm')}
              className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
              style={{
                background: units === 'mm' ? accent + '20' : 'transparent',
                color: units === 'mm' ? accent : C.textMuted,
                borderRight: '1px solid ' + C.border,
              }}
            >
              mm
            </button>
            <button
              onClick={() => setUnitsAndPersist('inch')}
              className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
              style={{
                background: units === 'inch' ? accent + '20' : 'transparent',
                color: units === 'inch' ? accent : C.textMuted,
              }}
            >
              inch
            </button>
          </div>
        </div>
        <p className="text-[12px] md:text-[13px] leading-relaxed max-w-3xl" style={{ color: C.textDim }}>
          Real semi-rigid coax has 8-15 PTFE layers. Each one has its own pitch, so each contributes its own Bragg notch at <span className="font-mono" style={{ color: C.teal }}>f<sub>n</sub> = n·c·VF / (2·P)</span>.
          Identical layers stack the notch deeper at the same frequency. Mixing widths spreads the notches across frequency.
          Build your full stack here, then look for notches that hit your band.
        </p>
      </header>

      {/* PRESETS + GLOBAL CONTROLS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.amber }}>Stack presets</div>
            <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>quick start</div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button
                key={key}
                onClick={() => loadPreset(key)}
                className="text-left px-2 py-1.5 text-[11px] font-mono rounded border bg-transparent hover:bg-[#1f1610]"
                style={{ borderColor: '#252e33', color: C.text }}
              >
                <span style={{ color: C.amber }}>{p.label}</span>
                <span className="ml-2 text-[10px]" style={{ color: C.textMuted }}>· {p.stack.reduce((s, l) => s + l.count, 0)} wraps</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.teal }}>Cable + band (shared)</div>
            <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>step 2</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SliderInput label="Cable OD" value={cableOD} onChange={setCableOD} min={0.5} max={30} step={0.1} units={units} length />
            <SliderInput label="VF" value={vf} onChange={setVf} min={0.5} max={0.95} step={0.01} unit="" />
            <SliderInput label="Band low" value={bandLo} onChange={setBandLo} min={100} max={20000} step={100} unit="MHz" />
            <SliderInput label="Band high" value={bandHi} onChange={setBandHi} min={500} max={50000} step={500} unit="MHz" />
            <SliderInput label="Notch depth" value={notchDepth} onChange={setNotchDepth} min={2} max={25} step={1} unit="dB" />
            <SliderInput label="IL base" value={insertionLossBase} onChange={setInsertionLossBase} min={0.05} max={5} step={0.05} unit="dB/m" />
          </div>
        </div>
      </div>

      {/* LAYER STACK */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <LayersIcon size={14} style={{ color: accent }} />
            <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: accent }}>
              Layer stack · {stack.length} layer{stack.length === 1 ? '' : 's'} · {totalWraps} total wrap{totalWraps === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => addLayer('ptfe')}
              className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded border bg-transparent hover:bg-[#1f1610] flex items-center gap-1"
              style={{ borderColor: C.teal + '60', color: C.teal }}
            >
              <Plus size={11} /> PTFE
            </button>
            <button
              onClick={() => addLayer('foil')}
              className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded border bg-transparent hover:bg-[#1f1610] flex items-center gap-1"
              style={{ borderColor: C.amber + '60', color: C.amber }}
            >
              <Plus size={11} /> Foil
            </button>
            <button
              onClick={() => addLayer('braid')}
              className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded border bg-transparent hover:bg-[#1f1610] flex items-center gap-1"
              style={{ borderColor: '#a78bfa60', color: '#a78bfa' }}
            >
              <Plus size={11} /> Braid
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {stack.length === 0 && (
            <div className="text-[12px] italic text-center py-4" style={{ color: C.textMuted }}>
              No layers — pick a preset above or click + PTFE / + Foil / + Braid to build a stack.
            </div>
          )}
          {stack.map((layer, idx) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              idx={idx}
              cableOD={cableOD}
              vf={vf}
              color={colorFor(idx)}
              units={units}
              onUpdate={(patch) => updateLayer(layer.id, patch)}
              onRemove={() => removeLayer(layer.id)}
              onDuplicate={() => duplicateLayer(layer.id)}
            />
          ))}
        </div>
      </div>

      {/* CROSS-SECTION VISUALIZATION */}
      <CableCrossSectionPanel stack={stack} cableOD={cableOD} units={units} accent={accent} />

      {/* VERDICT */}
      <div
        className="border rounded p-4 flex items-center gap-4 flex-wrap"
        style={{ borderColor: verdict.color + '60', background: verdict.color + '14' }}
      >
        <div className="flex items-center gap-3">
          <div className="font-mono text-[24px] leading-none" style={{ color: verdict.color }}>{verdict.glyph}</div>
          <div className="font-mono text-[18px] font-medium tracking-wider" style={{ color: verdict.color }}>{verdict.state}</div>
        </div>
        <div className="text-[12px] flex-1 min-w-[200px]" style={{ color: C.textDim }}>{verdict.detail}</div>
        <div className="font-mono text-[11px]" style={{ color: C.textMuted }}>
          {allNotches.length} total notch{allNotches.length === 1 ? '' : 'es'} from {stack.length} layer{stack.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* COMBINED |S21| PLOT */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>
            |S21| simulated · COMBINED across all layers
          </div>
          <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
            band {(bandLo / 1000).toFixed(1)}–{(bandHi / 1000).toFixed(1)} GHz · VF {vf.toFixed(2)}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sweep} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#252e33" strokeDasharray="2 4" />
            <XAxis
              dataKey="f"
              type="number"
              scale="log"
              domain={['auto', 'auto']}
              ticks={[100, 300, 1000, 3000, 10000, 30000, 60000]}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000} GHz` : `${v} MHz`)}
              stroke={C.textMuted}
              tick={{ fontSize: 10 }}
            />
            <YAxis stroke={C.textMuted} tick={{ fontSize: 10 }} domain={['auto', 0]} tickFormatter={(v) => `${v.toFixed(0)} dB`} />
            <Tooltip
              contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              formatter={(v) => [`${v.toFixed(2)} dB`, '|S21|']}
              labelFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${v.toFixed(0)} MHz`)}
            />
            <ReferenceArea x1={bandLo} x2={bandHi} y1={-200} y2={0} fill={C.teal} fillOpacity={0.06} />
            <ReferenceLine x={bandLo} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band lo', fill: C.teal, fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine x={bandHi} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band hi', fill: C.teal, fontSize: 9, position: 'insideTopRight' }} />
            {allNotches.map((n, i) => {
              const inB = n.f_mhz >= bandLo && n.f_mhz <= bandHi
              return (
                <ReferenceLine
                  key={i}
                  x={n.f_mhz}
                  stroke={inB ? C.red : colorFor(n.layerIdx)}
                  strokeDasharray={n.order === 1 ? '4 2' : '2 3'}
                  strokeOpacity={n.order === 1 ? 0.9 : 0.5}
                />
              )
            })}
            <Line type="monotone" dataKey="s21" stroke={accent} dot={false} strokeWidth={1.6} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 text-[11px]" style={{ color: C.textMuted }}>
          Each layer's notches are colored to match its row above. Solid dashes = n=1 fundamentals; lighter = n=2/3 harmonics.
        </div>
      </div>

      {/* COMBINED NOTCH TABLE */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.amber }}>
          All Bragg notches across stack ({allNotches.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase" style={{ color: C.textMuted }}>
                <th className="text-left py-1 px-2">layer</th>
                <th className="text-left py-1 px-2">type</th>
                <th className="text-right py-1 px-2">order</th>
                <th className="text-right py-1 px-2">f<sub>n</sub> (GHz)</th>
                <th className="text-right py-1 px-2">f<sub>n</sub> (MHz)</th>
                <th className="text-right py-1 px-2">in band?</th>
                <th className="text-right py-1 px-2">depth</th>
              </tr>
            </thead>
            <tbody>
              {allNotches.length === 0 && (
                <tr><td colSpan={7} className="italic text-center py-4" style={{ color: C.textMuted }}>No layers in stack — add one above.</td></tr>
              )}
              {allNotches.map((n, i) => {
                const inB = n.f_mhz >= bandLo && n.f_mhz <= bandHi
                return (
                  <tr key={i} className="border-t border-[#252e33] font-mono">
                    <td className="py-1.5 px-2">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: colorFor(n.layerIdx) }} />
                      <span style={{ color: C.textDim }}>L{n.layerIdx + 1}</span>
                    </td>
                    <td className="py-1.5 px-2 uppercase text-[10px]" style={{ color: C.textMuted }}>{layerLabel(n.layerKind)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: C.textDim }}>n = {n.order}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: C.amber }}>{(n.f_mhz / 1000).toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: C.textDim }}>{n.f_mhz.toFixed(0)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: inB ? C.red : C.teal }}>{inB ? 'YES — hits' : 'no'}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: C.textDim }}>{n.depth.toFixed(1)} dB</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] italic" style={{ color: C.textMuted }}>
          Identical-geometry repeats stack DEEPER at the same frequency (depth × wrap count). Different-width layers spread the notches across frequency — the production trick to make residual notches shallow.
        </div>
      </div>

      {/* FORMULA + PRACTICE NOTES */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-2 text-[12px] leading-relaxed" style={{ color: C.textDim }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: C.teal }}>Reference</div>
        <div className="font-mono" style={{ color: C.amber }}>tape: P = W · (1 − overlap) · cos(γ)   where sin(γ) = W / (π · OD)</div>
        <div className="font-mono" style={{ color: C.amber }}>braid: P = 25.4 / picks_per_inch</div>
        <div className="font-mono" style={{ color: C.amber }}>f<sub>n</sub> = n · c · VF / (2 · P)  ≈  n · 150 000 · VF / P<sub>mm</sub>  [MHz]</div>
        <div>
          • Each layer adds its OWN pitch-driven notch — they're independent contributions.
          <br />• N identical wraps stack the SAME notch ~N× deeper. <em>Worst case for engineering, best case for QC repeatability.</em>
          <br />• N wraps with mixed widths produce N (or fewer) DIFFERENT notches, each shallower than a single equivalent stack — the standard "spread the suckout" trick.
          <br />• Foil shield notches typically appear shallower than dielectric notches; braid shield notches even shallower (1-3 dB) but at 1/PR pitch.
        </div>
      </div>
    </section>
  )
}

let _id = 1
function nextId() { return ++_id }

// ─────────── Cable cross-section visualization ───────────
// Shows the cable's concentric rings as each tape layer is added.
// - Inner copper conductor + dielectric
// - One ring per WRAP (so a layer with count=10 adds 10 visible rings)
// - Each ring colored to match its layer (and its notch markers)
// - PTFE: translucent fill + diagonal hatch (helix direction)
// - Foil:  silver solid ring
// - Braid: dark with crosshatch pattern
//
// We render: a "build flow" of mini cross-sections (one per wrap)
// AND a final big cross-section with all layers overlaid, with an OD
// dimension chip in the active units.
function CableCrossSectionPanel({ stack, cableOD, units, accent }) {
  // Build the wrap-by-wrap stack (each `count` is expanded into N entries
  // so the visualisation shows every physical wrap, not just every layer).
  const wraps = []
  stack.forEach((layer, layerIdx) => {
    for (let k = 0; k < Math.max(1, layer.count); k++) {
      wraps.push({ ...layer, layerIdx, wrapIdx: k })
    }
  })

  // Approximate radial thickness for each wrap (visual only, not to scale).
  // Tape: 25-50 µm, foil: 35 µm, braid: 200 µm. Scale down to a sane visual.
  const tapeT = 0.10  // mm visual
  const foilT = 0.10
  const braidT = 0.40

  // Compute outer OD after all layers — for OD chip
  const finalOD = wraps.reduce((od, w) => {
    if (w.kind === 'foil') return od + 2 * foilT
    if (w.kind === 'braid') return od + 2 * braidT
    return od + 2 * tapeT
  }, cableOD)

  // Build the cumulative stages: stage 0 = bare core, stage N = after wrap N
  const stages = [{ od: cableOD, label: 'Core', wraps: [] }]
  let runningOD = cableOD
  wraps.forEach((w, i) => {
    runningOD += 2 * (w.kind === 'foil' ? foilT : w.kind === 'braid' ? braidT : tapeT)
    stages.push({
      od: runningOD,
      label: `+L${w.layerIdx + 1} ${w.kind === 'ptfe' ? 'PTFE' : w.kind === 'foil' ? 'Foil' : 'Braid'} #${w.wrapIdx + 1}`,
      wraps: wraps.slice(0, i + 1),
    })
  })

  // OD chip formatter
  const fmtOD = (mm) => {
    if (units === 'inch') return `ϕ${(mm / 25.4).toFixed(4)}″`
    return `ϕ${mm.toFixed(2)} mm`
  }

  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>
          Cable cross-section · build progression
        </div>
        <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
          core {fmtOD(cableOD)} → final {fmtOD(finalOD)} · {wraps.length} wrap{wraps.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-3">
        {/* Big final cross-section */}
        <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2 flex flex-col items-center">
          <BigCableXS wraps={wraps} cableOD={cableOD} size={240} />
          <div className="mt-2 text-center font-mono text-[10px] uppercase" style={{ color: C.textMuted }}>final cable</div>
          <div className="font-mono text-[14px] font-medium" style={{ color: accent }}>{fmtOD(finalOD)}</div>
        </div>

        {/* Horizontal build flow */}
        <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2 overflow-hidden">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {stages.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center shrink-0 w-[68px]">
                  <div className="bg-[#12171a] border border-[#252e33] rounded mx-auto flex items-center justify-center" style={{ width: 56, height: 56 }}>
                    <BigCableXS wraps={s.wraps} cableOD={cableOD} size={50} />
                  </div>
                  <div className="font-mono text-[9px] mt-1 text-center leading-tight" style={{ color: i === 0 ? C.copper : colorFor(s.wraps[s.wraps.length - 1]?.layerIdx ?? 0) }}>
                    {s.label}
                  </div>
                  <div className="font-mono text-[8px] mt-0.5" style={{ color: C.textMuted }}>
                    {fmtOD(s.od)}
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className="flex items-center shrink-0 -mx-0.5" style={{ color: C.borderHi, height: 56 }}>▸</div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 text-[10px] font-mono" style={{ color: C.textMuted }}>
            ⓘ Each wrap shown as a colored ring. PTFE = translucent layer color · Foil = silver · Braid = crosshatch.
            Thickness shown is visual only (real tape is 25-50 µm).
          </div>
        </div>
      </div>
    </div>
  )
}

// SVG that renders a coax cross-section with the given wrap stack
function BigCableXS({ wraps, cableOD, size = 240 }) {
  const c = size / 2
  // Total visual radius: scale so final fits within the canvas
  const totalT = wraps.reduce((acc, w) => acc + (w.kind === 'foil' ? 0.10 : w.kind === 'braid' ? 0.40 : 0.10), 0)
  const finalODmm = cableOD + 2 * totalT
  const padding = 4
  const maxR = c - padding
  const mmToPx = maxR / Math.max(0.5, finalODmm / 2)
  const coreR = (cableOD / 2) * mmToPx
  // Conductor: assume conductor = 50% of core OD (dielectric core fills the rest)
  const condR = coreR * 0.55
  // Outer build outward
  const layers = []
  let r = coreR
  wraps.forEach((w, i) => {
    const t = (w.kind === 'foil' ? 0.10 : w.kind === 'braid' ? 0.40 : 0.10) * mmToPx
    const inner = r
    const outer = r + t
    layers.push({ inner, outer, kind: w.kind, color: colorFor(w.layerIdx), wrapIdx: w.wrapIdx, layerIdx: w.layerIdx })
    r = outer
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <pattern id="braid-pat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#c97b3f" strokeWidth="1.2" />
          <line x1="3" y1="0" x2="3" y2="6" stroke="#e89357" strokeWidth="0.8" />
        </pattern>
        {/* Diagonal hatch for PTFE — alternates direction by wrap index for S/Z */}
        <pattern id="ptfe-hatch-s" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity="0.10" strokeWidth="0.8" />
        </pattern>
        <pattern id="ptfe-hatch-z" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity="0.10" strokeWidth="0.8" />
        </pattern>
      </defs>
      {/* Outermost first so inner rings render on top */}
      {layers.slice().reverse().map((l, idx) => {
        const fill = l.kind === 'foil' ? '#a7b0b6' : l.kind === 'braid' ? 'url(#braid-pat)' : l.color
        const opacity = l.kind === 'ptfe' ? 0.55 : 0.85
        const hatch = l.kind === 'ptfe' ? (l.wrapIdx % 2 ? 'url(#ptfe-hatch-z)' : 'url(#ptfe-hatch-s)') : null
        return (
          <g key={idx}>
            <circle cx={c} cy={c} r={l.outer} fill={fill} fillOpacity={opacity} stroke={l.color} strokeWidth="0.75" />
            {hatch && <circle cx={c} cy={c} r={l.outer} fill={hatch} />}
          </g>
        )
      })}
      {/* Dielectric core (the OD where the tape sits) */}
      <circle cx={c} cy={c} r={coreR} fill="#1a1612" stroke="#384249" strokeWidth="0.5" />
      {/* Copper conductor */}
      <circle cx={c} cy={c} r={condR} fill="#c97b3f" stroke="#e89357" strokeWidth="0.5" />
      {/* Center sparkle (small highlight) */}
      <circle cx={c - condR * 0.3} cy={c - condR * 0.3} r={condR * 0.15} fill="#fbbf24" fillOpacity="0.5" />
    </svg>
  )
}

// ─────────── Layer row ───────────
function LayerRow({ layer, idx, cableOD, vf, color, units = 'mm', onUpdate, onRemove, onDuplicate }) {
  const P = pitchOf(layer, cableOD)
  const f1 = (150000 * vf) / Math.max(0.01, P)
  const alpha = helixAngleOf(layer, cableOD)
  const isBraid = layer.kind === 'braid'
  const showInch = units === 'inch'

  return (
    <div className="border rounded bg-[#0d1416] flex items-stretch overflow-hidden" style={{ borderColor: color + '40' }}>
      {/* color stripe */}
      <div style={{ width: 4, background: color }} />
      <div className="flex-1 grid grid-cols-[auto_1fr_auto] gap-3 p-3 items-center">
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-[11px] font-medium tracking-wider" style={{ color }}>L{idx + 1}</div>
          <select
            value={layer.kind}
            onChange={(e) => {
              const newKind = e.target.value
              const reset = newLayer(newKind)
              onUpdate(reset)
            }}
            className="bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-1 text-[11px] font-mono"
            style={{ color: C.amber }}
          >
            <option value="ptfe">PTFE</option>
            <option value="foil">Foil</option>
            <option value="braid">Braid</option>
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {!isBraid && (
            <>
              <CompactSlider label="Width" value={layer.width} onChange={(v) => onUpdate({ width: v })} min={0.5} max={30} step={0.5} units={units} length />
              <CompactSlider label="Overlap" value={layer.overlap} onChange={(v) => onUpdate({ overlap: v })} min={0} max={90} step={5} unit="%" />
            </>
          )}
          {isBraid && (
            <>
              <CompactSlider label="Carriers" value={layer.carriers} onChange={(v) => onUpdate({ carriers: v })} min={8} max={48} step={2} unit="" />
              <CompactSlider label="Picks/in" value={layer.picksPerIn} onChange={(v) => onUpdate({ picksPerIn: v })} min={4} max={40} step={1} unit="PR" />
            </>
          )}
          <CompactSlider label="× count" value={layer.count} onChange={(v) => onUpdate({ count: Math.max(1, v) })} min={1} max={20} step={1} unit="wraps" />
          <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-1.5">
            <div className="font-mono text-[8px] uppercase" style={{ color: C.textMuted }}>P / f₁ / α</div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color }}>
              {showInch ? `${(P / 25.4).toFixed(4)}″` : `${P.toFixed(2)} mm`}
            </div>
            <div className="font-mono text-[10px]" style={{ color: C.amber }}>{(f1 / 1000).toFixed(2)} GHz</div>
            <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>α = {alpha.toFixed(0)}°</div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDuplicate}
            title="Duplicate layer"
            className="p-1.5 rounded border bg-transparent hover:bg-[#1f1610]"
            style={{ borderColor: C.border, color: C.textDim }}
          >
            <Copy size={11} />
          </button>
          <button
            onClick={onRemove}
            title="Remove layer"
            className="p-1.5 rounded border bg-transparent hover:bg-[#1f1610]"
            style={{ borderColor: C.border, color: C.red }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Length-aware: when `length` is true, the value is interpreted as mm
// internally but displayed/edited in the active `units` (mm or inch).
function CompactSlider({ label, value, onChange, min, max, step, unit, units = 'mm', length = false }) {
  const isInch = length && units === 'inch'
  const factor = isInch ? 1 / 25.4 : 1
  const dispValue = value * factor
  const dispMin = min * factor
  const dispMax = max * factor
  const dispStep = isInch ? Math.max(0.001, step / 25.4) : step
  const dispUnit = length ? (isInch ? '″' : 'mm') : unit
  const handle = (raw) => onChange(isInch ? parseFloat(raw) * 25.4 : parseFloat(raw))
  const fmt = (v) => (isInch ? v.toFixed(4) : v.toFixed(step < 1 ? 1 : 0))
  return (
    <div>
      <label className="font-mono text-[9px] uppercase tracking-wider mb-0.5 block" style={{ color: C.textMuted }}>{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="range"
          min={dispMin}
          max={dispMax}
          step={dispStep}
          value={dispValue}
          onChange={(e) => handle(e.target.value)}
          className="flex-1 h-1"
          style={{ accentColor: C.copper }}
        />
        <input
          type="number"
          min={dispMin}
          max={dispMax}
          step={dispStep}
          value={fmt(dispValue)}
          onChange={(e) => handle(e.target.value)}
          className="w-14 bg-[#0a0d0f] border border-[#252e33] rounded px-1 py-0.5 text-[10px] font-mono text-right"
          style={{ color: C.amber }}
        />
        {dispUnit && <span className="font-mono text-[9px] w-7" style={{ color: C.textMuted }}>{dispUnit}</span>}
      </div>
    </div>
  )
}

function SliderInput({ label, value, onChange, min, max, step, unit, units = 'mm', length = false }) {
  const isInch = length && units === 'inch'
  const factor = isInch ? 1 / 25.4 : 1
  const dispValue = value * factor
  const dispMin = min * factor
  const dispMax = max * factor
  const dispStep = isInch ? Math.max(0.001, step / 25.4) : step
  const dispUnit = length ? (isInch ? 'inch' : 'mm') : unit
  const handle = (raw) => onChange(isInch ? parseFloat(raw) * 25.4 : parseFloat(raw))
  const fmt = (v) => (isInch ? v.toFixed(4) : v.toFixed(step < 1 ? 2 : 0))
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={dispMin}
          max={dispMax}
          step={dispStep}
          value={dispValue}
          onChange={(e) => handle(e.target.value)}
          className="flex-1"
          style={{ accentColor: C.copper }}
        />
        <input
          type="number"
          min={dispMin}
          max={dispMax}
          step={dispStep}
          value={fmt(dispValue)}
          onChange={(e) => handle(e.target.value)}
          className="w-16 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-right"
          style={{ color: C.amber }}
        />
        <span className="font-mono text-[10px] w-12" style={{ color: C.textMuted }}>{dispUnit}</span>
      </div>
      {length && (
        <div className="font-mono text-[9px] text-right mt-0.5" style={{ color: C.teal }}>
          {isInch ? `${value.toFixed(2)} mm` : `${(value / 25.4).toFixed(4)}″`}
        </div>
      )}
    </div>
  )
}

import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'

// ─────────────────────────────────────────────────────────────
// Tape Suckout Simulator
// ─────────────────────────────────────────────────────────────
// Periodic structures on a coax — helical PTFE dielectric tape, helical
// foil shield wrap, or braided shield — produce Bragg-style reflection
// notches at f_n = n·c·VF / (2·P), where P is the AXIAL period.
//
// The tape pitch is set primarily by tape WIDTH and OVERLAP, with a small
// geometric correction from the cable's OD (helix angle).  For a braid
// the period is set by carriers / picks-per-inch.
//
// "Wider tape pushes the notch LEFT (lower f), narrower pushes it RIGHT" —
// the engineer can use this to land the first notch outside the operating
// band BEFORE running the line.
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

export default function SuckoutSim({ accent = '#c97b3f', defaultLayer = 'ptfe' }) {
  // Layer parameters
  const [layer, setLayer]       = useState(defaultLayer) // ptfe | foil | braid
  const [width, setWidth]       = useState(12)            // tape width mm
  const [overlap, setOverlap]   = useState(25)            // overlap %
  const [carriers, setCarriers] = useState(24)            // braid: total carriers
  const [picksPerIn, setPicksPerIn] = useState(14)        // braid: picks per inch

  // Cable + band
  const [cableOD, setCableOD]   = useState(5.0)           // OD where the layer sits (mm)
  const [vf, setVf]             = useState(0.70)
  const [bandLo, setBandLo]     = useState(1000)          // MHz
  const [bandHi, setBandHi]     = useState(18000)         // MHz
  const [insertionLossBase, setInsertionLossBase] = useState(0.5) // dB/m
  const [notchDepth, setNotchDepth] = useState(8)         // dB

  // Compute the axial pitch P (mm) of the periodic structure.
  // - For tape: P = W·(1 − overlap_fraction)·sin(α)  where α is helix
  //   angle from axis. For a tape continuously covering the cable with
  //   overlap O, the geometric constraint links W, OD and α — we solve
  //   for α from W and OD assuming the tape covers π·D effectively.
  // - For braid: pitch = 25.4 / picks-per-inch  (axial advance between
  //   adjacent crossings of the same braid direction).
  const calc = useMemo(() => {
    if (layer === 'braid') {
      // Braid pitch: distance between adjacent same-direction crossings
      const P_mm = 25.4 / Math.max(2, picksPerIn)
      // Helix angle α (from cable axis) — typical 30-50° for braid
      // tan(α) = (π·D) / (carriers/2 · pitch)  ... approximate
      const alpha_deg = (Math.atan2(Math.PI * cableOD, (carriers / 2) * P_mm) * 180) / Math.PI
      return { P_mm, alpha_deg, geometricNote: `pitch = 25.4 mm/in ÷ ${picksPerIn} picks/in` }
    }
    // Tape: derive helix angle from W and cable OD assuming continuous coverage.
    // For a tape of width W wrapped on a cylinder of OD D, the helix angle
    // from the cable's circumferential direction is asin(W/(π·D + W·overlap)),
    // then the axial pitch is W·cos(γ)·(1−overlap).  We simplify:
    const o = Math.max(0, Math.min(0.95, overlap / 100))
    const circ = Math.PI * Math.max(0.5, cableOD)
    // Helix angle from CIRCUMFERENTIAL direction (small for steep wraps)
    const sinG = Math.min(0.95, width / circ)
    const cosG = Math.sqrt(1 - sinG * sinG)
    // Axial pitch = (W − overlap) · cos(γ) — overlap measured along tape
    const P_mm = width * (1 - o) * cosG
    // Helix angle from cable axis
    const alpha_axis = 90 - (Math.asin(sinG) * 180) / Math.PI
    return {
      P_mm,
      alpha_deg: alpha_axis,
      geometricNote: `P = W · (1 − overlap) · cos(γ) where sin(γ) = W / (π·OD)`,
    }
  }, [layer, width, overlap, cableOD, carriers, picksPerIn])

  const pitch_mm = calc.P_mm

  // Bragg notches f_n = n · 150 000 · VF / P_mm  (MHz)
  const notches = useMemo(() => {
    const list = []
    for (let n = 1; n <= 5; n++) {
      const f = (150000 * vf * n) / Math.max(0.01, pitch_mm)
      if (f > 60_000) break
      list.push({ order: n, f_mhz: f })
    }
    return list
  }, [pitch_mm, vf])

  const inBand = notches.filter((n) => n.f_mhz >= bandLo && n.f_mhz <= bandHi)
  const verdict =
    inBand.length === 0
      ? { state: 'CLEAR', color: C.teal, glyph: '✓', detail: 'No notch falls inside the operating band — the tape geometry is safe.' }
      : inBand.length === 1
      ? { state: 'WARNING', color: C.amber, glyph: '!', detail: `Order-${inBand[0].order} notch at ${(inBand[0].f_mhz / 1000).toFixed(2)} GHz hits the band — engineering decision needed.` }
      : { state: 'FAIL', color: C.red, glyph: '✗', detail: `${inBand.length} notches inside band — this geometry will create visible suckouts in S21.` }

  // Synthetic |S21| sweep over 100 MHz → 60 GHz (log-spaced) so the
  // engineer sees the notch placement immediately
  const sweep = useMemo(() => {
    const arr = []
    const f0 = 100, f1 = 60000, N = 240
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const f = f0 * Math.pow(f1 / f0, t)
      const baseLoss = insertionLossBase * Math.sqrt(f / 1000)
      let notchSum = 0
      for (const nt of notches) {
        const sigma = nt.f_mhz * 0.025
        const dx = (f - nt.f_mhz) / sigma
        notchSum += (notchDepth * Math.exp(-dx * dx)) / nt.order
      }
      arr.push({ f, s21: -(baseLoss + notchSum) })
    }
    return arr
  }, [notches, insertionLossBase, notchDepth])

  // Suggest a width that pushes the FIRST notch above bandHi (with 5% margin)
  // For tape: bandHi = 150_000·VF / (W_safe · (1 − O) · cos(γ_safe))
  // We approximate cos(γ) ≈ same value and solve for W.
  const widthSuggestion = useMemo(() => {
    if (layer === 'braid') return null
    const o = Math.max(0, Math.min(0.95, overlap / 100))
    const circ = Math.PI * Math.max(0.5, cableOD)
    // Iterate: try widths from 0.5 to 30 mm and find the smallest that pushes f1 above bandHi*1.05
    for (let w = 0.5; w <= 30; w += 0.1) {
      const sinG = Math.min(0.95, w / circ)
      const cosG = Math.sqrt(1 - sinG * sinG)
      const P = w * (1 - o) * cosG
      const f1 = (150000 * vf) / P
      if (f1 > bandHi * 1.05) return w
    }
    return null
  }, [layer, overlap, cableOD, vf, bandHi])

  // Picks-per-inch suggestion for braid
  const picksSuggestion = useMemo(() => {
    if (layer !== 'braid') return null
    // f1 = 150000·VF / (25.4/PR) = 150000·VF·PR/25.4
    // → PR > bandHi·1.05·25.4 / (150000·VF)
    const minPR = (bandHi * 1.05 * 25.4) / (150000 * vf)
    return Math.ceil(minPR)
  }, [layer, vf, bandHi])

  const layerLabel =
    layer === 'ptfe' ? 'PTFE dielectric tape' :
    layer === 'foil' ? 'Foil shield (Al/PET tape)' :
    'Braid shield'

  const layerHint =
    layer === 'ptfe'
      ? 'Helical PTFE tape forms the dielectric on semi-rigid / phase-stable cables (UT-141, SF-141). The seam repeats every period P → Bragg notch in S21. Engineers usually run multiple tape heads with staggered widths to spread the residual notch.'
      : layer === 'foil'
      ? 'Helical Al/PET foil shield wrap creates a periodic admittance discontinuity on the OUTSIDE of the dielectric. Same Bragg physics as PTFE tape, but typically a shallower notch (foil discontinuity is a smaller perturbation). Most visible above ~5 GHz.'
      : 'A braid shield has a periodic cross-pattern at pitch ≈ 25.4/PR mm (PR = picks/inch). Its Bragg notch is usually weak (<3 dB) but still measurable on long runs at 5–15 GHz. Increase picks-per-inch to push the notch higher.'

  // Tape consumption ratio (length of tape per length of cable)
  const tapeRatio = useMemo(() => {
    if (layer === 'braid') return null
    const o = Math.max(0, Math.min(0.95, overlap / 100))
    const circ = Math.PI * Math.max(0.5, cableOD)
    const sinG = Math.min(0.95, width / circ)
    const cosG = Math.sqrt(1 - sinG * sinG)
    const lengthPerTurn = circ / cosG // tape length per revolution
    const axialPerTurn = width * (1 - o) * cosG
    return lengthPerTurn / Math.max(0.01, axialPerTurn)
  }, [layer, width, overlap, cableOD])

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: accent }}>
          ◆ Tape Suckout Sim · find &amp; avoid Bragg notches
        </div>
        <h1 className="text-2xl md:text-3xl font-light tracking-tight" style={{ fontFamily: 'Bricolage Grotesque' }}>
          Where will my tape pitch put the suckout?
        </h1>
        <p className="text-[12px] md:text-[13px] leading-relaxed max-w-3xl" style={{ color: C.textDim }}>
          Periodic structures on coax — helical PTFE dielectric tape, foil shield wrap, or braid — Bragg-reflect at <span className="font-mono" style={{ color: C.teal }}>f<sub>n</sub> = n·c·VF / (2·P)</span>.
          Wider tape pushes the notch <span style={{ color: C.red }}>left</span> (lower f), narrower tape pushes it <span style={{ color: C.teal }}>right</span>.
          Pick a geometry that lands the first notch <em>outside</em> your band.
        </p>
      </header>

      {/* TWO-COLUMN INPUTS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.amber }}>{layerLabel} · geometry</div>
            <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>step 1</div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>Layer</label>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
              className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
              style={{ color: C.amber }}
            >
              <option value="ptfe">PTFE dielectric tape</option>
              <option value="foil">Foil shield (Al/PET tape)</option>
              <option value="braid">Braid shield (carriers + picks)</option>
            </select>
          </div>

          {layer !== 'braid' ? (
            <div className="grid grid-cols-2 gap-3">
              <SliderInput label="Tape width" value={width} onChange={setWidth} min={0.5} max={30} step={0.5} unit="mm" inchHint />
              <SliderInput label="Overlap" value={overlap} onChange={setOverlap} min={0} max={90} step={5} unit="%" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <SliderInput label="Carriers" value={carriers} onChange={setCarriers} min={8} max={48} step={2} unit="" />
              <SliderInput label="Picks/inch" value={picksPerIn} onChange={setPicksPerIn} min={4} max={40} step={1} unit="PR" />
            </div>
          )}

          <SliderInput label={`Cable OD (where ${layer === 'braid' ? 'braid' : 'tape'} sits)`} value={cableOD} onChange={setCableOD} min={0.5} max={30} step={0.1} unit="mm" inchHint />

          <div className="text-[11px] italic leading-relaxed" style={{ color: C.textMuted }}>{layerHint}</div>
        </div>

        <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.teal }}>Cable + operating band</div>
            <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>step 2</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SliderInput label="VF" value={vf} onChange={setVf} min={0.5} max={0.95} step={0.01} unit="" />
            <SliderInput label="Notch depth" value={notchDepth} onChange={setNotchDepth} min={2} max={25} step={1} unit="dB" />
            <SliderInput label="Band low" value={bandLo} onChange={setBandLo} min={100} max={20000} step={100} unit="MHz" />
            <SliderInput label="Band high" value={bandHi} onChange={setBandHi} min={500} max={50000} step={500} unit="MHz" />
          </div>

          {/* Computed quantities */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
              <div className="font-mono text-[9px] uppercase" style={{ color: C.textMuted }}>Axial pitch P</div>
              <div className="font-mono text-[15px] mt-0.5" style={{ color: C.amber }}>{pitch_mm.toFixed(2)} mm</div>
              <div className="font-mono text-[10px]" style={{ color: C.teal }}>{(pitch_mm / 25.4).toFixed(4)}″</div>
            </div>
            <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
              <div className="font-mono text-[9px] uppercase" style={{ color: C.textMuted }}>1st notch (n=1)</div>
              <div className="font-mono text-[15px] mt-0.5" style={{ color: accent }}>
                {notches[0] ? (notches[0].f_mhz / 1000).toFixed(2) + ' GHz' : '—'}
              </div>
              <div className="font-mono text-[10px]" style={{ color: C.textDim }}>
                {notches[0] ? notches[0].f_mhz.toFixed(0) + ' MHz' : ''}
              </div>
            </div>
            <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
              <div className="font-mono text-[9px] uppercase" style={{ color: C.textMuted }}>Helix angle α</div>
              <div className="font-mono text-[14px] mt-0.5" style={{ color: C.text }}>{calc.alpha_deg.toFixed(1)}°</div>
              <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>from cable axis</div>
            </div>
            <div className="bg-[#0a0d0f] border border-[#252e33] rounded p-2">
              <div className="font-mono text-[9px] uppercase" style={{ color: C.textMuted }}>{layer === 'braid' ? 'Pattern repeat' : 'Tape consumption'}</div>
              <div className="font-mono text-[14px] mt-0.5" style={{ color: C.text }}>
                {layer === 'braid' ? `${(2 * pitch_mm).toFixed(2)} mm` : `${tapeRatio?.toFixed(1)} ×`}
              </div>
              <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                {layer === 'braid' ? '1 full S/Z cycle' : 'm tape per m cable'}
              </div>
            </div>
          </div>
        </div>
      </div>

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
        {verdict.state !== 'CLEAR' && layer !== 'braid' && widthSuggestion && widthSuggestion < width && widthSuggestion > 0.3 && (
          <button
            onClick={() => setWidth(parseFloat(widthSuggestion.toFixed(1)))}
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-2 rounded border bg-transparent hover:bg-[#1f1610]"
            style={{ color: C.teal, borderColor: C.teal + '60' }}
          >
            → Try W = {widthSuggestion.toFixed(1)} mm
          </button>
        )}
        {verdict.state !== 'CLEAR' && layer === 'braid' && picksSuggestion && picksSuggestion > picksPerIn && (
          <button
            onClick={() => setPicksPerIn(picksSuggestion)}
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-2 rounded border bg-transparent hover:bg-[#1f1610]"
            style={{ color: C.teal, borderColor: C.teal + '60' }}
          >
            → Try {picksSuggestion} picks/in
          </button>
        )}
      </div>

      {/* |S21| PLOT */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>|S21| simulated · log frequency</div>
          <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
            band {(bandLo / 1000).toFixed(1)}–{(bandHi / 1000).toFixed(1)} GHz · VF {vf.toFixed(2)}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
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
            {/* Operating band shaded */}
            <ReferenceArea x1={bandLo} x2={bandHi} y1={-100} y2={0} fill={C.teal} fillOpacity={0.06} />
            <ReferenceLine x={bandLo} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band lo', fill: C.teal, fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine x={bandHi} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band hi', fill: C.teal, fontSize: 9, position: 'insideTopRight' }} />
            {/* Notch markers */}
            {notches.map((n) => {
              const inB = n.f_mhz >= bandLo && n.f_mhz <= bandHi
              return (
                <ReferenceLine
                  key={n.order}
                  x={n.f_mhz}
                  stroke={inB ? C.red : C.amber}
                  strokeDasharray="4 2"
                  label={{ value: `f${n.order}`, fill: inB ? C.red : C.amber, fontSize: 10, position: 'top' }}
                />
              )
            })}
            <Line type="monotone" dataKey="s21" stroke={accent} dot={false} strokeWidth={1.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* NOTCH TABLE */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.amber }}>Bragg notch frequencies</div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="font-mono text-[10px] uppercase" style={{ color: C.textMuted }}>
              <th className="text-left py-1">order</th>
              <th className="text-right py-1">f<sub>n</sub> (GHz)</th>
              <th className="text-right py-1">f<sub>n</sub> (MHz)</th>
              <th className="text-right py-1">in band?</th>
              <th className="text-right py-1">amplitude</th>
            </tr>
          </thead>
          <tbody>
            {notches.length === 0 && (
              <tr><td colSpan={5} className="italic text-center py-3" style={{ color: C.textMuted }}>Pitch too small — first notch &gt; 60 GHz, off chart.</td></tr>
            )}
            {notches.map((n) => {
              const inB = n.f_mhz >= bandLo && n.f_mhz <= bandHi
              return (
                <tr key={n.order} className="border-t border-[#252e33] font-mono">
                  <td className="py-1.5" style={{ color: C.textDim }}>n = {n.order}</td>
                  <td className="py-1.5 text-right" style={{ color: C.amber }}>{(n.f_mhz / 1000).toFixed(3)}</td>
                  <td className="py-1.5 text-right" style={{ color: C.textDim }}>{n.f_mhz.toFixed(0)}</td>
                  <td className="py-1.5 text-right" style={{ color: inB ? C.red : C.teal }}>{inB ? 'YES — hits' : 'no'}</td>
                  <td className="py-1.5 text-right" style={{ color: C.textDim }}>{(notchDepth / n.order).toFixed(1)} dB</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] italic" style={{ color: C.textMuted }}>
          Higher-order notches (n=2,3,…) are shallower (~1/n in amplitude) but can still bite if the band is wide. Real cables get partial spread from tape thickness variation, so notches are typically 50–200 MHz wide instead of infinitely sharp.
        </div>
      </div>

      {/* WIDTH or PICKS-vs-NOTCH SWEEP */}
      {layer !== 'braid' ? (
        <WidthSweepPanel baseOverlap={overlap} cableOD={cableOD} vf={vf} bandLo={bandLo} bandHi={bandHi} currentWidth={width} accent={accent} />
      ) : (
        <PicksSweepPanel cableOD={cableOD} vf={vf} bandLo={bandLo} bandHi={bandHi} currentPicks={picksPerIn} accent={accent} />
      )}

      {/* FORMULA + PRACTICE NOTES */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-4 space-y-2 text-[12px] leading-relaxed" style={{ color: C.textDim }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: C.teal }}>Reference</div>
        <div className="font-mono" style={{ color: C.amber }}>
          {layer === 'braid'
            ? 'P = 25.4 mm/in  /  picks_per_inch  (single-cross pitch)'
            : 'P = W · (1 − overlap) · cos(γ)   where sin(γ) = W / (π · OD)'}
        </div>
        <div className="font-mono" style={{ color: C.amber }}>f<sub>n</sub> = n · c · VF / (2 · P)  ≈  n · 150 000 · VF / P<sub>mm</sub>  [MHz]</div>
        <div>
          • <span style={{ color: C.text }}>{layerLabel}</span> — picking the right geometry is the cheapest way to dodge a suckout. <em>You can&apos;t move the band, but you can move the notch.</em>
          <br />• Cable OD enters via the helix angle: at fixed tape width, a thicker cable lowers γ (steeper wrap), which reduces P slightly and shifts the notch up.
          <br />• Factories often run multiple tape heads with staggered widths to spread / smear the residual notch.
          <br />• Foil shield notches typically appear at +5 to 15 dB shallower than dielectric notches.
        </div>
      </div>
    </section>
  )
}

function SliderInput({ label, value, onChange, min, max, step, unit, inchHint = false }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-wider mb-1 block" style={{ color: C.textMuted }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
          style={{ accentColor: C.copper }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-16 bg-[#0a0d0f] border border-[#252e33] rounded px-1.5 py-0.5 text-[11px] font-mono text-right"
          style={{ color: C.amber }}
        />
        <span className="font-mono text-[10px] w-12" style={{ color: C.textMuted }}>{unit}</span>
      </div>
      {inchHint && <div className="font-mono text-[9px] text-right mt-0.5" style={{ color: C.teal }}>{(value / 25.4).toFixed(4)}″</div>}
    </div>
  )
}

function WidthSweepPanel({ baseOverlap, cableOD, vf, bandLo, bandHi, currentWidth, accent }) {
  const data = useMemo(() => {
    const arr = []
    const o = Math.max(0, Math.min(0.95, baseOverlap / 100))
    const circ = Math.PI * Math.max(0.5, cableOD)
    for (let w = 1; w <= 30; w += 0.5) {
      const sinG = Math.min(0.95, w / circ)
      const cosG = Math.sqrt(1 - sinG * sinG)
      const P = w * (1 - o) * cosG
      const f1 = (150000 * vf) / P
      const f2 = f1 * 2
      const f3 = f1 * 3
      arr.push({ w, f1, f2, f3 })
    }
    return arr
  }, [baseOverlap, cableOD, vf])

  return (
    <SweepPanel
      title="Notch frequency vs tape width"
      data={data}
      xKey="w"
      xUnit="mm"
      currentX={currentWidth}
      bandLo={bandLo}
      bandHi={bandHi}
      accent={accent}
      readingHint="Read horizontally: pick a tape width such that the orange (n=1) curve sits ABOVE the band-high cyan dashed line."
    />
  )
}

function PicksSweepPanel({ cableOD, vf, bandLo, bandHi, currentPicks, accent }) {
  const data = useMemo(() => {
    const arr = []
    for (let pr = 4; pr <= 40; pr += 1) {
      const P = 25.4 / pr
      const f1 = (150000 * vf) / P
      arr.push({ w: pr, f1, f2: f1 * 2, f3: f1 * 3 })
    }
    return arr
  }, [cableOD, vf])

  return (
    <SweepPanel
      title="Notch frequency vs picks/inch"
      data={data}
      xKey="w"
      xUnit="PR"
      currentX={currentPicks}
      bandLo={bandLo}
      bandHi={bandHi}
      accent={accent}
      readingHint="Higher picks-per-inch → smaller pitch → notch up. Pick a value where the orange (n=1) curve sits ABOVE the band-high line."
    />
  )
}

function SweepPanel({ title, data, xKey, xUnit, currentX, bandLo, bandHi, accent, readingHint }) {
  return (
    <div className="bg-[#12171a] border border-[#252e33] rounded p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.amber }}>{title}</div>
        <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>green = band, n=1/2/3 stacked</div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#252e33" strokeDasharray="2 4" />
          <XAxis dataKey={xKey} stroke={C.textMuted} tick={{ fontSize: 10 }} unit={` ${xUnit}`} />
          <YAxis
            stroke={C.textMuted}
            tick={{ fontSize: 10 }}
            scale="log"
            domain={[100, 200000]}
            ticks={[100, 1000, 10000, 100000]}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}G` : `${v}M`)}
          />
          <Tooltip
            contentStyle={{ background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            formatter={(v, name) => [`${(v / 1000).toFixed(2)} GHz`, name]}
            labelFormatter={(x) => `${xKey === 'w' ? 'X' : ''} = ${x} ${xUnit}`}
          />
          <ReferenceArea y1={bandLo} y2={bandHi} fill={C.teal} fillOpacity={0.08} />
          <ReferenceLine y={bandLo} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band lo', fill: C.teal, fontSize: 9, position: 'left' }} />
          <ReferenceLine y={bandHi} stroke={C.teal} strokeDasharray="3 3" label={{ value: 'band hi', fill: C.teal, fontSize: 9, position: 'left' }} />
          <ReferenceLine x={currentX} stroke={C.amber} strokeDasharray="2 2" label={{ value: `now`, fill: C.amber, fontSize: 9, position: 'top' }} />
          <Line type="monotone" dataKey="f1" stroke={accent} strokeWidth={2} dot={false} name="n=1" />
          <Line type="monotone" dataKey="f2" stroke={C.amber} strokeWidth={1.2} dot={false} name="n=2" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="f3" stroke="#a78bfa" strokeWidth={1.2} dot={false} name="n=3" strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 text-[11px]" style={{ color: C.textMuted }}>{readingHint}</div>
    </div>
  )
}

import React, { useState, useRef, useEffect } from 'react'
import { RotateCcw, Eye, EyeOff, Layers as LayersIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────
// 3D Cable Visualizer — isometric SVG cutaway view
//
// Renders the cable as a horizontal lying cylinder using SVG primitives.
// Each layer = body parallelogram (between two end ellipses) + front
// ellipse cross-section (showing layer cut) + outer-arc that gives the
// barrel its volume.  Pitch slider flattens the ellipses (head-on vs
// barrel view); yaw shifts the cutaway angle.  Explode pushes successive
// layers further apart along the cable axis so the engineer can see
// what each contributes — exactly like an exploded engineering drawing.
//
// No external 3D library: just SVG, ~few hundred elements, GPU-friendly.
// ─────────────────────────────────────────────────────────

const C = {
  bg: '#0a0d0f',
  bgCard: '#12171a',
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

// Each layer's `to` is the OUTER radius (0..1, normalised to baseR).
// `kind` controls how the body is filled (solid / striped / cross-hatched).
const PRESETS = {
  cat6a_uutp: {
    label: 'Cat 6A U/UTP',
    z0: '100 Ω diff',
    layers: [
      { name: 'Conductor', color: '#c97b3f', to: 0.18, kind: 'core' },
      { name: 'Insulation', color: '#fbbf24', to: 0.32, kind: 'solid' },
      { name: 'Cross-spline filler', color: '#5eead4', to: 0.55, kind: 'spline' },
      { name: 'Binder tape', color: '#a78bfa', to: 0.62, kind: 'striped' },
      { name: 'Jacket (LSZH)', color: '#1a2226', to: 1.0, kind: 'solid', textColor: '#a7b0b6' },
    ],
  },
  cat6a_sftp: {
    label: 'Cat 6A S/FTP (full)',
    z0: '100 Ω diff',
    layers: [
      { name: 'Conductor', color: '#c97b3f', to: 0.14, kind: 'core' },
      { name: 'Insulation', color: '#fbbf24', to: 0.26, kind: 'solid' },
      { name: 'Pair binder wrap', color: '#a78bfa', to: 0.30, kind: 'striped' },
      { name: 'Per-pair foil', color: '#a7b0b6', to: 0.36, kind: 'foil' },
      { name: 'Bundle / X-spline', color: '#5eead4', to: 0.62, kind: 'spline' },
      { name: 'Outer foil', color: '#cbd5e1', to: 0.68, kind: 'foil' },
      { name: 'Outer braid', color: '#c97b3f', to: 0.82, kind: 'braid' },
      { name: 'Jacket (LSZH)', color: '#1a2226', to: 1.0, kind: 'solid', textColor: '#a7b0b6' },
    ],
  },
  rg58: {
    label: 'RG-58 (50 Ω coax)',
    z0: '50 Ω',
    layers: [
      { name: 'Conductor (Cu)', color: '#c97b3f', to: 0.18, kind: 'core' },
      { name: 'Dielectric (PE)', color: '#fbbf24', to: 0.55, kind: 'solid' },
      { name: 'Braid (TC)', color: '#e89357', to: 0.78, kind: 'braid' },
      { name: 'Jacket (PVC)', color: '#1a2226', to: 1.0, kind: 'solid', textColor: '#a7b0b6' },
    ],
  },
  semirigid: {
    label: 'UT-141 + spiral SPC + braid',
    z0: '50 Ω',
    layers: [
      { name: 'Conductor', color: '#c97b3f', to: 0.20, kind: 'core' },
      { name: 'PTFE tape ×10', color: '#fbbf24', to: 0.55, kind: 'striped' },
      { name: 'Spiral SPC (8 bobbin)', color: '#cbd5e1', to: 0.66, kind: 'spiral' },
      { name: 'Outer braid', color: '#c97b3f', to: 0.85, kind: 'braid' },
      { name: 'FEP jacket', color: '#7dd3fc', to: 1.0, kind: 'solid' },
    ],
  },
  usb4: {
    label: 'USB4 / TB4 passive',
    z0: '90 Ω diff (× 2)',
    layers: [
      { name: 'Conductor', color: '#c97b3f', to: 0.12, kind: 'core' },
      { name: 'Insulation', color: '#fbbf24', to: 0.26, kind: 'solid' },
      { name: 'Per-pair foil', color: '#a7b0b6', to: 0.36, kind: 'foil' },
      { name: 'Bundle filler', color: '#5eead4', to: 0.58, kind: 'spline' },
      { name: 'Outer foil', color: '#cbd5e1', to: 0.68, kind: 'foil' },
      { name: 'Outer braid', color: '#c97b3f', to: 0.86, kind: 'braid' },
      { name: 'TPU jacket', color: '#7dd3fc', to: 1.0, kind: 'solid' },
    ],
  },
  qsfp_dac: {
    label: 'QSFP28 100G DAC',
    z0: '100 Ω twinax × 4',
    layers: [
      { name: 'Conductor', color: '#c97b3f', to: 0.14, kind: 'core' },
      { name: 'Foamed dielectric', color: '#fbbf24', to: 0.28, kind: 'solid' },
      { name: 'Per-pair foil', color: '#a7b0b6', to: 0.40, kind: 'foil' },
      { name: 'Bundle', color: '#5eead4', to: 0.62, kind: 'spline' },
      { name: 'Outer braid', color: '#c97b3f', to: 0.84, kind: 'braid' },
      { name: 'Jacket', color: '#1a2226', to: 1.0, kind: 'solid', textColor: '#a7b0b6' },
    ],
  },
}

export default function Cable3D() {
  const [presetId, setPresetId] = useState('cat6a_sftp')
  const preset = PRESETS[presetId]
  const [hidden, setHidden] = useState({})
  const [yaw, setYaw] = useState(0)        // -180 .. 180 — rotates the cutaway face around the axis
  const [pitch, setPitch] = useState(0.45) // 0 .. 1 — 0 = head-on (full circles); 1 = edge-on (lines)
  const [zoom, setZoom] = useState(1)
  const [autoSpin, setAutoSpin] = useState(true)
  const [exploded, setExploded] = useState(false)

  // Auto-spin yaw
  useEffect(() => {
    if (!autoSpin) return
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setYaw((y) => (y + dt * 18) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [autoSpin])

  // Drag to rotate
  const dragStartRef = useRef(null)
  const onPointerDown = (e) => {
    setAutoSpin(false)
    dragStartRef.current = { x: e.clientX, y: e.clientY, yaw, pitch }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setYaw(dragStartRef.current.yaw + dx * 0.4)
    setPitch(Math.max(0, Math.min(1, dragStartRef.current.pitch + dy * 0.003)))
  }
  const onPointerUp = (e) => {
    dragStartRef.current = null
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
  }

  const reset = () => {
    setYaw(0); setPitch(0.45); setZoom(1); setHidden({}); setAutoSpin(true); setExploded(false)
  }

  // Geometry: cable lies horizontally along x.  Front cap at the right (+x_end).
  // Body length is BL.  Each layer has its own outer radius `to * baseR`.
  const VW = 800
  const VH = 360
  const baseR = 110
  const BL = 380               // body length (px)
  const cx = 0                 // SVG centred on (0,0)
  const cy = 0
  const xFront = BL / 2        // x of front end-cap
  const xBack = -BL / 2        // x of back end-cap

  // Pitch sets the ellipse aspect (rx fixed; ry shrinks). Capped at 0.65 so the
  // cable never gets so thin that it disappears — at full pitch you still see
  // a clear barrel, just very head-on.
  const ryFor = (r) => r * (1 - pitch * 0.65)

  // Lighting: yaw determines which side faces the light source. Use yaw to bias
  // the surface gradient highlight position so the body looks "lit". Strong
  // amplitude (0.0..1.0) so the moving glint is clearly visible.
  const yawRad = (yaw * Math.PI) / 180
  const litX = (Math.cos(yawRad) * 0.5 + 0.5)  // 0..1, 0.5 at yaw=90/270, 1 at yaw=0, 0 at yaw=180

  return (
    <section className="space-y-4">
      <style>{`
        @keyframes c3dGlow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.9; } }
      `}</style>

      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        {/* Stage */}
        <div
          className="relative bg-[#0a0d0f] border border-[#252e33] rounded overflow-hidden select-none"
          style={{ minHeight: 420, cursor: dragStartRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Subtle grid backdrop */}
          <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none">
            <defs>
              <pattern id="c3d-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.border} strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#c3d-grid)" />
          </svg>

          {/* Cable SVG */}
          <svg
            viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: dragStartRef.current ? 'none' : 'transform 0.18s ease-out' }}
          >
            <defs>
              {/* Patterns — patternTransform's translate uses yaw so the surface
                  hatch slides horizontally as the cable "spins" around its
                  length axis. This is what makes auto-spin VISIBLE. */}
              <pattern id="c3d-braid" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) translate(${yaw * 0.4}, 0)`}>
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
                <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
              </pattern>
              <pattern id="c3d-spiral" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(70) translate(${yaw * 0.3}, 0)`}>
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
              </pattern>
              <pattern id="c3d-striped" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`translate(${yaw * 0.6}, 0)`}>
                <line x1="0" y1="0" x2="14" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="2.4" />
                <line x1="0" y1="7" x2="14" y2="7" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              </pattern>
              <pattern id="c3d-spline" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform={`rotate(30) translate(${yaw * 0.4}, 0)`}>
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                <line x1="5" y1="0" x2="5" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
              </pattern>
              <pattern id="c3d-foil" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(15) translate(${yaw * 0.4}, 0)`}>
                <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(0,0,0,0.3)" strokeWidth="0.9" />
              </pattern>
              {/* Front-cap patterns — rotate these around the centre so the cross-
                  section's hatch APPEARS to spin with the cable. */}
              <pattern id="c3d-braid-cap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${45 + yaw})`}>
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
                <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
              </pattern>
              <pattern id="c3d-spiral-cap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${70 + yaw * 0.5})`}>
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
              </pattern>
              <pattern id="c3d-striped-cap" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(${yaw * 0.6})`}>
                <line x1="0" y1="0" x2="14" y2="0" stroke="rgba(0,0,0,0.4)" strokeWidth="2.4" />
              </pattern>
              <pattern id="c3d-spline-cap" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform={`rotate(${30 + yaw * 0.5})`}>
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                <line x1="5" y1="0" x2="5" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
              </pattern>
              <pattern id="c3d-foil-cap" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform={`rotate(${15 + yaw * 0.5})`}>
                <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(0,0,0,0.3)" strokeWidth="0.9" />
              </pattern>
            </defs>

            {/* In non-exploded mode the cable is one solid cylinder with a
                multi-ring cross-section visible at the front. In exploded mode
                each layer is rendered as its own short cylinder pushed apart
                along the cable axis. Two completely different render paths. */}
            {(() => {
              const visible = preset.layers
                .map((l, idx) => ({ l, idx }))
                .filter(({ idx }) => !hidden[idx])
              if (visible.length === 0) return null

              if (exploded) {
                // Each layer = its own little cylinder, spaced along x
                return visible.map(({ l, idx }, vi) => {
                  const r = baseR * l.to
                  const rPrev = idx === 0 ? 0 : baseR * (preset.layers[idx - 1]?.to || 0)
                  // Spread along x — each segment ~ 100 px wide
                  const segW = 95
                  const totalW = visible.length * segW
                  const segX = -totalW / 2 + vi * segW + segW / 2
                  return (
                    <ExplodedSegment
                      key={idx}
                      layer={l}
                      rOuter={r}
                      rInner={rPrev}
                      cx={segX}
                      width={segW * 0.78}
                      ryFor={ryFor}
                      litX={litX}
                    />
                  )
                })
              }

              // Non-exploded: single body + concentric front rings
              const outermost = visible[visible.length - 1].l
              const rOut = baseR * outermost.to
              const ryOut = ryFor(rOut)
              const lighter = mixHex(outermost.color, '#ffffff', 0.18)
              const darker = mixHex(outermost.color, '#000000', 0.45)
              const gradId = 'mainBodyGrad'
              const patternFill = patternForKind(outermost.kind)

              return (
                <>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="-1" x2="0" y2="1">
                      <stop offset="0%" stopColor={darker} />
                      <stop offset={`${litX * 100}%`} stopColor={lighter} />
                      <stop offset="100%" stopColor={darker} />
                    </linearGradient>
                  </defs>

                  {/* Back cap of the OUTER layer (dimmer) */}
                  <ellipse
                    cx={xBack} cy={0}
                    rx={rOut} ry={ryOut}
                    fill={mixHex(outermost.color, '#000', 0.6)}
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth="0.6"
                  />

                  {/* Body rectangle (outer layer color) */}
                  <rect
                    x={xBack} y={-ryOut}
                    width={xFront - xBack}
                    height={ryOut * 2}
                    fill={`url(#${gradId})`}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="0.5"
                  />
                  {patternFill && (
                    <rect
                      x={xBack} y={-ryOut}
                      width={xFront - xBack}
                      height={ryOut * 2}
                      fill={patternFill}
                      opacity="0.55"
                    />
                  )}
                  {/* Top edge highlight + bottom shadow */}
                  <line x1={xBack} y1={-ryOut} x2={xFront} y2={-ryOut} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
                  <line x1={xBack} y1={ryOut} x2={xFront} y2={ryOut} stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />

                  {/* Front cross-section: concentric ellipses, OUTERMOST first
                      so inner ones paint on top. Each ellipse fills its layer's
                      annulus (or a solid disc for the innermost). */}
                  {visible.slice().reverse().map(({ l, idx }) => {
                    const r = baseR * l.to
                    const ry = ryFor(r)
                    const lay_lighter = mixHex(l.color, '#ffffff', 0.22)
                    const pattern = patternForKind(l.kind, true)  // cap pattern rotates with yaw
                    const isCore = l.kind === 'core'
                    return (
                      <g key={`fc-${idx}`}>
                        <ellipse
                          cx={xFront} cy={0}
                          rx={r} ry={ry}
                          fill={lay_lighter}
                          stroke="rgba(0,0,0,0.55)"
                          strokeWidth={isCore ? 0.6 : 0.5}
                        />
                        {pattern && (
                          <ellipse
                            cx={xFront} cy={0}
                            rx={r} ry={ry}
                            fill={pattern}
                            opacity="0.5"
                            pointerEvents="none"
                          />
                        )}
                        {isCore && (
                          <ellipse
                            cx={xFront - r * 0.35} cy={-ry * 0.35}
                            rx={r * 0.18} ry={Math.max(2, ry * 0.22)}
                            fill="#fbbf24"
                            opacity="0.65"
                          />
                        )}
                      </g>
                    )
                  })}

                  {/* Layer labels on the body — only for the outermost (jacket) */}
                  {zoom >= 0.9 && (
                    <text
                      x={(xBack + xFront) / 2}
                      y={ryOut + 16}
                      fontSize="11"
                      fill={outermost.textColor || outermost.color}
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor="middle"
                      opacity="0.8"
                    >
                      {outermost.name}
                    </text>
                  )}
                </>
              )
            })()}
          </svg>

          {/* Overlay info */}
          <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>
            ◆ 3D · {preset.label}
          </div>
          <div className="absolute top-2 right-2 font-mono text-[10px]" style={{ color: C.textMuted }}>
            {preset.z0} · drag to rotate
          </div>
          <div className="absolute bottom-2 left-2 font-mono text-[9px]" style={{ color: C.textMuted }}>
            yaw {Math.round(yaw)}° · pitch {(pitch * 100).toFixed(0)}% · zoom {zoom.toFixed(1)}×
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#12171a] border border-[#252e33] rounded p-3 space-y-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: C.amber }}>Cable preset</div>
            <select
              value={presetId}
              onChange={(e) => { setPresetId(e.target.value); setHidden({}) }}
              className="w-full bg-[#0a0d0f] border border-[#252e33] rounded px-2 py-1.5 text-[12px] font-mono"
              style={{ color: C.amber }}
            >
              {Object.entries(PRESETS).map(([id, p]) => (
                <option key={id} value={id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.teal }}>Layers</div>
            {preset.layers.map((l, i) => (
              <button
                key={i}
                onClick={() => setHidden((h) => ({ ...h, [i]: !h[i] }))}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono hover:bg-[#171d20] text-left"
                style={{ color: hidden[i] ? C.textMuted : C.text, opacity: hidden[i] ? 0.5 : 1 }}
              >
                <span className="w-3 h-3 rounded-sm border" style={{ background: hidden[i] ? 'transparent' : l.color, borderColor: l.color }} />
                <span className="flex-1 truncate">{l.name}</span>
                {hidden[i] ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.copperBright }}>View</div>
            <SlideRow label="Zoom" value={zoom} onChange={setZoom} min={0.5} max={2.5} step={0.05} />
            <SlideRow label="Pitch" value={pitch} onChange={(v) => { setAutoSpin(false); setPitch(v) }} min={0} max={1} step={0.02} fmt={(v) => (v * 100).toFixed(0) + '%'} />
            <SlideRow label="Yaw" value={yaw} onChange={(v) => { setAutoSpin(false); setYaw(v) }} min={-360} max={360} step={1} fmt={(v) => Math.round(v) + '°'} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAutoSpin((v) => !v)}
              className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: autoSpin ? C.teal + '60' : C.borderHi, color: autoSpin ? C.teal : C.textDim }}
            >
              {autoSpin ? '⏸ Pause spin' : '▶ Auto-spin'}
            </button>
            <button
              onClick={() => setExploded((v) => !v)}
              className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: exploded ? C.amber + '60' : C.borderHi, color: exploded ? C.amber : C.textDim }}
            >
              <LayersIcon size={11} className="inline mr-1" /> {exploded ? 'Collapse' : 'Explode'}
            </button>
            <button
              onClick={reset}
              className="col-span-2 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent"
              style={{ borderColor: C.borderHi, color: C.textDim }}
            >
              <RotateCcw size={11} className="inline mr-1" /> Reset view
            </button>
          </div>
        </div>
      </div>

      {/* Legend / engineering note */}
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 text-[12px] leading-relaxed" style={{ color: C.textDim }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: C.teal }}>How to use</div>
        Drag horizontally to spin the cable around its length axis (yaw). Drag vertically to tilt between head-on (full cross-section circles) and side-on (flat barrel). Click <span className="text-[#fbbf24]">Explode</span> to space layers apart along the cable axis so each layer's contribution is visible. Toggle individual layers off to peek inside.
      </div>
    </section>
  )
}

function patternForKind(kind, isCap = false) {
  const suf = isCap ? '-cap' : ''
  switch (kind) {
    case 'braid':   return `url(#c3d-braid${suf})`
    case 'spiral':  return `url(#c3d-spiral${suf})`
    case 'striped': return `url(#c3d-striped${suf})`
    case 'spline':  return `url(#c3d-spline${suf})`
    case 'foil':    return `url(#c3d-foil${suf})`
    default: return null
  }
}

// In Explode mode each layer becomes a tiny stand-alone cylinder showing
// (a) its annular cross-section on the front, (b) its body, (c) its back cap.
// All laid out in a row with labels underneath.
function ExplodedSegment({ layer, rOuter, rInner, cx, width, ryFor, litX }) {
  const ryOut = ryFor(rOuter)
  const ryIn = ryFor(rInner)
  const xL = cx - width / 2
  const xR = cx + width / 2
  const lighter = mixHex(layer.color, '#ffffff', 0.20)
  const darker = mixHex(layer.color, '#000000', 0.45)
  const pattern = patternForKind(layer.kind)
  const isCore = layer.kind === 'core'
  const gradId = `expGrad-${cx | 0}`
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor={darker} />
          <stop offset={`${litX * 100}%`} stopColor={lighter} />
          <stop offset="100%" stopColor={darker} />
        </linearGradient>
      </defs>
      {/* Back cap */}
      <ellipse
        cx={xL} cy={0}
        rx={rOuter} ry={ryOut}
        fill={mixHex(layer.color, '#000', 0.55)}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="0.6"
      />
      {/* Body */}
      <rect
        x={xL} y={-ryOut}
        width={xR - xL}
        height={ryOut * 2}
        fill={`url(#${gradId})`}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="0.5"
      />
      {pattern && (
        <rect
          x={xL} y={-ryOut}
          width={xR - xL}
          height={ryOut * 2}
          fill={pattern}
          opacity="0.55"
        />
      )}
      <line x1={xL} y1={-ryOut} x2={xR} y2={-ryOut} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
      <line x1={xL} y1={ryOut} x2={xR} y2={ryOut} stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />
      {/* Front cap: outer ring */}
      <ellipse
        cx={xR} cy={0}
        rx={rOuter} ry={ryOut}
        fill={lighter}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="0.8"
      />
      {pattern && (
        <ellipse cx={xR} cy={0} rx={rOuter} ry={ryOut} fill={pattern} opacity="0.45" pointerEvents="none" />
      )}
      {/* Inner cutout on front cap (annulus) */}
      {!isCore && rInner > 0 && (
        <ellipse
          cx={xR} cy={0}
          rx={rInner} ry={ryIn}
          fill="#0a0d0f"
        />
      )}
      {isCore && (
        <ellipse
          cx={xR - rOuter * 0.35} cy={-ryOut * 0.35}
          rx={rOuter * 0.18} ry={Math.max(2, ryOut * 0.22)}
          fill="#fbbf24"
          opacity="0.65"
        />
      )}
      {/* Label below */}
      <text
        x={cx}
        y={ryOut + 16}
        fontSize="10"
        fill={layer.textColor || layer.color}
        fontFamily="JetBrains Mono, monospace"
        textAnchor="middle"
        opacity="0.85"
      >
        {layer.name}
      </text>
    </g>
  )
}

function SlideRow({ label, value, onChange, min, max, step, fmt }) {
  return (
    <div className="flex items-center gap-2">
      <label className="font-mono text-[10px] uppercase tracking-wider w-12 shrink-0" style={{ color: C.textMuted }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1"
        style={{ accentColor: C.copper }}
      />
      <span className="font-mono text-[10px] w-12 text-right" style={{ color: C.amber }}>
        {fmt ? fmt(value) : Number(value).toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  )
}

// ── Color helpers ──
function mixHex(a, b, t) {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const r = Math.round(pa.r * (1 - t) + pb.r * t)
  const g = Math.round(pa.g * (1 - t) + pb.g * t)
  const bl = Math.round(pa.b * (1 - t) + pb.b * t)
  return `rgb(${r}, ${g}, ${bl})`
}
function parseHex(s) {
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

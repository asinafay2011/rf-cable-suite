import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Layers, RotateCcw, ShieldCheck, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const C = {
  bg: '#090d0e',
  panel: '#101619',
  panelHi: '#151d20',
  border: '#243138',
  borderHi: '#3a4a52',
  text: '#f0ebe2',
  dim: '#a7b0b6',
  muted: '#6f7a80',
  amber: '#fbbf24',
  copper: '#d97706',
  copperHi: '#fb923c',
  teal: '#5eead4',
  sky: '#7dd3fc',
  red: '#f87171',
  purple: '#a78bfa',
  foil: '#d9d3bf',
  braid: '#c8c0aa',
}

const PRESETS = {
  phaseStable: {
    label: 'Phase-stable RF coax',
    conductorOD: 0.92,
    ptfeLayers: 9,
    ptfeMil: 2,
    ptfeWidth: 6.0,
    ptfeOverlap: 50,
    ptfeDensity: 0.78,
    suckout: 6,
    spiralWidth: 1.0,
    spiralGap: 12,
    spiralBobbins: 8,
    helicalWidth: 1.4,
    helicalGap: 8,
    helicalBobbins: 6,
    foilOverlap: 25,
    braidCoverage: 92,
    jacketOD: 6.6,
    freqGHz: 18,
  },
  lowSuckout: {
    label: 'Low-suckout staggered build',
    conductorOD: 0.92,
    ptfeLayers: 10,
    ptfeMil: 1.5,
    ptfeWidth: 7.2,
    ptfeOverlap: 47,
    ptfeDensity: 0.72,
    suckout: 2,
    spiralWidth: 0.9,
    spiralGap: 8,
    spiralBobbins: 8,
    helicalWidth: 1.2,
    helicalGap: 7,
    helicalBobbins: 8,
    foilOverlap: 32,
    braidCoverage: 95,
    jacketOD: 6.3,
    freqGHz: 26.5,
  },
  ruggedShield: {
    label: 'Rugged shield stack',
    conductorOD: 1.02,
    ptfeLayers: 8,
    ptfeMil: 2.5,
    ptfeWidth: 6.5,
    ptfeOverlap: 55,
    ptfeDensity: 0.86,
    suckout: 9,
    spiralWidth: 1.4,
    spiralGap: 6,
    spiralBobbins: 8,
    helicalWidth: 1.6,
    helicalGap: 6,
    helicalBobbins: 8,
    foilOverlap: 35,
    braidCoverage: 97,
    jacketOD: 7.2,
    freqGHz: 12,
  },
}

const PTFE_SOLID_DENSITY = 2.15
const PTFE_SOLID_EPS = 2.1
const MIL_TO_MM = 0.0254

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function densityToEps(density) {
  const vf = clamp(density / PTFE_SOLID_DENSITY, 0, 1)
  const epsThird = vf * Math.cbrt(PTFE_SOLID_EPS) + (1 - vf)
  return epsThird ** 3
}

function z0From(conductorOD, dielectricOD, eps) {
  return (60 / Math.sqrt(eps)) * Math.log(Math.max(dielectricOD, conductorOD + 0.01) / conductorOD)
}

function pitchFrom(width, overlapPct, cableOD, bobbins = 1) {
  const o = clamp(overlapPct / 100, -0.5, 0.95)
  const circ = Math.PI * Math.max(cableOD, 0.5)
  const sinGamma = clamp(width / circ, 0.02, 0.95)
  const cosGamma = Math.sqrt(1 - sinGamma * sinGamma)
  return Math.max(0.01, (width * (1 - o) * cosGamma) / Math.max(1, bobbins))
}

function notchGHz(pitchMm, vp) {
  return (150000 * vp) / pitchMm / 1000
}

function rlToVswr(rlDb) {
  const gamma = 10 ** (-rlDb / 20)
  return (1 + gamma) / Math.max(0.001, 1 - gamma)
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function overlapToPct(value) {
  if (typeof value === 'number') return clamp(value * 100, 0, 80)
  if (value === 'butt') return 0
  if (value === '1/2') return 50
  if (value === '2/3') return 67
  if (value === '3/4') return 75
  return 50
}

function useRfStackModel() {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('Loading macro GLB')

  useEffect(() => {
    let alive = true
    let frameId = 0
    let renderer = null
    let scene = null
    let camera = null
    let modelGroup = null
    let resizeObserver = null
    const disposables = []
    const pointer = { down: false, x: 0, y: 0 }

    const disposeMaterial = (material) => {
      if (!material) return
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && value.isTexture) value.dispose()
      }
      material.dispose?.()
    }

    const disposeObject = (object) => {
      object?.traverse?.((node) => {
        node.geometry?.dispose?.()
        if (Array.isArray(node.material)) node.material.forEach(disposeMaterial)
        else disposeMaterial(node.material)
      })
    }

    const run = async () => {
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
        ])
        if (!alive || !mountRef.current) return

        const mount = mountRef.current
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.domElement.dataset.testid = 'rf-stack-lab-macro-canvas'
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.display = 'block'
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        modelGroup = new THREE.Group()
        modelGroup.rotation.set(-0.15, 0.18, 0.02)
        scene.add(modelGroup)

        camera = new THREE.PerspectiveCamera(32, 1, 0.01, 120)
        camera.position.set(0, 0.18, 6.35)
        scene.add(camera)

        const ambient = new THREE.HemisphereLight(0xf4eadc, 0x11191b, 1.55)
        const key = new THREE.DirectionalLight(0xffffff, 3.4)
        key.position.set(-3.8, 4.4, 5.5)
        const rim = new THREE.DirectionalLight(0xf59e0b, 1.5)
        rim.position.set(4.5, -1.4, 2.8)
        scene.add(ambient, key, rim)
        disposables.push(ambient, key, rim)

        const resize = () => {
          if (!mount || !renderer || !camera) return
          const rect = mount.getBoundingClientRect()
          const width = Math.max(340, Math.floor(rect.width || 760))
          const height = Math.max(300, Math.floor(rect.height || 460))
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
        }
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(mount)
        resize()

        const onPointerDown = (event) => {
          pointer.down = true
          pointer.x = event.clientX
          pointer.y = event.clientY
          renderer.domElement.setPointerCapture?.(event.pointerId)
        }
        const onPointerMove = (event) => {
          if (!pointer.down || !modelGroup) return
          const dx = event.clientX - pointer.x
          const dy = event.clientY - pointer.y
          pointer.x = event.clientX
          pointer.y = event.clientY
          modelGroup.rotation.y += dx * 0.008
          modelGroup.rotation.x = clamp(modelGroup.rotation.x + dy * 0.005, -0.78, 0.46)
        }
        const onPointerUp = () => { pointer.down = false }
        renderer.domElement.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        disposables.push({ dispose: () => {
          renderer?.domElement?.removeEventListener('pointerdown', onPointerDown)
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerUp)
        } })

        new GLTFLoader().load(
          '/models/rf-stack-lab-macro.glb',
          (gltf) => {
            if (!alive) return
            const root = gltf.scene
            root.traverse((node) => {
              if (!node.isMesh || !node.material) return
              node.castShadow = true
              node.receiveShadow = true
              const mats = Array.isArray(node.material) ? node.material : [node.material]
              mats.forEach((mat) => {
                if (/foil|flatwire|braid|conductor|shield/i.test(`${node.name} ${mat.name}`)) {
                  mat.side = THREE.DoubleSide
                  mat.transparent = false
                  mat.depthWrite = true
                  mat.metalness = Math.max(mat.metalness ?? 0.4, 0.55)
                  mat.roughness = Math.max(mat.roughness ?? 0.25, 0.18)
                }
                mat.needsUpdate = true
              })
            })
            const box = new THREE.Box3().setFromObject(root)
            const center = box.getCenter(new THREE.Vector3())
            const size = box.getSize(new THREE.Vector3())
            root.position.sub(center)
            const scale = 3.9 / Math.max(size.x, size.y, size.z, 0.001)
            root.scale.setScalar(scale)
            modelGroup.add(root)
            setStatus('')
          },
          undefined,
          () => alive && setStatus('Macro GLB failed to load')
        )

        const animate = () => {
          if (!alive || !renderer || !scene || !camera) return
          if (modelGroup && !pointer.down) modelGroup.rotation.y += 0.0015
          renderer.render(scene, camera)
          frameId = requestAnimationFrame(animate)
        }
        animate()
      } catch {
        if (alive) setStatus('WebGL unavailable')
      }
    }

    run()

    return () => {
      alive = false
      cancelAnimationFrame(frameId)
      resizeObserver?.disconnect?.()
      disposables.forEach((item) => item.dispose?.())
      if (modelGroup) disposeObject(modelGroup)
      renderer?.dispose?.()
      renderer?.domElement?.remove?.()
    }
  }, [])

  return { mountRef, status }
}

function Slider({ label, value, setValue, min, max, step = 1, unit = '', accent = C.amber }) {
  return (
    <label style={S.slider}>
      <span style={S.sliderTop}>
        <span>{label}</span>
        <strong style={{ color: accent }}>{fmt(value, step < 1 ? 2 : 0)}{unit}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ accentColor: accent }}
      />
    </label>
  )
}

function Metric({ label, value, sub, accent = C.teal }) {
  return (
    <div style={S.metric}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color: accent }}>{value}</div>
      {sub && <div style={S.metricSub}>{sub}</div>}
    </div>
  )
}

function LayerRail({ computed }) {
  const states = [
    ['01', 'Conductor', `${fmt(computed.conductorOD, 2)} mm Cu`, C.copperHi],
    ['02', 'PTFE tape', `${computed.ptfeLayers}x ${fmt(computed.ptfeMil, 1)} mil`, '#fff2c4'],
    ['03', 'SPC spiral', `${computed.spiralBobbins} bobbins · ${fmt(computed.spiralCoverage, 0)}%`, C.foil],
    ['04', 'SPC helical', `${computed.helicalBobbins} bobbins · ${fmt(computed.helicalCoverage, 0)}%`, C.sky],
    ['05', 'Foil shield', `${fmt(computed.foilCoverage, 0)}% seam`, C.foil],
    ['06', 'Braid', `${fmt(computed.braidCoverage, 0)}% coverage`, C.braid],
    ['07', 'Jacket', `${fmt(computed.jacketOD, 1)} mm OD`, C.sky],
  ]
  return (
    <div style={S.layerRail}>
      {states.map(([num, label, sub, color]) => (
        <div key={num} style={{ ...S.layerChip, borderColor: `${color}55` }}>
          <span style={S.layerNum}>{num}</span>
          <span style={{ ...S.layerDot, background: color }} />
          <span style={S.layerText}>
            <strong>{label}</strong>
            <small>{sub}</small>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function RFStackLab() {
  const [params, setParams] = useState(PRESETS.phaseStable)
  const [activePreset, setActivePreset] = useState('phaseStable')
  const { mountRef, status } = useRfStackModel()

  const setParam = (key) => (value) => {
    setParams((current) => ({ ...current, [key]: value }))
    setActivePreset('')
  }

  const loadPreset = (key) => {
    setActivePreset(key)
    setParams(PRESETS[key])
  }

  useEffect(() => {
    const onApplyPreset = (event) => {
      const detail = event.detail || {}
      if (detail.section !== 'stack' && detail.section !== 'dielectric') return
      const preset = detail.params || {}
      const layers = Array.isArray(preset.layers) ? preset.layers : []
      const totalPasses = layers.reduce((sum, layer) => sum + Math.max(1, Number(layer.passes) || 1), 0)
      const firstLayer = layers[0] || {}
      const avgDensity = layers.length
        ? layers.reduce((sum, layer) => sum + (Number(layer.density) || 0.78) * Math.max(1, Number(layer.passes) || 1), 0) / Math.max(1, totalPasses)
        : 0.78
      setParams((current) => ({
        ...current,
        conductorOD: Number(preset.conductor_od_mm) || current.conductorOD,
        ptfeLayers: clamp(Math.round(totalPasses || current.ptfeLayers), 1, 16),
        ptfeMil: firstLayer.tape_thickness_mm ? clamp(firstLayer.tape_thickness_mm / MIL_TO_MM, 0.5, 5) : current.ptfeMil,
        ptfeWidth: firstLayer.tape_width_mm ? clamp(firstLayer.tape_width_mm, 2, 14) : current.ptfeWidth,
        ptfeOverlap: clamp(overlapToPct(firstLayer.overlap), 0, 80),
        ptfeDensity: clamp(avgDensity || current.ptfeDensity, 0.45, 1.65),
      }))
      setActivePreset('')
    }
    window.addEventListener('cable-suite:apply-preset', onApplyPreset)
    return () => window.removeEventListener('cable-suite:apply-preset', onApplyPreset)
  }, [])

  const computed = useMemo(() => {
    const ptfeThickness = params.ptfeMil * MIL_TO_MM
    const overlapBuild = 1 + clamp(params.ptfeOverlap / 100, 0, 0.9)
    const tension = 1 - params.suckout / 180
    const dielectricWall = params.ptfeLayers * ptfeThickness * overlapBuild * tension
    const dielectricOD = params.conductorOD + 2 * dielectricWall
    const eps = densityToEps(params.ptfeDensity) * (1 + params.suckout * 0.0018)
    const vp = 1 / Math.sqrt(eps)
    const z0 = z0From(params.conductorOD, dielectricOD, eps)
    const pitchTape = pitchFrom(params.ptfeWidth, params.ptfeOverlap, dielectricOD, 1)
    const spiralGap = -Math.abs(params.spiralGap)
    const helicalGap = -Math.abs(params.helicalGap)
    const pitchSpiral = pitchFrom(params.spiralWidth, spiralGap, dielectricOD + 0.25, params.spiralBobbins)
    const pitchHelical = pitchFrom(params.helicalWidth, helicalGap, dielectricOD + 0.48, params.helicalBobbins)
    const tapeNotch = notchGHz(pitchTape, vp)
    const spiralNotch = notchGHz(pitchSpiral, vp)
    const helicalNotch = notchGHz(pitchHelical, vp)
    const circ = Math.PI * (dielectricOD + 0.3)
    const spiralCoverage = clamp((params.spiralBobbins * params.spiralWidth * (1 - params.spiralGap / 160)) / circ * 100, 0, 100)
    const helicalCoverage = clamp((params.helicalBobbins * params.helicalWidth * (1 - params.helicalGap / 170)) / circ * 100, 0, 100)
    const foilCoverage = clamp(100 - Math.max(0, 18 - params.foilOverlap) * 1.6, 82, 100)
    const shieldCoverage = clamp(100 * (1 - (1 - spiralCoverage / 100) * (1 - helicalCoverage / 100) * (1 - foilCoverage / 100) * (1 - params.braidCoverage / 100)), 0, 100)
    const shieldDb = 24 + shieldCoverage * 0.82 + Math.log10(Math.max(1, params.freqGHz)) * 4
    const zError = Math.abs(z0 - 50)
    const worstRl = clamp(34 - zError * 1.7 - params.suckout * 0.26 - Math.max(0, 92 - shieldCoverage) * 0.08, 6, 42)
    const vswr = rlToVswr(worstRl)
    const baseLoss = 0.16 * Math.sqrt(params.freqGHz) + 0.018 * params.freqGHz + (params.ptfeDensity - 0.7) * 0.15
    const suckoutDepth = params.suckout * 0.24 + Math.max(0, 50 - params.ptfeOverlap) * 0.04
    return {
      ...params,
      ptfeThickness,
      dielectricOD,
      eps,
      vp,
      z0,
      pitchTape,
      pitchSpiral,
      pitchHelical,
      tapeNotch,
      spiralNotch,
      helicalNotch,
      spiralCoverage,
      helicalCoverage,
      foilCoverage,
      shieldCoverage,
      shieldDb,
      worstRl,
      vswr,
      baseLoss,
      suckoutDepth,
    }
  }, [params])

  const traces = useMemo(() => {
    const rl = []
    const il = []
    const tdr = []
    for (let i = 0; i < 180; i++) {
      const t = i / 179
      const f = 0.2 * (params.freqGHz * 2 / 0.2) ** t
      const notch = [computed.tapeNotch, computed.spiralNotch, computed.helicalNotch].reduce((sum, nf, index) => {
        const sigma = Math.max(0.08, nf * (index ? 0.045 : 0.035))
        const dx = (f - nf) / sigma
        return sum + (computed.suckoutDepth / (index + 1.2)) * Math.exp(-dx * dx)
      }, 0)
      const loss = computed.baseLoss * Math.sqrt(f / Math.max(0.2, params.freqGHz)) + notch
      const localRl = clamp(computed.worstRl - notch * 1.2 + 2.5 * Math.sin(t * Math.PI), 4, 44)
      il.push({ f, v: -loss })
      rl.push({ f, v: -localRl })
    }
    for (let i = 0; i < 160; i++) {
      const x = i / 159
      const dielectricDx = (x - 0.35) / 0.12
      const shieldDx = (x - 0.72) / 0.08
      const bump = 50 + (computed.z0 - 50) * Math.exp(-(dielectricDx * dielectricDx)) + computed.suckout * 0.045 * Math.sin(x * 42)
      const shieldStep = (100 - computed.shieldCoverage) * 0.012 * Math.exp(-(shieldDx * shieldDx))
      tdr.push({ x: x * 100, z: bump + shieldStep })
    }
    return { rl, il, tdr }
  }, [computed, params.freqGHz])

  return (
    <section style={S.root} data-testid="rf-stack-lab">
      <header style={S.hero}>
        <div style={S.heroIcon}><Layers size={20} /></div>
        <div>
          <div style={S.eyebrow}>RF Stack Lab</div>
          <h1 style={S.title}>Build the cable, then validate the RF symptoms.</h1>
          <p style={S.copy}>
            One workspace for PTFE tape build-up, SPC flatwire shields, foil/braid coverage, Bragg suckout, impedance, return loss, VSWR, insertion loss, and TDR.
          </p>
        </div>
      </header>

      <div style={S.grid}>
        <div style={S.viewerCard}>
          <div style={S.cardHead}>
            <div>
              <div style={S.cardEyebrow}>Macro GLB / Three.js</div>
              <h2 style={S.cardTitle}>Conductor → PTFE → flatwire → foil → braid</h2>
            </div>
            <div style={S.liveBadge}>live model</div>
          </div>
          <div style={S.viewerStage}>
            <div ref={mountRef} style={S.viewerMount} />
            {status && <div style={S.viewerStatus}>{status}</div>}
          </div>
          <LayerRail computed={computed} />
        </div>

        <div style={S.controlsCard}>
          <div style={S.cardHead}>
            <div>
              <div style={S.cardEyebrow}>Build recipe</div>
              <h2 style={S.cardTitle}>Layer controls</h2>
            </div>
            <button type="button" style={S.resetBtn} onClick={() => loadPreset('phaseStable')}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          <div style={S.presets}>
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => loadPreset(key)}
                style={{ ...S.presetBtn, ...(activePreset === key ? S.presetBtnActive : {}) }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={S.controlSections}>
            <div style={S.controlBlock}>
              <div style={S.blockTitle}><Zap size={13} /> Conductor + PTFE</div>
              <Slider label="Conductor OD" value={params.conductorOD} setValue={setParam('conductorOD')} min={0.2} max={2.2} step={0.01} unit=" mm" accent={C.copperHi} />
              <Slider label="PTFE layers" value={params.ptfeLayers} setValue={setParam('ptfeLayers')} min={1} max={16} step={1} accent="#fff2c4" />
              <Slider label="PTFE tape" value={params.ptfeMil} setValue={setParam('ptfeMil')} min={0.5} max={5} step={0.1} unit=" mil" accent="#fff2c4" />
              <Slider label="PTFE width" value={params.ptfeWidth} setValue={setParam('ptfeWidth')} min={2} max={14} step={0.1} unit=" mm" accent="#fff2c4" />
              <Slider label="PTFE density" value={params.ptfeDensity} setValue={setParam('ptfeDensity')} min={0.45} max={1.65} step={0.01} unit=" g/cc" accent={C.sky} />
              <Slider label="Tape overlap" value={params.ptfeOverlap} setValue={setParam('ptfeOverlap')} min={0} max={80} step={1} unit="%" accent={C.amber} />
              <Slider label="Tape suckout" value={params.suckout} setValue={setParam('suckout')} min={0} max={24} step={1} unit="%" accent={params.suckout > 12 ? C.red : C.amber} />
            </div>

            <div style={S.controlBlock}>
              <div style={S.blockTitle}><ShieldCheck size={13} /> Shields</div>
              <Slider label="SPC spiral width" value={params.spiralWidth} setValue={setParam('spiralWidth')} min={0.4} max={2.2} step={0.05} unit=" mm" accent={C.foil} />
              <Slider label="Spiral bobbins" value={params.spiralBobbins} setValue={setParam('spiralBobbins')} min={1} max={12} step={1} accent={C.foil} />
              <Slider label="Spiral gap" value={params.spiralGap} setValue={setParam('spiralGap')} min={0} max={28} step={1} unit="%" accent={C.sky} />
              <Slider label="SPC helical width" value={params.helicalWidth} setValue={setParam('helicalWidth')} min={0.4} max={2.6} step={0.05} unit=" mm" accent={C.foil} />
              <Slider label="Helical bobbins" value={params.helicalBobbins} setValue={setParam('helicalBobbins')} min={1} max={12} step={1} accent={C.sky} />
              <Slider label="Helical gap" value={params.helicalGap} setValue={setParam('helicalGap')} min={0} max={28} step={1} unit="%" accent={C.sky} />
              <Slider label="Foil overlap" value={params.foilOverlap} setValue={setParam('foilOverlap')} min={0} max={55} step={1} unit="%" accent={C.foil} />
              <Slider label="Braid coverage" value={params.braidCoverage} setValue={setParam('braidCoverage')} min={65} max={99} step={1} unit="%" accent={C.braid} />
              <Slider label="Test frequency" value={params.freqGHz} setValue={setParam('freqGHz')} min={0.9} max={40} step={0.1} unit=" GHz" accent={C.teal} />
            </div>
          </div>
        </div>
      </div>

      <div style={S.metrics}>
        <Metric label="Z0" value={`${fmt(computed.z0, 1)} Ω`} sub={`target delta ${fmt(computed.z0 - 50, 1)} Ω`} accent={Math.abs(computed.z0 - 50) > 4 ? C.red : C.teal} />
        <Metric label="Velocity factor" value={`${fmt(computed.vp * 100, 1)}%`} sub={`εr eff ${fmt(computed.eps, 3)}`} accent={C.sky} />
        <Metric label="Worst RL" value={`${fmt(computed.worstRl, 1)} dB`} sub={`VSWR ${fmt(computed.vswr, 2)}`} accent={computed.worstRl < 14 ? C.red : C.amber} />
        <Metric label="Insertion loss" value={`${fmt(computed.baseLoss, 2)} dB/m`} sub={`at ${fmt(params.freqGHz, 1)} GHz`} accent={C.amber} />
        <Metric label="Shield coverage" value={`${fmt(computed.shieldCoverage, 1)}%`} sub={`${fmt(computed.shieldDb, 0)} dB est. SE`} accent={computed.shieldCoverage < 94 ? C.red : C.teal} />
        <Metric label="Primary suckout" value={`${fmt(Math.min(computed.tapeNotch, computed.spiralNotch, computed.helicalNotch), 2)} GHz`} sub="first Bragg marker" accent={C.purple} />
      </div>

      <div style={S.chartGrid}>
        <ChartCard title="Insertion loss / suckout" sub="S21 with pitch-driven notches" data={traces.il} yKey="v" color={C.amber} yDomain={['auto', 0]} yFmt={(v) => `${fmt(v, 0)} dB`} />
        <ChartCard title="Return loss / VSWR" sub="notches convert to RL ripple" data={traces.rl} yKey="v" color={C.teal} yDomain={['auto', 0]} yFmt={(v) => `${fmt(v, 0)} dB`} />
        <ChartCard title="TDR impedance trace" sub="dielectric build + shield discontinuities" data={traces.tdr} xKey="x" yKey="z" color={C.sky} xFmt={(v) => `${fmt(v, 0)}%`} yFmt={(v) => `${fmt(v, 0)} Ω`} domainX={[0, 100]} domainY={[42, 62]} referenceY={50} />
      </div>

      <div style={S.notes}>
        <div style={S.noteTitle}><Activity size={13} /> Interpretation</div>
        <p>
          PTFE is the dielectric wrap, not a shield. The RF shields start at SPC flatwire spiral/helical layers, then foil, then braid. Coverage is compounded as independent leak paths, so foil + braid + flatwire rapidly pushes shielding effectiveness up.
        </p>
        <p>
          Tape suckout is still here, but now it is tied to the same build recipe: changing PTFE overlap, suckout, flatwire pitch, or braid coverage updates Z0, TDR, insertion loss, return loss, VSWR, and coverage together.
        </p>
      </div>
    </section>
  )
}

function ChartCard({ title, sub, data, xKey = 'f', yKey, color, xFmt, yFmt, yDomain, domainX, domainY, referenceY }) {
  return (
    <div style={S.chartCard}>
      <div style={S.chartHead}>
        <div>
          <div style={S.cardEyebrow}>{title}</div>
          <div style={S.chartSub}>{sub}</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="rgba(94,234,212,0.08)" strokeDasharray="2 4" />
          <XAxis
            dataKey={xKey}
            type="number"
            domain={domainX || ['auto', 'auto']}
            stroke={C.muted}
            tick={{ fontSize: 10 }}
            tickFormatter={xFmt || ((v) => (v >= 1 ? `${fmt(v, 1)}G` : `${fmt(v * 1000, 0)}M`))}
          />
          <YAxis
            stroke={C.muted}
            tick={{ fontSize: 10 }}
            domain={domainY || yDomain || ['auto', 'auto']}
            tickFormatter={yFmt}
          />
          <Tooltip
            contentStyle={{ background: '#070b0c', border: '1px solid #243138', borderRadius: 3, color: C.text, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            formatter={(v) => [yFmt ? yFmt(v) : fmt(v, 2), title]}
            labelFormatter={(v) => (xFmt ? xFmt(v) : `${fmt(v, 2)} GHz`)}
          />
          {referenceY != null && <ReferenceLine y={referenceY} stroke={C.amber} strokeDasharray="4 4" />}
          <Line type="monotone" dataKey={yKey} stroke={color} dot={false} strokeWidth={1.8} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const S = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  hero: { border: `1px solid ${C.border}`, background: 'linear-gradient(135deg, rgba(15,22,24,0.98), rgba(22,11,6,0.78))', padding: 18, borderRadius: 3, display: 'flex', gap: 14, alignItems: 'flex-start' },
  heroIcon: { width: 42, height: 42, border: `1px solid ${C.borderHi}`, display: 'grid', placeItems: 'center', color: C.amber, flex: '0 0 auto' },
  eyebrow: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 4, color: C.copperHi, marginBottom: 6 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 400, lineHeight: 1.02, margin: 0, color: C.text },
  copy: { maxWidth: 780, color: C.dim, fontSize: 13, lineHeight: 1.7, margin: '10px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 },
  viewerCard: { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 3, overflow: 'hidden' },
  controlsCard: { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 3, padding: 14 },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 14, borderBottom: `1px solid rgba(167,176,182,0.13)` },
  cardEyebrow: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: C.copperHi, textTransform: 'uppercase', letterSpacing: 3 },
  cardTitle: { margin: '4px 0 0', color: C.text, fontSize: 18, fontWeight: 500 },
  liveBadge: { fontFamily: 'JetBrains Mono, monospace', color: C.teal, border: `1px solid ${C.teal}66`, padding: '5px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.6 },
  viewerStage: { height: 520, background: 'radial-gradient(circle at 45% 38%, rgba(94,234,212,0.08), transparent 42%), #071011', position: 'relative' },
  viewerMount: { width: '100%', height: '100%' },
  viewerStatus: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 },
  layerRail: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, padding: 12, borderTop: `1px solid rgba(167,176,182,0.12)` },
  layerChip: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid', background: '#080d0f', padding: 8, minWidth: 0 },
  layerNum: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: C.muted },
  layerDot: { width: 10, height: 10, borderRadius: 2, boxShadow: '0 0 14px currentColor', flex: '0 0 auto' },
  layerText: { minWidth: 0, display: 'grid', gap: 2 },
  presets: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 },
  presetBtn: { background: '#070b0c', border: `1px solid ${C.border}`, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 7px', cursor: 'pointer' },
  presetBtnActive: { borderColor: C.amber, color: C.amber, background: 'rgba(251,191,36,0.11)' },
  resetBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.dim, padding: '7px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', cursor: 'pointer' },
  controlSections: { display: 'grid', gap: 12 },
  controlBlock: { border: `1px solid rgba(167,176,182,0.13)`, background: '#080d0f', padding: 12, display: 'grid', gap: 11 },
  blockTitle: { display: 'flex', alignItems: 'center', gap: 8, color: C.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  slider: { display: 'grid', gap: 6, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.3 },
  sliderTop: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 },
  metric: { border: `1px solid ${C.border}`, background: C.panel, padding: 12, borderRadius: 3, minHeight: 94 },
  metricLabel: { color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  metricValue: { fontFamily: 'JetBrains Mono, monospace', fontSize: 24, marginTop: 9 },
  metricSub: { color: C.muted, fontSize: 11, marginTop: 5 },
  chartGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 12 },
  chartCard: { border: `1px solid ${C.border}`, background: C.panel, padding: 12, borderRadius: 3 },
  chartHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  chartSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  notes: { border: `1px solid ${C.border}`, background: C.panel, padding: 14, color: C.dim, lineHeight: 1.7, fontSize: 12, borderRadius: 3 },
  noteTitle: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 },
}

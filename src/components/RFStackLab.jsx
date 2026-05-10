import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Layers, Play, Plus, RotateCcw, ShieldCheck, Trash2, Zap } from 'lucide-react'
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
    ptfeStack: [
      { passes: 4, mil: 2.0, width: 6.0, overlap: 50, density: 0.78, direction: 'Z' },
      { passes: 3, mil: 1.5, width: 4.8, overlap: 54, density: 0.72, direction: 'S' },
      { passes: 2, mil: 1.0, width: 3.2, overlap: 45, density: 0.86, direction: 'Z' },
    ],
    suckout: 6,
    spiralWidth: 1.0,
    spiralGap: 12,
    spiralBobbins: 8,
    helicalWidth: 1.4,
    helicalOverlap: 45,
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
    ptfeStack: [
      { passes: 4, mil: 1.5, width: 7.2, overlap: 47, density: 0.70, direction: 'Z' },
      { passes: 3, mil: 1.2, width: 5.6, overlap: 53, density: 0.72, direction: 'S' },
      { passes: 3, mil: 1.0, width: 3.8, overlap: 42, density: 0.75, direction: 'Z' },
    ],
    suckout: 2,
    spiralWidth: 0.9,
    spiralGap: 8,
    spiralBobbins: 8,
    helicalWidth: 1.2,
    helicalOverlap: 50,
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
    ptfeStack: [
      { passes: 3, mil: 2.5, width: 6.5, overlap: 55, density: 0.86, direction: 'Z' },
      { passes: 3, mil: 2.0, width: 5.0, overlap: 58, density: 0.86, direction: 'S' },
      { passes: 2, mil: 1.5, width: 3.6, overlap: 50, density: 0.92, direction: 'Z' },
    ],
    suckout: 9,
    spiralWidth: 1.4,
    spiralGap: 6,
    spiralBobbins: 8,
    helicalWidth: 1.6,
    helicalOverlap: 55,
    foilOverlap: 35,
    braidCoverage: 97,
    jacketOD: 7.2,
    freqGHz: 12,
  },
}

const PTFE_SOLID_DENSITY = 2.15
const PTFE_SOLID_EPS = 2.1
const MIL_TO_MM = 0.0254
const MM_PER_IN = 25.4

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

function displayMm(valueMm, unitMode) {
  return unitMode === 'inch' ? valueMm / MM_PER_IN : valueMm
}

function unitSuffix(unitMode) {
  return unitMode === 'inch' ? ' in' : ' mm'
}

function unitDigits(unitMode, mmStep = 0.1) {
  return unitMode === 'inch' ? 3 : (mmStep < 1 ? 2 : 0)
}

function spiralPitchFromGap(gapPct, widthMm) {
  return clamp(Math.max(widthMm, 0.1) * 14 * (1 + clamp(gapPct, 0, 28) / 100), 1, 140)
}

function spiralGapFromPitch(pitchMm, widthMm) {
  return clamp((Number(pitchMm) / Math.max(0.1, Number(widthMm) * 14) - 1) * 100, 0, 28)
}

function helicalPitchFromOverlap(overlapPct, widthMm) {
  return clamp(Math.max(widthMm, 0.1) * 10 * (1 - clamp(overlapPct, 0, 80) / 100), 0.8, 140)
}

function helicalOverlapFromPitch(pitchMm, widthMm) {
  return clamp((1 - Number(pitchMm) / Math.max(0.1, Number(widthMm) * 10)) * 100, 0, 80)
}

function overlapToPct(value) {
  if (typeof value === 'number') return clamp(value * 100, 0, 80)
  if (value === 'butt') return 0
  if (value === '1/2') return 50
  if (value === '2/3') return 67
  if (value === '3/4') return 75
  return 50
}

function makePtfeId() {
  return `ptfe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeShieldId() {
  return `shield-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeAnimationKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function makeShieldLayer(type, source = PRESETS.phaseStable) {
  if (type === 'jacket') {
    return {
      id: makeShieldId(),
      type,
      label: 'Outer jacket',
      length: 128,
      od: source.jacketOD ?? 6.6,
      opacity: 72,
      animateKey: makeAnimationKey('shield'),
    }
  }
  if (type === 'flatwire') {
    const width = source.helicalWidth ?? 1.4
    const overlap = source.helicalOverlap ?? 45
    return {
      id: makeShieldId(),
      type,
      label: 'SPC flatwire helical',
      direction: 'S',
      length: 150,
      width,
      pitch: helicalPitchFromOverlap(overlap, width),
      overlap,
      animateKey: makeAnimationKey('shield'),
    }
  }
  if (type === 'foil') {
    return {
      id: makeShieldId(),
      type,
      label: 'Foil shield',
      length: 152,
      overlap: source.foilOverlap ?? 25,
      animateKey: makeAnimationKey('shield'),
    }
  }
  if (type === 'braid') {
    return {
      id: makeShieldId(),
      type,
      label: 'SPC braid',
      length: 142,
      carriers: 16,
      ends: 4,
      picks: 38,
      gauge: 36,
      coverage: source.braidCoverage ?? 92,
      animateKey: makeAnimationKey('shield'),
    }
  }
  const width = source.spiralWidth ?? 1.0
  const gap = source.spiralGap ?? 10
  return {
    id: makeShieldId(),
    type: 'spiral',
    label: 'SPC flatwire spiral',
    direction: 'Z',
    length: 155,
    width,
    pitch: spiralPitchFromGap(gap, width),
    bobbins: source.spiralBobbins ?? 8,
    gap,
    animateKey: makeAnimationKey('shield'),
  }
}

function makePresetShieldStack(preset) {
  return [
    makeShieldLayer('spiral', preset),
    makeShieldLayer('flatwire', preset),
    makeShieldLayer('foil', preset),
    makeShieldLayer('braid', preset),
    makeShieldLayer('jacket', preset),
  ]
}

function makePresetStack(preset) {
  const source = Array.isArray(preset.ptfeStack) && preset.ptfeStack.length
    ? preset.ptfeStack
    : [{ passes: preset.ptfeLayers || 1, mil: preset.ptfeMil || 2, width: preset.ptfeWidth || 6, overlap: preset.ptfeOverlap || 50, density: preset.ptfeDensity || 0.78, direction: 'Z' }]
  return source.map((layer, index) => ({
    id: makePtfeId(),
    passes: clamp(Math.round(layer.passes || 1), 1, 12),
    mil: clamp(Number(layer.mil ?? layer.ptfeMil ?? preset.ptfeMil ?? 2), 0.5, 5),
    width: clamp(Number(layer.width ?? preset.ptfeWidth ?? 6), 2, 14),
    overlap: clamp(Number(layer.overlap ?? preset.ptfeOverlap ?? 50), 0, 80),
    density: clamp(Number(layer.density ?? preset.ptfeDensity ?? 0.78), 0.45, 1.65),
    direction: layer.direction === 'S' || index % 2 ? 'S' : 'Z',
    animateKey: makeAnimationKey('ptfe'),
  }))
}

function stackSummary(stack, suckout = 0) {
  const totalPasses = stack.reduce((sum, layer) => sum + Math.max(1, Number(layer.passes) || 1), 0)
  const avg = (key, fallback) => {
    if (!stack.length) return fallback
    return stack.reduce((sum, layer) => sum + (Number(layer[key]) || fallback) * Math.max(1, Number(layer.passes) || 1), 0) / Math.max(1, totalPasses)
  }
  return {
    totalPasses,
    avgMil: avg('mil', 2),
    avgWidth: avg('width', 6),
    avgOverlap: avg('overlap', 50),
    avgDensity: avg('density', 0.78),
    tension: 1 - suckout / 180,
  }
}

function useRfStackModel(config) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('Loading macro GLB')
  const runtimeRef = useRef({ rebuildDynamic: null, config: null })

  useEffect(() => {
    let alive = true
    let frameId = 0
    let renderer = null
    let scene = null
    let camera = null
    let modelGroup = null
    let dynamicGroup = null
    const layerAnimationStarts = new Map()
    let resizeObserver = null
    const disposables = []
    const pointer = { down: false, x: 0, y: 0 }

    const layerAnimationKey = (layer) => (layer?.animateKey ? `${layer.id}:${layer.animateKey}` : '')

    const ensureLayerAnimationStart = (layer, now = performance.now()) => {
      const key = layerAnimationKey(layer)
      if (!key) return null
      if (!layerAnimationStarts.has(key)) layerAnimationStarts.set(key, now)
      return layerAnimationStarts.get(key)
    }

    const getLayerAnimationProgress = (layer, durationMs = 1450) => {
      const start = ensureLayerAnimationStart(layer)
      if (start == null) return 1
      return clamp((performance.now() - start) / durationMs, 0, 1)
    }

    const hasRunningLayerAnimation = (nextConfig = runtimeRef.current.config || {}) => {
      const now = performance.now()
      const layers = [
        ...(Array.isArray(nextConfig.ptfeStack) ? nextConfig.ptfeStack : []),
        ...(Array.isArray(nextConfig.shieldStack) ? nextConfig.shieldStack : []),
      ]
      return layers.some((layer) => {
        const start = ensureLayerAnimationStart(layer, now)
        return start != null && now - start < 1900
      })
    }

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
        modelGroup.rotation.set(-0.12, -0.2, 0.01)
        scene.add(modelGroup)

        const makeSleeveMesh = ({ name, x0, x1, radius, innerRadius = 0.12, material, progress = 1 }) => {
          const p = clamp(progress, 0.015, 1)
          const xEnd = x0 + (x1 - x0) * p
          const radialSegments = 96
          const lengthSegments = Math.max(2, Math.round(18 * p))
          const verts = []
          const faces = []
          for (let ix = 0; ix <= lengthSegments; ix++) {
            const t = ix / lengthSegments
            const x = x0 + (xEnd - x0) * t
            for (let ir = 0; ir < radialSegments; ir++) {
              const angle = (ir / radialSegments) * Math.PI * 2
              verts.push(x, radius * Math.cos(angle), radius * Math.sin(angle))
              verts.push(x, innerRadius * Math.cos(angle), innerRadius * Math.sin(angle))
            }
          }
          for (let ix = 0; ix < lengthSegments; ix++) {
            const row = ix * radialSegments * 2
            const nextRow = (ix + 1) * radialSegments * 2
            for (let ir = 0; ir < radialSegments; ir++) {
              const next = (ir + 1) % radialSegments
              const outer = row + ir * 2
              const inner = outer + 1
              const outerNext = row + next * 2
              const innerNext = outerNext + 1
              const outerUp = nextRow + ir * 2
              const innerUp = outerUp + 1
              const outerNextUp = nextRow + next * 2
              const innerNextUp = outerNextUp + 1
              faces.push(outer, outerNext, outerNextUp)
              faces.push(outer, outerNextUp, outerUp)
              faces.push(inner, innerUp, innerNextUp)
              faces.push(inner, innerNextUp, innerNext)
            }
          }
          const firstRow = 0
          const lastRow = lengthSegments * radialSegments * 2
          for (let ir = 0; ir < radialSegments; ir++) {
            const next = (ir + 1) % radialSegments
            const outer = firstRow + ir * 2
            const inner = outer + 1
            const outerNext = firstRow + next * 2
            const innerNext = outerNext + 1
            const outerEnd = lastRow + ir * 2
            const innerEnd = outerEnd + 1
            const outerNextEnd = lastRow + next * 2
            const innerNextEnd = outerNextEnd + 1
            faces.push(outer, inner, innerNext)
            faces.push(outer, innerNext, outerNext)
            faces.push(outerEnd, outerNextEnd, innerNextEnd)
            faces.push(outerEnd, innerNextEnd, innerEnd)
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          geometry.setIndex(faces)
          geometry.computeVertexNormals()
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.renderOrder = 6
          return mesh
        }

        const makeCutawaySleeveMesh = ({ name, x0, x1, radius, innerRadius, material, progress = 1, openCenter = Math.PI / 2, openAngle = Math.PI * 0.56 }) => {
          const p = clamp(progress, 0.015, 1)
          const xEnd = x0 + (x1 - x0) * p
          const radialSegments = 72
          const lengthSegments = Math.max(2, Math.round(16 * p))
          const start = openCenter + openAngle / 2
          const span = Math.PI * 2 - openAngle
          const stride = (radialSegments + 1) * 2
          const verts = []
          const faces = []

          for (let ix = 0; ix <= lengthSegments; ix++) {
            const t = ix / lengthSegments
            const x = x0 + (xEnd - x0) * t
            for (let ia = 0; ia <= radialSegments; ia++) {
              const angle = start + (span * ia) / radialSegments
              verts.push(x, radius * Math.cos(angle), radius * Math.sin(angle))
              verts.push(x, innerRadius * Math.cos(angle), innerRadius * Math.sin(angle))
            }
          }

          for (let ix = 0; ix < lengthSegments; ix++) {
            const row = ix * stride
            const nextRow = (ix + 1) * stride
            for (let ia = 0; ia < radialSegments; ia++) {
              const outer = row + ia * 2
              const inner = outer + 1
              const outerNext = row + (ia + 1) * 2
              const innerNext = outerNext + 1
              const outerUp = nextRow + ia * 2
              const innerUp = outerUp + 1
              const outerNextUp = nextRow + (ia + 1) * 2
              const innerNextUp = outerNextUp + 1
              faces.push(outer, outerNext, outerNextUp)
              faces.push(outer, outerNextUp, outerUp)
              faces.push(inner, innerUp, innerNextUp)
              faces.push(inner, innerNextUp, innerNext)
            }
          }

          const firstRow = 0
          const lastRow = lengthSegments * stride
          for (let ia = 0; ia < radialSegments; ia++) {
            const outer = firstRow + ia * 2
            const inner = outer + 1
            const outerNext = firstRow + (ia + 1) * 2
            const innerNext = outerNext + 1
            const outerEnd = lastRow + ia * 2
            const innerEnd = outerEnd + 1
            const outerNextEnd = lastRow + (ia + 1) * 2
            const innerNextEnd = outerNextEnd + 1
            faces.push(outer, inner, innerNext)
            faces.push(outer, innerNext, outerNext)
            faces.push(outerEnd, outerNextEnd, innerNextEnd)
            faces.push(outerEnd, innerNextEnd, innerEnd)
          }

          for (let ix = 0; ix < lengthSegments; ix++) {
            const row = ix * stride
            const nextRow = (ix + 1) * stride
            for (const ia of [0, radialSegments]) {
              const outer = row + ia * 2
              const inner = outer + 1
              const outerUp = nextRow + ia * 2
              const innerUp = outerUp + 1
              faces.push(outer, outerUp, innerUp)
              faces.push(outer, innerUp, inner)
            }
          }

          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          geometry.setIndex(faces)
          geometry.computeVertexNormals()
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.renderOrder = 7
          return mesh
        }

        const makeCylinderX = ({ name, x0, x1, radius, material, radialSegments = 64 }) => {
          const geometry = new THREE.CylinderGeometry(radius, radius, x1 - x0, radialSegments, 1, false)
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.rotation.z = Math.PI / 2
          mesh.position.x = (x0 + x1) / 2
          mesh.renderOrder = 2
          return mesh
        }

        const makeRibbonMesh = ({ name, x0, x1, radius, turns, phase, tapeWidth, handedness, material, progress = 1, thickness = 0.004 }) => {
          const p = clamp(progress, 0.02, 1)
          const segments = Math.max(10, Math.round(220 * p))
          const verts = []
          const faces = []
          const length = x1 - x0
          const thetaTotal = handedness * turns * Math.PI * 2
          const normalLen = Math.hypot(radius * thetaTotal, length) || 1
          const normalX = -(radius * thetaTotal) / normalLen
          const normalV = length / normalLen
          const halfTape = tapeWidth * 0.5
          for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * p
            const x = x0 + (x1 - x0) * t
            const center = phase + handedness * turns * Math.PI * 2 * t
            const lift = 1 + 0.003 * Math.sin(t * Math.PI * 2 * 2 + phase)
            for (const edge of [-0.5, 0.5]) {
              const offset = edge * halfTape
              const edgeX = x + normalX * offset
              const edgeAngle = center + (normalV * offset) / Math.max(radius, 0.001)
              verts.push(edgeX, (radius + thickness) * lift * Math.cos(edgeAngle), (radius + thickness) * lift * Math.sin(edgeAngle))
            }
          }
          for (let i = 0; i < segments; i++) {
            const row = i * 2
            faces.push(row, row + 1, row + 3)
            faces.push(row, row + 3, row + 2)
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          geometry.setIndex(faces)
          geometry.computeVertexNormals()
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.renderOrder = 8
          return mesh
        }

        const makeBraidStrand = ({ name, x0, x1, radius, turns, phase, handedness, material, strandRadius, carrierCount, progress = 1 }) => {
          const points = []
          const p = clamp(progress, 0.025, 1)
          const segments = Math.max(12, Math.round(72 * p))
          for (let i = 0; i < segments; i++) {
            const t = (i / Math.max(1, segments - 1)) * p
            const x = x0 + (x1 - x0) * t
            const weave = 0.5 + 0.5 * Math.sin((t * carrierCount * 2 + phase) * Math.PI * 2)
            const angle = phase + handedness * turns * Math.PI * 2 * t
            const r = radius + strandRadius * (1.2 + weave * 2.2)
            points.push(new THREE.Vector3(x, r * Math.cos(angle), r * Math.sin(angle)))
          }
          const curve = new THREE.CatmullRomCurve3(points)
          const geometry = new THREE.TubeGeometry(curve, 64, strandRadius, 5, false)
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.renderOrder = 5
          return mesh
        }

        const rebuildDynamic = (nextConfig = runtimeRef.current.config || {}, force = false) => {
          if (!modelGroup) return
          const activeAnimation = hasRunningLayerAnimation(nextConfig)
          const signature = JSON.stringify({
            ptfeStack: nextConfig.ptfeStack,
            shieldStack: nextConfig.shieldStack,
            frame: activeAnimation ? Math.floor(performance.now() / 33) : 'done',
          })
          if (!force && runtimeRef.current.lastSignature === signature) return
          runtimeRef.current.lastSignature = signature

          if (dynamicGroup) {
            modelGroup.remove(dynamicGroup)
            disposeObject(dynamicGroup)
          }
          dynamicGroup = new THREE.Group()
          dynamicGroup.name = 'live PTFE and braid coverage overlay'

          const ptfeA = new THREE.MeshStandardMaterial({ name: 'live PTFE tape satin white', color: 0xfff9e8, roughness: 0.26, metalness: 0.0, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true })
          const ptfeB = new THREE.MeshStandardMaterial({ name: 'live PTFE tape edge shade', color: 0xf6ecd0, roughness: 0.34, metalness: 0.0, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true })
          const seamMat = new THREE.MeshStandardMaterial({ name: 'live PTFE faint tape seam', color: 0xcfc5a4, roughness: 0.68, metalness: 0.0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })
          const leadTapeMat = new THREE.MeshStandardMaterial({ name: 'live PTFE leading wrap lip', color: 0xffffff, roughness: 0.22, metalness: 0.0, transparent: false, opacity: 1, side: THREE.DoubleSide, depthWrite: true })
          const copperMat = new THREE.MeshStandardMaterial({ name: 'live polished copper conductor', color: 0xd77828, roughness: 0.16, metalness: 0.9 })
          const flatwireMat = new THREE.MeshStandardMaterial({ name: 'live SPC flatwire shield', color: 0xf2f1e8, roughness: 0.14, metalness: 0.94, side: THREE.DoubleSide })
          const flatwireDark = new THREE.MeshStandardMaterial({ name: 'live SPC flatwire shadow', color: 0xa9adad, roughness: 0.28, metalness: 0.82, side: THREE.DoubleSide })
          const foilMat = new THREE.MeshStandardMaterial({ name: 'live bright foil shield', color: 0xdedbd0, roughness: 0.16, metalness: 0.92, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: true })
          const foilSeamMat = new THREE.MeshStandardMaterial({ name: 'live foil overlap seam', color: 0xffffff, roughness: 0.26, metalness: 0.74, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })
          const braidBright = new THREE.MeshStandardMaterial({ name: 'live braid bright carrier', color: 0xd8d2bd, roughness: 0.24, metalness: 0.82 })
          const braidDark = new THREE.MeshStandardMaterial({ name: 'live braid shadow carrier', color: 0x807a69, roughness: 0.36, metalness: 0.72 })
          const braidCopper = new THREE.MeshStandardMaterial({ name: 'live warm braid carrier', color: 0xb77939, roughness: 0.26, metalness: 0.8 })

          const buildX0 = -2.35
          const buildX1 = 3.12
          const conductorX0 = -2.82
          const conductorX1 = 3.55
          dynamicGroup.add(makeCylinderX({
            name: 'live continuous copper conductor',
            x0: conductorX0,
            x1: conductorX1,
            radius: 0.072,
            material: copperMat,
          }))

          const stack = Array.isArray(nextConfig.ptfeStack) ? nextConfig.ptfeStack : []
          const shieldStack = Array.isArray(nextConfig.shieldStack) ? nextConfig.shieldStack : []
          stack.forEach((layer, layerIndex) => {
            const passes = clamp(Math.round(layer.passes || 1), 1, 12)
            const width = clamp(Number(layer.width) || 6, 2, 14)
            const direction = layer.direction === 'S' ? 'S' : 'Z'
            const handedness = direction === 'Z' ? 1 : -1
            const tapeWidth = clamp(width * 0.052, 0.16, 0.54)
            const turns = clamp(18 / width + 1.65 + passes * 0.035, 2.6, 7.2)
            const layerProgress = getLayerAnimationProgress(layer, 1450)
            const phase = layerIndex * 1.1
            const radius = 0.255 + layerIndex * 0.055
            const x0 = buildX0 + 0.1
            const x1 = buildX1 - 0.1
            dynamicGroup.add(makeSleeveMesh({
              name: `live full PTFE sleeve layer ${layerIndex + 1}`,
              x0,
              x1,
              radius,
              innerRadius: 0.118,
              material: layerIndex % 2 ? ptfeB : ptfeA,
              progress: layerProgress,
            }))
            dynamicGroup.add(makeRibbonMesh({
              name: `live subtle PTFE ${direction} seam layer ${layerIndex + 1}`,
              x0: x0 + 0.02,
              x1: x1 - 0.02,
              radius: radius + 0.004,
              turns,
              phase,
              tapeWidth: Math.max(0.012, tapeWidth * 0.045),
              handedness,
              material: seamMat,
              progress: layerProgress,
              thickness: 0.006,
            }))
            if (layerProgress > 0 && layerProgress < 0.98) {
              const leadEnd = x0 + (x1 - x0) * layerProgress
              const leadStart = clamp(leadEnd - 0.42, x0, x1)
              dynamicGroup.add(makeRibbonMesh({
                name: `live active PTFE wrap lip layer ${layerIndex + 1}`,
                x0: leadStart,
                x1: Math.min(x1, leadEnd + 0.18),
                radius: radius + 0.012,
                turns: 0.72,
                phase: phase + layerProgress * turns * Math.PI * 2,
                tapeWidth,
                handedness,
                material: leadTapeMat,
                progress: 1,
                thickness: 0.014,
              }))
            }
          })

          let shieldRadius = 0.255 + Math.max(0, stack.length - 1) * 0.055 + 0.082
          shieldStack.forEach((layer, shieldIndex) => {
            const type = layer.type || 'spiral'
            const layerProgress = getLayerAnimationProgress(layer, type === 'braid' ? 1700 : 1450)
            const lengthRatio = clamp((Number(layer.length) || 140) / 150, 0.55, 1.32)
            const x0 = buildX0 + shieldIndex * 0.035
            const availableSpan = Math.max(0.6, buildX1 - x0 - 0.24)
            const x1 = Math.min(buildX1 - 0.08, x0 + availableSpan * lengthRatio)
            const radius = shieldRadius + shieldIndex * 0.055

            if (type === 'jacket') {
              const od = clamp(Number(layer.od) || Number(nextConfig.jacketOD) || 6.6, 2.4, 14)
              const opacity = clamp(Number(layer.opacity) || 72, 35, 100) / 100
              const jacketRadius = Math.max(radius + 0.1, 0.42 + od * 0.032)
              const jacketX0 = buildX0 - 0.32
              const jacketSpan = buildX1 - jacketX0 - 0.18
              const jacketX1 = Math.min(buildX1 - 0.04, jacketX0 + jacketSpan * lengthRatio)
              const jacketMat = new THREE.MeshStandardMaterial({
                name: 'live cutaway outer jacket',
                color: 0x202426,
                roughness: 0.66,
                metalness: 0.02,
                transparent: opacity < 0.98,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: opacity > 0.86,
              })
              dynamicGroup.add(makeCutawaySleeveMesh({
                name: `live final outer jacket layer ${shieldIndex + 1}`,
                x0: jacketX0,
                x1: jacketX1,
                radius: jacketRadius,
                innerRadius: Math.max(radius + 0.035, jacketRadius - 0.095),
                material: jacketMat,
                progress: layerProgress,
              }))
              return
            }

            if (type === 'foil') {
              const overlap = clamp(Number(layer.overlap) || 25, 0, 70)
              dynamicGroup.add(makeSleeveMesh({
                name: `live foil shield layer ${shieldIndex + 1}`,
                x0,
                x1,
                radius,
                innerRadius: radius - 0.018,
                material: foilMat,
                progress: layerProgress,
              }))
              dynamicGroup.add(makeRibbonMesh({
                name: `live foil overlap seam ${shieldIndex + 1}`,
                x0: x0 + 0.04,
                x1: x1 - 0.04,
                radius: radius + 0.01,
                turns: clamp(1.4 + overlap / 24, 1.4, 4.3),
                phase: shieldIndex * 0.5,
                tapeWidth: clamp(0.045 + overlap * 0.002, 0.045, 0.18),
                handedness: 1,
                material: foilSeamMat,
                progress: layerProgress,
                thickness: 0.009,
              }))
              return
            }

            if (type === 'braid') {
              const carriers = clamp(Math.round(Number(layer.carriers) || 16), 8, 32)
              const carrierCount = carriers % 2 ? carriers + 1 : carriers
              const ends = clamp(Math.round(Number(layer.ends) || 4), 2, 8)
              const picks = clamp(Number(layer.picks) || 38, 12, 72)
              const gauge = clamp(Number(layer.gauge) || 36, 30, 42)
              const coverage = clamp(Number(layer.coverage) || 92, 65, 99)
              const strandRadius = clamp(0.0028 + (42 - gauge) * 0.00058 + (coverage - 88) * 0.00012, 0.0028, 0.011)
              const turns = clamp(picks / 9.2, 2.2, 8.6)
              for (const handedness of [1, -1]) {
                const material = handedness === 1 ? braidBright : braidDark
                for (let carrier = 0; carrier < carrierCount; carrier++) {
                  const carrierPhase = (Math.PI * 2 * carrier) / carrierCount + (handedness === 1 ? 0.16 : 0.54)
                  for (let end = 0; end < ends; end++) {
                    const phase = carrierPhase + end * 0.018
                    dynamicGroup.add(makeBraidStrand({
                      name: `live braid ${carrierCount}c ${ends}e ${handedness > 0 ? 'Z' : 'S'} carrier ${carrier + 1}`,
                      x0,
                      x1,
                      radius,
                      turns,
                      phase,
                      handedness,
                      material: end % 3 === 0 ? braidCopper : material,
                      strandRadius,
                      carrierCount,
                      progress: layerProgress,
                    }))
                  }
                }
              }
              return
            }

            const width = clamp(Number(layer.width) || 1.2, 0.35, 10)
            const handedness = (layer.direction || (type === 'flatwire' ? 'S' : 'Z')) === 'S' ? -1 : 1

            if (type === 'spiral') {
              const bobbins = clamp(Math.round(Number(layer.bobbins) || 8), 1, 16)
              const pitch = clamp(Number(layer.pitch) || spiralPitchFromGap(Number(layer.gap) || 10, width), 1, 140)
              const gap = clamp(Number(layer.gap) || 10, 0, 28)
              const tapeWidth = clamp(width * 0.032, 0.018, 0.36)
              const turns = clamp(((x1 - x0) * 13) / Math.max(1, pitch), 1.2, 18)
              for (let bobbin = 0; bobbin < bobbins; bobbin++) {
                const phase = (Math.PI * 2 * bobbin) / bobbins + shieldIndex * 0.33
                dynamicGroup.add(makeRibbonMesh({
                  name: `live SPC flatwire spiral bobbin ${bobbin + 1}`,
                  x0,
                  x1,
                  radius,
                  turns,
                  phase,
                  tapeWidth,
                  handedness,
                  material: bobbin % 2 ? flatwireDark : flatwireMat,
                  progress: layerProgress,
                  thickness: 0.006,
                }))
                dynamicGroup.add(makeRibbonMesh({
                  name: `live SPC flatwire spiral glint ${bobbin + 1}`,
                  x0,
                  x1,
                  radius: radius + 0.006,
                  turns,
                  phase: phase + 0.012,
                  tapeWidth: tapeWidth * 0.34,
                  handedness,
                  material: flatwireMat,
                  progress: layerProgress,
                  thickness: 0.008,
                }))
              }
            } else {
              const overlap = clamp(Number(layer.overlap) || 45, 0, 80)
              const pitch = clamp(Number(layer.pitch) || helicalPitchFromOverlap(overlap, width), 0.8, 140)
              const tapeWidth = clamp(width * 0.072, 0.055, 0.78)
              const turns = clamp(((x1 - x0) * 13) / Math.max(0.8, pitch), 1.1, 22)
              dynamicGroup.add(makeRibbonMesh({
                name: 'live SPC flatwire helical overlap wrap',
                x0,
                x1,
                radius,
                turns,
                phase: shieldIndex * 0.33,
                tapeWidth,
                handedness,
                material: flatwireMat,
                progress: layerProgress,
                thickness: 0.012,
              }))
              dynamicGroup.add(makeRibbonMesh({
                name: 'live SPC flatwire helical edge shadow',
                x0,
                x1,
                radius: radius + 0.007,
                turns,
                phase: shieldIndex * 0.33 + 0.032,
                tapeWidth: tapeWidth * 0.18,
                handedness,
                material: flatwireDark,
                progress: layerProgress,
                thickness: 0.014,
              }))
            }
          })

          modelGroup.add(dynamicGroup)
        }
        runtimeRef.current.rebuildDynamic = rebuildDynamic
        rebuildDynamic(runtimeRef.current.config || config || {}, true)

        camera = new THREE.PerspectiveCamera(30, 1, 0.01, 120)
        camera.position.set(0, 0.16, 9.35)
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
              const objectLabel = `${node.name}`.toLowerCase()
              const materialLabel = `${Array.isArray(node.material) ? node.material.map((mat) => mat.name).join(' ') : node.material.name}`.toLowerCase()
              const nodeLabel = `${objectLabel} ${materialLabel}`
              node.visible = false
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
            const scale = 4.45 / Math.max(size.x, size.y, size.z, 0.001)
            root.scale.setScalar(scale)
            modelGroup.add(root)
            setStatus('')
          },
          undefined,
          () => alive && setStatus('Macro GLB failed to load')
        )

        const animate = () => {
          if (!alive || !renderer || !scene || !camera) return
          const liveConfig = runtimeRef.current.config
          if (hasRunningLayerAnimation(liveConfig)) {
            rebuildDynamic(liveConfig)
          }
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

  useEffect(() => {
    runtimeRef.current.config = config
    runtimeRef.current.rebuildDynamic?.(config, true)
  }, [config])

  return { mountRef, status }
}

function Slider({ label, value, setValue, min, max, step = 1, unit = '', accent = C.amber, displayValue, displayUnit, displayDigits }) {
  const shownValue = displayValue ?? value
  const shownUnit = displayUnit ?? unit
  const shownDigits = displayDigits ?? (step < 1 ? 2 : 0)
  return (
    <label style={S.slider}>
      <span style={S.sliderTop}>
        <span>{label}</span>
        <strong style={{ color: accent }}>{fmt(shownValue, shownDigits)}{shownUnit}</strong>
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

function DimensionSlider({ label, value, setValue, min, max, step = 0.1, unitMode, accent = C.amber }) {
  return (
    <Slider
      label={label}
      value={value}
      setValue={setValue}
      min={min}
      max={max}
      step={step}
      accent={accent}
      displayValue={displayMm(value, unitMode)}
      displayUnit={unitSuffix(unitMode)}
      displayDigits={unitDigits(unitMode, step)}
    />
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
    ['02', 'PTFE stack', `${computed.ptfeLayerCount} layers · ${computed.ptfeLayers} passes`, '#fff2c4'],
    ['03', 'SPC spiral', `${computed.spiralBobbins} bobbins · ${fmt(computed.spiralGap, 0)}% gap`, C.foil],
    ['04', 'SPC helical', `${fmt(computed.helicalOverlap, 0)}% overlap`, C.sky],
    ['05', 'Foil shield', `${fmt(computed.foilCoverage, 0)}% seam`, C.foil],
    ['06', 'Braid', `${fmt(computed.braidCoverage, 0)}% coverage`, C.braid],
    ['07', 'Jacket', computed.jacketInstalled ? `${fmt(computed.jacketOD, 1)} mm OD` : 'add final sleeve', C.sky],
  ]
  return (
    <div style={S.layerRail}>
      {states.map(([num, label, sub, color]) => (
        <div key={num} style={{ ...S.layerChip, border: `1px solid ${color}55` }}>
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

function PTFELayerCard({ layer, index, canRemove, onUpdate, onReplay, onRemove }) {
  const direction = layer.direction === 'S' ? 'S' : 'Z'
  const accent = direction === 'Z' ? C.amber : C.sky
  return (
    <div style={{ ...S.ptfeLayerCard, border: `1px solid ${accent}66` }}>
      <div style={S.ptfeLayerTop}>
        <div style={S.ptfeLayerTitle}>
          <span style={{ ...S.layerDot, background: accent }} />
          <strong>PTFE L{index + 1}</strong>
          <small>{direction}-wrap · {fmt(layer.width, 1)} mm tape</small>
        </div>
        <div style={S.ptfeLayerActions}>
          <button type="button" aria-label={`Replay PTFE layer ${index + 1}`} title={`Replay PTFE layer ${index + 1}`} onClick={onReplay} style={{ ...S.iconBtn, color: C.teal }}>
            <Play size={12} />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ direction: direction === 'Z' ? 'S' : 'Z' })}
            style={{ ...S.directionBtn, border: `1px solid ${accent}88`, color: accent }}
          >
            {direction}
          </button>
          <button type="button" aria-label={`Remove PTFE layer ${index + 1}`} title={`Remove PTFE layer ${index + 1}`} onClick={onRemove} disabled={!canRemove} style={{ ...S.iconBtn, opacity: canRemove ? 1 : 0.35 }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div style={S.ptfeLayerGrid}>
        <Slider label="Width" value={layer.width} setValue={(value) => onUpdate({ width: value })} min={2} max={14} step={0.1} unit=" mm" accent={accent} />
        <Slider label="Passes" value={layer.passes} setValue={(value) => onUpdate({ passes: Math.round(value) })} min={1} max={12} step={1} accent={accent} />
        <Slider label="Mil" value={layer.mil} setValue={(value) => onUpdate({ mil: value })} min={0.5} max={5} step={0.1} unit=" mil" accent="#fff2c4" />
        <Slider label="Overlap" value={layer.overlap} setValue={(value) => onUpdate({ overlap: value })} min={0} max={80} step={1} unit="%" accent={C.amber} />
        <Slider label="Density" value={layer.density} setValue={(value) => onUpdate({ density: value })} min={0.45} max={1.65} step={0.01} unit=" g/cc" accent={C.sky} />
      </div>
    </div>
  )
}

function ShieldLayerCard({ layer, index, unitMode, onUpdate, onRemove }) {
  const type = layer.type || 'spiral'
  const isFlatwire = type === 'spiral' || type === 'flatwire'
  const accent = type === 'jacket' ? C.sky : type === 'braid' ? C.braid : type === 'foil' ? C.foil : type === 'flatwire' ? C.sky : C.amber
  const title = type === 'spiral' ? 'SPC flatwire spiral'
    : type === 'flatwire' ? 'SPC flatwire helical'
      : type === 'foil' ? 'Foil shield'
        : type === 'braid' ? 'Braid shield'
          : 'Outer jacket'
  const width = Number(layer.width) || 1
  const spiralPitch = Number(layer.pitch) || spiralPitchFromGap(Number(layer.gap) || 10, width)
  const spiralGap = spiralGapFromPitch(spiralPitch, width)
  const helicalPitch = Number(layer.pitch) || helicalPitchFromOverlap(Number(layer.overlap) || 45, width)
  const helicalOverlap = helicalOverlapFromPitch(helicalPitch, width)
  return (
    <div style={{ ...S.shieldLayerCard, border: `1px solid ${accent}66` }}>
      <div style={S.ptfeLayerTop}>
        <div style={S.ptfeLayerTitle}>
          <span style={{ ...S.layerDot, background: accent }} />
          <strong>Shield L{index + 1}</strong>
          <small>{title}</small>
        </div>
        <div style={S.ptfeLayerActions}>
          {isFlatwire && (
            <button
              type="button"
              onClick={() => onUpdate({ direction: (layer.direction === 'S' ? 'Z' : 'S') })}
              style={{ ...S.directionBtn, border: `1px solid ${accent}88`, color: accent }}
            >
              {layer.direction === 'S' ? 'S' : 'Z'}
            </button>
          )}
          <button type="button" aria-label={`Replay shield layer ${index + 1}`} title={`Replay shield layer ${index + 1}`} onClick={() => onUpdate({ animateKey: makeAnimationKey('shield') })} style={{ ...S.iconBtn, color: C.teal }}>
            <Play size={12} />
          </button>
          <button type="button" aria-label={`Remove shield layer ${index + 1}`} title={`Remove shield layer ${index + 1}`} onClick={onRemove} style={S.iconBtn}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {type === 'spiral' && (
        <>
          <div style={S.shieldHint}>
            Spiral starts with separated SPC flatwire bobbins; 8 bobbins and 8-13% gap is the normal window.
          </div>
          <div style={S.ptfeLayerGrid}>
            <DimensionSlider label="Spiral length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
            <DimensionSlider
              label="Flatwire width"
              value={layer.width}
              setValue={(value) => {
                const nextGap = spiralGapFromPitch(spiralPitch, value)
                onUpdate({ width: value, gap: nextGap, pitch: spiralPitch })
              }}
              min={0.35}
              max={10}
              step={0.05}
              unitMode={unitMode}
              accent={accent}
            />
            <DimensionSlider
              label="Pitch"
              value={spiralPitch}
              setValue={(value) => onUpdate({ pitch: value, gap: spiralGapFromPitch(value, width) })}
              min={1}
              max={140}
              step={0.1}
              unitMode={unitMode}
              accent={C.teal}
            />
            <Slider label="Bobbins" value={layer.bobbins} setValue={(value) => onUpdate({ bobbins: Math.round(value) })} min={1} max={16} step={1} accent={accent} />
            <Slider label="Gap" value={spiralGap} setValue={(value) => onUpdate({ gap: value, pitch: spiralPitchFromGap(value, width) })} min={0} max={28} step={1} unit="%" accent={spiralGap >= 8 && spiralGap <= 13 ? C.teal : C.amber} />
          </div>
        </>
      )}

      {type === 'flatwire' && (
        <>
          <div style={S.shieldHint}>
            Pitch controls tapping spin: lower pitch closes the overlap, higher pitch opens it up.
          </div>
          <div style={S.ptfeLayerGrid}>
            <DimensionSlider label="Helical length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
            <DimensionSlider
              label="Flatwire width"
              value={layer.width}
              setValue={(value) => {
                const nextOverlap = helicalOverlapFromPitch(helicalPitch, value)
                onUpdate({ width: value, overlap: nextOverlap, pitch: helicalPitch })
              }}
              min={0.35}
              max={10}
              step={0.05}
              unitMode={unitMode}
              accent={accent}
            />
            <DimensionSlider
              label="Pitch"
              value={helicalPitch}
              setValue={(value) => onUpdate({ pitch: value, overlap: helicalOverlapFromPitch(value, width) })}
              min={0.8}
              max={140}
              step={0.1}
              unitMode={unitMode}
              accent={C.teal}
            />
            <Slider label="Overlap" value={helicalOverlap} setValue={(value) => onUpdate({ overlap: value, pitch: helicalPitchFromOverlap(value, width) })} min={0} max={80} step={1} unit="%" accent={helicalOverlap >= 35 ? C.teal : C.amber} />
          </div>
        </>
      )}

      {type === 'foil' && (
        <div style={S.ptfeLayerGrid}>
          <DimensionSlider label="Foil length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
          <Slider label="Overlap" value={layer.overlap} setValue={(value) => onUpdate({ overlap: value })} min={0} max={70} step={1} unit="%" accent={accent} />
        </div>
      )}

      {type === 'braid' && (
        <div style={S.ptfeLayerGrid}>
          <DimensionSlider label="Braid length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
          <Slider label="Carriers" value={layer.carriers} setValue={(value) => onUpdate({ carriers: Math.round(value) })} min={8} max={32} step={2} accent={accent} />
          <Slider label="Ends" value={layer.ends} setValue={(value) => onUpdate({ ends: Math.round(value) })} min={2} max={8} step={1} accent={accent} />
          <Slider label="Picks" value={layer.picks} setValue={(value) => onUpdate({ picks: value })} min={12} max={72} step={1} unit="/in" accent={C.sky} />
          <Slider label="Gauge" value={layer.gauge} setValue={(value) => onUpdate({ gauge: value })} min={30} max={42} step={1} unit=" AWG" accent={C.foil} />
          <Slider label="Coverage" value={layer.coverage} setValue={(value) => onUpdate({ coverage: value })} min={65} max={99} step={1} unit="%" accent={accent} />
        </div>
      )}

      {type === 'jacket' && (
        <>
          <div style={S.shieldHint}>
            Jacket is the final outer sleeve. The render keeps a cutaway window so the shield stack stays visible.
          </div>
          <div style={S.ptfeLayerGrid}>
            <DimensionSlider label="Jacket length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
            <DimensionSlider label="Jacket OD" value={layer.od} setValue={(value) => onUpdate({ od: value })} min={2.4} max={14} step={0.1} unitMode={unitMode} accent={accent} />
            <Slider label="Opacity" value={layer.opacity} setValue={(value) => onUpdate({ opacity: value })} min={35} max={100} step={1} unit="%" accent={accent} />
          </div>
        </>
      )}
    </div>
  )
}

export default function RFStackLab() {
  const [params, setParams] = useState(PRESETS.phaseStable)
  const [ptfeStack, setPtfeStack] = useState([])
  const [shieldStack, setShieldStack] = useState([])
  const [activePreset, setActivePreset] = useState('')
  const [unitMode, setUnitMode] = useState('mm')
  const modelConfig = useMemo(() => ({
    ptfeStack,
    shieldStack,
  }), [ptfeStack, shieldStack])
  const { mountRef, status } = useRfStackModel(modelConfig)

  const setParam = (key) => (value) => {
    setParams((current) => ({ ...current, [key]: value }))
    setActivePreset('')
  }

  const loadPreset = (key) => {
    setActivePreset(key)
    setParams(PRESETS[key])
    setPtfeStack(makePresetStack(PRESETS[key]))
    setShieldStack(makePresetShieldStack(PRESETS[key]))
  }

  const updatePtfeLayer = (id, patch) => {
    setPtfeStack((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer))
    setActivePreset('')
  }

  const addPtfeLayer = (direction) => {
    setPtfeStack((current) => {
      const last = current[current.length - 1] || makePresetStack(PRESETS.phaseStable)[0]
      const nextDirection = direction || (last.direction === 'Z' ? 'S' : 'Z')
      return [
        ...current,
        {
          id: makePtfeId(),
          passes: 1,
          mil: clamp(last.mil * 0.86, 0.5, 5),
          width: clamp(last.width - 1.2, 2, 14),
          overlap: clamp(last.overlap + (nextDirection === 'S' ? 4 : -3), 0, 80),
          density: clamp(last.density + 0.02, 0.45, 1.65),
          direction: nextDirection,
          animateKey: makeAnimationKey('ptfe'),
        },
      ].slice(0, 8)
    })
    setActivePreset('')
  }

  const removePtfeLayer = (id) => {
    setPtfeStack((current) => current.length <= 1 ? current : current.filter((layer) => layer.id !== id))
    setActivePreset('')
  }

  const replayLastPtfeLayer = () => {
    setPtfeStack((current) => current.map((layer, index) => (
      index === current.length - 1 ? { ...layer, animateKey: makeAnimationKey('ptfe') } : layer
    )))
  }

  const addShieldLayer = (type) => {
    const layer = makeShieldLayer(type, params)
    setShieldStack((current) => [...current, layer].slice(0, 8))
    if (type === 'braid') {
      setParams((current) => ({ ...current, braidCoverage: layer.coverage }))
    } else if (type === 'jacket') {
      setParams((current) => ({ ...current, jacketOD: layer.od }))
    }
    setActivePreset('')
  }

  const updateShieldLayer = (id, patch) => {
    setShieldStack((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer))
    if (patch.coverage != null) {
      setParams((current) => ({ ...current, braidCoverage: patch.coverage }))
    }
    if (patch.od != null) {
      setParams((current) => ({ ...current, jacketOD: patch.od }))
    }
    setActivePreset('')
  }

  const removeShieldLayer = (id) => {
    setShieldStack((current) => current.filter((layer) => layer.id !== id))
    setActivePreset('')
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
      if (layers.length) {
        setPtfeStack(layers.map((layer, index) => ({
          id: makePtfeId(),
          passes: clamp(Math.round(Number(layer.passes) || 1), 1, 12),
          mil: clamp((Number(layer.tape_thickness_mm) || 0.05) / MIL_TO_MM, 0.5, 5),
          width: clamp(Number(layer.tape_width_mm) || 6.35, 2, 14),
          overlap: clamp(overlapToPct(layer.overlap), 0, 80),
          density: clamp(Number(layer.density) || avgDensity || 0.78, 0.45, 1.65),
          direction: index % 2 ? 'S' : 'Z',
          animateKey: makeAnimationKey('ptfe'),
        })))
      }
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
    const spiralLayer = shieldStack.find((layer) => layer.type === 'spiral')
    const helicalLayer = shieldStack.find((layer) => layer.type === 'flatwire')
    const foilLayer = shieldStack.find((layer) => layer.type === 'foil')
    const braidLayer = shieldStack.find((layer) => layer.type === 'braid')
    const jacketLayer = shieldStack.find((layer) => layer.type === 'jacket')
    const spiralWidth = Number(spiralLayer?.width ?? params.spiralWidth)
    const spiralBobbins = Math.round(Number(spiralLayer?.bobbins ?? params.spiralBobbins))
    const spiralPitchMm = Number(spiralLayer?.pitch ?? spiralPitchFromGap(Number(spiralLayer?.gap ?? params.spiralGap), spiralWidth))
    const spiralGapPct = spiralLayer ? spiralGapFromPitch(spiralPitchMm, spiralWidth) : Number(params.spiralGap)
    const helicalWidth = Number(helicalLayer?.width ?? params.helicalWidth)
    const helicalPitchMm = Number(helicalLayer?.pitch ?? helicalPitchFromOverlap(Number(helicalLayer?.overlap ?? params.helicalOverlap ?? 45), helicalWidth))
    const helicalOverlapPct = helicalLayer ? helicalOverlapFromPitch(helicalPitchMm, helicalWidth) : Number(params.helicalOverlap ?? 45)
    const foilOverlap = Number(foilLayer?.overlap ?? params.foilOverlap)
    const braidCoverage = Number(braidLayer?.coverage ?? params.braidCoverage)
    const braidCarriers = Math.round(Number(braidLayer?.carriers ?? 16))
    const braidEnds = Math.round(Number(braidLayer?.ends ?? 4))
    const braidPicks = Number(braidLayer?.picks ?? 38)
    const braidGauge = Number(braidLayer?.gauge ?? 36)
    const jacketOD = Number(jacketLayer?.od ?? params.jacketOD)
    const summary = stackSummary(ptfeStack, params.suckout)
    const tension = 1 - params.suckout / 180
    const layerBuilds = ptfeStack.map((layer) => {
      const passes = Math.max(1, Number(layer.passes) || 1)
      const mil = Number(layer.mil) || 2
      const overlap = Number(layer.overlap) || 0
      const radial = passes * mil * MIL_TO_MM * (1 + clamp(overlap / 100, 0, 0.9)) * tension
      return { ...layer, passes, mil, overlap, radial, eps: densityToEps(Number(layer.density) || summary.avgDensity) }
    })
    const rawDielectricWall = layerBuilds.reduce((sum, layer) => sum + layer.radial, 0)
    const dielectricWall = rawDielectricWall || 0.12
    const dielectricOD = params.conductorOD + 2 * dielectricWall
    const epsBase = layerBuilds.length && rawDielectricWall > 0
      ? layerBuilds.reduce((sum, layer) => sum + layer.eps * layer.radial, 0) / rawDielectricWall
      : 1.02
    const eps = epsBase * (1 + params.suckout * 0.0018)
    const vp = 1 / Math.sqrt(eps)
    const z0 = z0From(params.conductorOD, dielectricOD, eps)
    const ptfeNotches = layerBuilds.map((layer, index) => {
      const layerOD = params.conductorOD + 2 * layerBuilds.slice(0, index + 1).reduce((sum, item) => sum + item.radial, 0)
      const pitch = pitchFrom(layer.width, layer.overlap, layerOD, 1)
      return {
        id: layer.id,
        label: `L${index + 1} ${layer.direction}`,
        pitch,
        freq: notchGHz(pitch, vp),
        width: layer.width,
        direction: layer.direction,
      }
    })
    const pitchTape = ptfeNotches[0]?.pitch || pitchFrom(summary.avgWidth, summary.avgOverlap, dielectricOD, 1)
    const tapeNotch = ptfeNotches.length ? Math.min(...ptfeNotches.map((item) => item.freq)) : notchGHz(pitchTape, vp)
    const spiralGap = -Math.abs(spiralGapPct)
    const pitchSpiral = spiralLayer ? Math.max(0.01, spiralPitchMm / Math.max(1, spiralBobbins)) : pitchFrom(spiralWidth, spiralGap, dielectricOD + 0.25, spiralBobbins)
    const pitchHelical = helicalLayer ? Math.max(0.01, helicalPitchMm) : pitchFrom(helicalWidth, helicalOverlapPct, dielectricOD + 0.48, 1)
    const spiralNotch = notchGHz(pitchSpiral, vp)
    const helicalNotch = notchGHz(pitchHelical, vp)
    const circ = Math.PI * (dielectricOD + 0.3)
    const spiralRawCoverage = clamp((spiralBobbins * spiralWidth) / circ * 100, 0, 100)
    const spiralCoverage = spiralLayer ? clamp(Math.min(100 - spiralGapPct, spiralRawCoverage), 0, 100) : 0
    const helicalCoverage = helicalLayer ? clamp((helicalWidth * (1 + helicalOverlapPct / 80)) / circ * 100, 0, 100) : 0
    const foilCoverage = foilLayer ? clamp(100 - Math.max(0, 18 - foilOverlap) * 1.6, 82, 100) : 0
    const braidCoverageEffective = braidLayer ? clamp(braidCoverage, 65, 99) : 0
    const shieldCoverage = clamp(100 * (1 - (1 - spiralCoverage / 100) * (1 - helicalCoverage / 100) * (1 - foilCoverage / 100) * (1 - braidCoverageEffective / 100)), 0, 100)
    const shieldDb = 24 + shieldCoverage * 0.82 + Math.log10(Math.max(1, params.freqGHz)) * 4
    const zError = Math.abs(z0 - 50)
    const worstRl = clamp(34 - zError * 1.7 - params.suckout * 0.26 - Math.max(0, 92 - shieldCoverage) * 0.08, 6, 42)
    const vswr = rlToVswr(worstRl)
    const baseLoss = 0.16 * Math.sqrt(params.freqGHz) + 0.018 * params.freqGHz + (summary.avgDensity - 0.7) * 0.15
    const sharedPitchCount = ptfeNotches.reduce((count, notch, index) => {
      return count + ptfeNotches.slice(index + 1).filter((other) => Math.abs(other.freq - notch.freq) < notch.freq * 0.05).length
    }, 0)
    const suckoutDepth = params.suckout * 0.20 + Math.max(0, 50 - summary.avgOverlap) * 0.035 + sharedPitchCount * 0.55
    return {
      ...params,
      ptfeThickness: summary.avgMil * MIL_TO_MM,
      ptfeLayers: summary.totalPasses,
      ptfeMil: summary.avgMil,
      ptfeWidth: summary.avgWidth,
      ptfeOverlap: summary.avgOverlap,
      ptfeDensity: summary.avgDensity,
      ptfeLayerCount: ptfeStack.length,
      shieldLayerCount: shieldStack.length,
      ptfeNotches,
      dielectricOD,
      eps,
      vp,
      z0,
      spiralWidth,
      spiralPitch: spiralPitchMm,
      spiralGap: spiralGapPct,
      spiralBobbins,
      helicalWidth,
      helicalPitch: helicalPitchMm,
      helicalOverlap: helicalOverlapPct,
      foilOverlap,
      braidCoverage: braidCoverageEffective,
      braidCarriers,
      braidEnds,
      braidPicks,
      braidGauge,
      jacketOD,
      jacketInstalled: Boolean(jacketLayer),
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
  }, [params, ptfeStack, shieldStack])

  const traces = useMemo(() => {
    const rl = []
    const il = []
    const tdr = []
    for (let i = 0; i < 180; i++) {
      const t = i / 179
      const f = 0.2 * (params.freqGHz * 2 / 0.2) ** t
      const notchSources = [
        ...computed.ptfeNotches.map((item) => item.freq),
        ...(computed.spiralCoverage > 0 ? [computed.spiralNotch] : []),
        ...(computed.helicalCoverage > 0 ? [computed.helicalNotch] : []),
      ]
      const notch = notchSources.reduce((sum, nf, index) => {
        const sigma = Math.max(0.08, nf * (index ? 0.045 : 0.035))
        const dx = (f - nf) / sigma
        return sum + (computed.suckoutDepth / (index + 1.25)) * Math.exp(-dx * dx)
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
              <h2 style={S.cardTitle}>Conductor → PTFE → flatwire → foil → braid → jacket</h2>
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
              <div style={S.blockTitle}><Zap size={13} /> Conductor + PTFE stack</div>
              <Slider label="Conductor OD" value={params.conductorOD} setValue={setParam('conductorOD')} min={0.2} max={2.2} step={0.01} unit=" mm" accent={C.copperHi} />
              <div style={S.ptfeToolbar}>
                <button type="button" style={S.toolBtn} onClick={() => addPtfeLayer('Z')}>
                  <Plus size={13} /> Add tape Z
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addPtfeLayer('S')}>
                  <Plus size={13} /> Add tape S
                </button>
                <button type="button" style={{ ...S.toolBtn, color: C.teal, border: `1px solid ${C.teal}66` }} onClick={replayLastPtfeLayer}>
                  <Play size={13} /> Replay last
                </button>
              </div>
              <div style={S.ptfeStackList}>
                {ptfeStack.map((layer, index) => (
                  <PTFELayerCard
                    key={layer.id}
                    layer={layer}
                    index={index}
                    canRemove={ptfeStack.length > 1}
                    onUpdate={(patch) => updatePtfeLayer(layer.id, patch)}
                    onReplay={() => updatePtfeLayer(layer.id, { animateKey: makeAnimationKey('ptfe') })}
                    onRemove={() => removePtfeLayer(layer.id)}
                  />
                ))}
              </div>
              <Slider label="Tape suckout" value={params.suckout} setValue={setParam('suckout')} min={0} max={24} step={1} unit="%" accent={params.suckout > 12 ? C.red : C.amber} />
            </div>

            <div style={S.controlBlock}>
              <div style={S.blockTitleRow}>
                <div style={S.blockTitle}><ShieldCheck size={13} /> Shields</div>
                <div style={S.unitToggle} aria-label="Shield units">
                  {['mm', 'inch'].map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setUnitMode(unit)}
                      style={{ ...S.unitBtn, ...(unitMode === unit ? S.unitBtnActive : {}) }}
                    >
                      {unit === 'mm' ? 'MM' : 'IN'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={S.shieldToolbar}>
                <button type="button" style={S.toolBtn} onClick={() => addShieldLayer('spiral')}>
                  <Plus size={13} /> SPC spiral
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addShieldLayer('flatwire')}>
                  <Plus size={13} /> Flatwire
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addShieldLayer('foil')}>
                  <Plus size={13} /> Foil
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addShieldLayer('braid')}>
                  <Plus size={13} /> Braid
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addShieldLayer('jacket')}>
                  <Plus size={13} /> Jacket
                </button>
              </div>
              <div style={S.ptfeStackList}>
                {shieldStack.length === 0 && (
                  <div style={S.emptyState}>Add SPC spiral, flatwire, foil, braid, then jacket to build a complete RF cable stack.</div>
                )}
                {shieldStack.map((layer, index) => (
                  <ShieldLayerCard
                    key={layer.id}
                    layer={layer}
                    index={index}
                    unitMode={unitMode}
                    onUpdate={(patch) => updateShieldLayer(layer.id, patch)}
                    onRemove={() => removeShieldLayer(layer.id)}
                  />
                ))}
              </div>
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
        <Metric label="Primary suckout" value={`${fmt(Math.min(computed.tapeNotch, computed.spiralCoverage ? computed.spiralNotch : Infinity, computed.helicalCoverage ? computed.helicalNotch : Infinity), 2)} GHz`} sub="first Bragg marker" accent={C.purple} />
      </div>

      <div style={S.chartGrid}>
        <ChartCard title="Insertion loss / suckout" sub="S21 with pitch-driven notches" data={traces.il} yKey="v" color={C.amber} yDomain={['auto', 0]} yFmt={(v) => `${fmt(v, 0)} dB`} />
        <ChartCard title="Return loss / VSWR" sub="notches convert to RL ripple" data={traces.rl} yKey="v" color={C.teal} yDomain={['auto', 0]} yFmt={(v) => `${fmt(v, 0)} dB`} />
        <ChartCard title="TDR impedance trace" sub="dielectric build + shield discontinuities" data={traces.tdr} xKey="x" yKey="z" color={C.sky} xFmt={(v) => `${fmt(v, 0)}%`} yFmt={(v) => `${fmt(v, 0)} Ω`} domainX={[0, 100]} domainY={[42, 62]} referenceY={50} />
      </div>

      <div style={S.notes}>
        <div style={S.noteTitle}><Activity size={13} /> Interpretation</div>
        <p>
          PTFE is the dielectric wrap, not a shield. The RF shields start at SPC flatwire spiral/helical layers, then foil, then braid; jacket is the final mechanical sleeve. Coverage is compounded as independent leak paths, so foil + braid + flatwire rapidly pushes shielding effectiveness up.
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
  presetBtnActive: { border: `1px solid ${C.amber}`, color: C.amber, background: 'rgba(251,191,36,0.11)' },
  resetBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.dim, padding: '7px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', cursor: 'pointer' },
  controlSections: { display: 'grid', gap: 12 },
  controlBlock: { border: `1px solid rgba(167,176,182,0.13)`, background: '#080d0f', padding: 12, display: 'grid', gap: 11 },
  blockTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  blockTitle: { display: 'flex', alignItems: 'center', gap: 8, color: C.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  unitToggle: { display: 'inline-grid', gridTemplateColumns: 'repeat(2, minmax(38px, 1fr))', border: `1px solid ${C.borderHi}`, background: '#070b0c' },
  unitBtn: { border: 0, borderRight: `1px solid ${C.borderHi}`, background: 'transparent', color: C.muted, minHeight: 26, padding: '0 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.2, cursor: 'pointer' },
  unitBtnActive: { color: C.teal, background: 'rgba(94,234,212,0.12)' },
  ptfeToolbar: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  shieldToolbar: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 8 },
  toolBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, cursor: 'pointer' },
  ptfeStackList: { display: 'grid', gap: 9 },
  ptfeLayerCard: { border: '1px solid', background: 'linear-gradient(135deg, rgba(255,242,196,0.06), rgba(7,11,12,0.98))', padding: 10, display: 'grid', gap: 9 },
  shieldLayerCard: { border: '1px solid', background: 'linear-gradient(135deg, rgba(216,211,191,0.06), rgba(7,11,12,0.98))', padding: 10, display: 'grid', gap: 9 },
  shieldHint: { color: C.muted, fontSize: 11, lineHeight: 1.45 },
  emptyState: { border: `1px dashed ${C.borderHi}`, color: C.muted, padding: 10, fontSize: 11, lineHeight: 1.5, background: 'rgba(94,234,212,0.035)' },
  ptfeLayerTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ptfeLayerTitle: { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, color: C.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
  ptfeLayerActions: { display: 'flex', gap: 6, alignItems: 'center', flex: '0 0 auto' },
  directionBtn: { minWidth: 34, minHeight: 28, background: '#070b0c', border: '1px solid', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 11, cursor: 'pointer' },
  iconBtn: { width: 30, height: 28, display: 'grid', placeItems: 'center', background: '#070b0c', border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer' },
  ptfeLayerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 9 },
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

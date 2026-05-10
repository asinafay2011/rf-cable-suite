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

function makePtfeId() {
  return `ptfe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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
    let lastAnimationToken = null
    let animationStart = 0
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

        const makeBraidStrand = ({ name, x0, x1, radius, turns, phase, handedness, material, strandRadius, carrierCount }) => {
          const points = []
          for (let i = 0; i < 72; i++) {
            const t = i / 71
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
          const animationChanged = lastAnimationToken !== nextConfig.animateToken
          if (animationChanged) {
            lastAnimationToken = nextConfig.animateToken
            animationStart = performance.now()
          }
          const elapsed = nextConfig.animateToken ? (performance.now() - animationStart) / 1000 : 999
          const signature = JSON.stringify({
            ptfeStack: nextConfig.ptfeStack,
            braidCoverage: nextConfig.braidCoverage,
            showBraidPreview: nextConfig.showBraidPreview,
            animateToken: nextConfig.animateToken,
            frame: elapsed < 4.2 ? Math.floor(elapsed * 30) : 'done',
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
          const braidBright = new THREE.MeshStandardMaterial({ name: 'live braid bright carrier', color: 0xd8d2bd, roughness: 0.24, metalness: 0.82 })
          const braidDark = new THREE.MeshStandardMaterial({ name: 'live braid shadow carrier', color: 0x807a69, roughness: 0.36, metalness: 0.72 })

          dynamicGroup.add(makeCylinderX({
            name: 'live continuous copper conductor',
            x0: -1.72,
            x1: 2.92,
            radius: 0.072,
            material: copperMat,
          }))

          const stack = Array.isArray(nextConfig.ptfeStack) ? nextConfig.ptfeStack : []
          stack.forEach((layer, layerIndex) => {
            const passes = clamp(Math.round(layer.passes || 1), 1, 12)
            const width = clamp(Number(layer.width) || 6, 2, 14)
            const direction = layer.direction === 'S' ? 'S' : 'Z'
            const handedness = direction === 'Z' ? 1 : -1
            const tapeWidth = clamp(width * 0.052, 0.16, 0.54)
            const turns = clamp(18 / width + 1.65 + passes * 0.035, 2.6, 7.2)
            const layerProgress = elapsed < 4 ? clamp((elapsed - layerIndex * 0.48) / 1.25, 0, 1) : 1
            const phase = layerIndex * 1.1
            const radius = 0.255 + layerIndex * 0.055
            const x0 = -1.45
            const x1 = 2.34
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

          if (nextConfig.showBraidPreview && stack.length > 0) {
            const coverage = clamp(Number(nextConfig.braidCoverage) || 92, 65, 99)
            let carrierCount = Math.round(8 + ((coverage - 65) / 34) * 12)
            if (carrierCount % 2) carrierCount += 1
            const strandRadius = 0.0045 + ((coverage - 65) / 34) * 0.0042
            const turns = 3.2 + ((coverage - 65) / 34) * 1.7
            for (const handedness of [1, -1]) {
              const material = handedness === 1 ? braidBright : braidDark
              for (let carrier = 0; carrier < carrierCount; carrier++) {
                const phase = (Math.PI * 2 * carrier) / carrierCount + (handedness === 1 ? 0.15 : 0.52)
                dynamicGroup.add(makeBraidStrand({
                  name: `live braid ${coverage.toFixed(0)}pct ${handedness > 0 ? 'Z' : 'S'} carrier ${carrier + 1}`,
                  x0: -1.82,
                  x1: -0.68,
                  radius: 0.55,
                  turns,
                  phase,
                  handedness,
                  material,
                  strandRadius,
                  carrierCount,
                }))
              }
            }
          }

          modelGroup.add(dynamicGroup)
        }
        runtimeRef.current.rebuildDynamic = rebuildDynamic
        rebuildDynamic(runtimeRef.current.config || config || {}, true)

        camera = new THREE.PerspectiveCamera(30, 1, 0.01, 120)
        camera.position.set(0, 0.14, 8.25)
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
              const isReferenceSurface = /table/.test(nodeLabel)
              if (!isReferenceSurface) node.visible = false
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
          if (liveConfig?.animateToken && performance.now() - animationStart < 4300) {
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
    ['02', 'PTFE stack', `${computed.ptfeLayerCount} layers · ${computed.ptfeLayers} passes`, '#fff2c4'],
    ['03', 'SPC spiral', `${computed.spiralBobbins} bobbins · ${fmt(computed.spiralCoverage, 0)}%`, C.foil],
    ['04', 'SPC helical', `${computed.helicalBobbins} bobbins · ${fmt(computed.helicalCoverage, 0)}%`, C.sky],
    ['05', 'Foil shield', `${fmt(computed.foilCoverage, 0)}% seam`, C.foil],
    ['06', 'Braid', `${fmt(computed.braidCoverage, 0)}% coverage`, C.braid],
    ['07', 'Jacket', `${fmt(computed.jacketOD, 1)} mm OD`, C.sky],
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

function PTFELayerCard({ layer, index, canRemove, onUpdate, onRemove }) {
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
          <button
            type="button"
            onClick={() => onUpdate({ direction: direction === 'Z' ? 'S' : 'Z' })}
            style={{ ...S.directionBtn, border: `1px solid ${accent}88`, color: accent }}
          >
            {direction}
          </button>
          <button type="button" onClick={onRemove} disabled={!canRemove} style={{ ...S.iconBtn, opacity: canRemove ? 1 : 0.35 }}>
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

export default function RFStackLab() {
  const [params, setParams] = useState(PRESETS.phaseStable)
  const [ptfeStack, setPtfeStack] = useState([])
  const [activePreset, setActivePreset] = useState('')
  const [animationToken, setAnimationToken] = useState(1)
  const [showBraidPreview, setShowBraidPreview] = useState(false)
  const modelConfig = useMemo(() => ({
    ptfeStack,
    braidCoverage: params.braidCoverage,
    showBraidPreview,
    animateToken: animationToken,
  }), [animationToken, params.braidCoverage, ptfeStack, showBraidPreview])
  const { mountRef, status } = useRfStackModel(modelConfig)

  const setParam = (key) => (value) => {
    setParams((current) => ({ ...current, [key]: value }))
    if (key === 'braidCoverage') setShowBraidPreview(true)
    setActivePreset('')
  }

  const loadPreset = (key) => {
    setActivePreset(key)
    setParams(PRESETS[key])
    setPtfeStack(makePresetStack(PRESETS[key]))
    setShowBraidPreview(false)
    setAnimationToken((token) => token + 1)
  }

  const updatePtfeLayer = (id, patch) => {
    setPtfeStack((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer))
    setActivePreset('')
    setShowBraidPreview(false)
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
        },
      ].slice(0, 8)
    })
    setActivePreset('')
    setShowBraidPreview(false)
    setAnimationToken((token) => token + 1)
  }

  const removePtfeLayer = (id) => {
    setPtfeStack((current) => current.length <= 1 ? current : current.filter((layer) => layer.id !== id))
    setActivePreset('')
    setShowBraidPreview(false)
    setAnimationToken((token) => token + 1)
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
        })))
        setShowBraidPreview(false)
        setAnimationToken((token) => token + 1)
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
    const epsBase = layerBuilds.length && dielectricWall > 0
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
    const spiralGap = -Math.abs(params.spiralGap)
    const helicalGap = -Math.abs(params.helicalGap)
    const pitchSpiral = pitchFrom(params.spiralWidth, spiralGap, dielectricOD + 0.25, params.spiralBobbins)
    const pitchHelical = pitchFrom(params.helicalWidth, helicalGap, dielectricOD + 0.48, params.helicalBobbins)
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
      ptfeNotches,
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
  }, [params, ptfeStack])

  const traces = useMemo(() => {
    const rl = []
    const il = []
    const tdr = []
    for (let i = 0; i < 180; i++) {
      const t = i / 179
      const f = 0.2 * (params.freqGHz * 2 / 0.2) ** t
      const notchSources = [...computed.ptfeNotches.map((item) => item.freq), computed.spiralNotch, computed.helicalNotch]
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
              <div style={S.blockTitle}><Zap size={13} /> Conductor + PTFE stack</div>
              <Slider label="Conductor OD" value={params.conductorOD} setValue={setParam('conductorOD')} min={0.2} max={2.2} step={0.01} unit=" mm" accent={C.copperHi} />
              <div style={S.ptfeToolbar}>
                <button type="button" style={S.toolBtn} onClick={() => addPtfeLayer('Z')}>
                  <Plus size={13} /> Add tape Z
                </button>
                <button type="button" style={S.toolBtn} onClick={() => addPtfeLayer('S')}>
                  <Plus size={13} /> Add tape S
                </button>
                <button type="button" style={{ ...S.toolBtn, color: C.teal, border: `1px solid ${C.teal}66` }} onClick={() => setAnimationToken((token) => token + 1)}>
                  <Play size={13} /> Play wrap
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
                    onRemove={() => removePtfeLayer(layer.id)}
                  />
                ))}
              </div>
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
  presetBtnActive: { border: `1px solid ${C.amber}`, color: C.amber, background: 'rgba(251,191,36,0.11)' },
  resetBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.dim, padding: '7px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', cursor: 'pointer' },
  controlSections: { display: 'grid', gap: 12 },
  controlBlock: { border: `1px solid rgba(167,176,182,0.13)`, background: '#080d0f', padding: 12, display: 'grid', gap: 11 },
  blockTitle: { display: 'flex', alignItems: 'center', gap: 8, color: C.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  ptfeToolbar: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  toolBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, cursor: 'pointer' },
  ptfeStackList: { display: 'grid', gap: 9 },
  ptfeLayerCard: { border: '1px solid', background: 'linear-gradient(135deg, rgba(255,242,196,0.06), rgba(7,11,12,0.98))', padding: 10, display: 'grid', gap: 9 },
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

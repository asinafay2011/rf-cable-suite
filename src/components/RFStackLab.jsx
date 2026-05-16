import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Brain, ClipboardList, GitCompare, Layers, Play, Plus, RotateCcw, ShieldCheck, Target, Trash2, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  FOIL_TAPE_MATERIALS,
  PTFE_TAPE_MATERIALS,
  SPC_FLATWIRE_MATERIALS,
  findNearestFoilTape,
  findNearestPtfeTape,
  findNearestSpcFlatwire,
  foilTapeToLayer,
  normalizePtfeWrap,
  ptfeWrapLayers,
  ptfeWrapPercent,
  ptfeTapeToLayer,
  ptfeShopPitchSetpoint,
  recommendPtfeWrapForCable,
  spiralFlatwireWidthFromDielectricOd,
  spcFlatwireToLayer,
  DEFAULT_SPIRAL_BOBBINS,
  DEFAULT_SPIRAL_GAP_PCT,
  SMALL_CABLE_MAX_PTFE_WIDTH_IN,
  SMALL_CABLE_TAPE_OD_IN,
} from '../data/materialLibrary.js'

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
  foil: '#d4a02f',
  braid: '#c8c0aa',
}

const PRESETS = {
  phaseStable: {
    label: 'Phase-stable RF coax',
    conductorOD: 0.92,
    ptfeLayers: 9,
    ptfeMil: 2,
    ptfeWidth: 0.635,
    ptfeOverlap: 66.7,
    ptfeDensity: 0.78,
    ptfeStack: [
      { passes: 4, mil: 2.0, width: 0.635, overlap: 66.7, density: 0.78, direction: 'Z' },
      { passes: 3, mil: 1.5, width: 0.508, overlap: 50, density: 0.72, direction: 'S' },
      { passes: 2, mil: 1.0, width: 0.381, overlap: 75, density: 0.86, direction: 'Z' },
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
    ptfeWidth: 0.635,
    ptfeOverlap: 66.7,
    ptfeDensity: 0.72,
    ptfeStack: [
      { passes: 4, mil: 1.5, width: 0.635, overlap: 66.7, density: 0.70, direction: 'Z' },
      { passes: 3, mil: 1.2, width: 0.508, overlap: 50, density: 0.72, direction: 'S' },
      { passes: 3, mil: 1.0, width: 0.381, overlap: 75, density: 0.75, direction: 'Z' },
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
    ptfeWidth: 0.635,
    ptfeOverlap: 66.7,
    ptfeDensity: 0.86,
    ptfeStack: [
      { passes: 3, mil: 2.5, width: 0.635, overlap: 66.7, density: 0.86, direction: 'Z' },
      { passes: 3, mil: 2.0, width: 0.508, overlap: 50, density: 0.86, direction: 'S' },
      { passes: 2, mil: 1.5, width: 0.381, overlap: 75, density: 0.92, direction: 'Z' },
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
  miSt962032130: {
    label: 'MI-ST962-032-130',
    conductorOD: 0.729,
    ptfeLayers: 4,
    ptfeMil: 5,
    ptfeWidth: 0.508,
    ptfeOverlap: 58.35,
    ptfeDensity: 0.7,
    suckout: 3,
    ptfeStack: [
      { passes: 1, partNumber: '962-96000-05L0150', mil: 5, width: 0.381, overlap: 50, density: 0.7, direction: 'Z', pitchSetpointMm: 2.7051, ODAfterMm: 1.0414, effectiveEps: 1.6203 },
      { passes: 1, partNumber: '962-96000-05L0200', mil: 5, width: 0.508, overlap: 50, density: 0.7, direction: 'S', pitchSetpointMm: 3.5560, ODAfterMm: 1.3462, effectiveEps: 1.6203 },
      { passes: 1, partNumber: '962-96000-05L0200', mil: 5, width: 0.508, overlap: 66.7, density: 0.7, direction: 'Z', pitchSetpointMm: 1.8796, ODAfterMm: 1.7018, effectiveEps: 1.6203 },
      { passes: 1, partNumber: '962-96000-05L0250', mil: 5, width: 0.635, overlap: 66.7, density: 0.7, direction: 'S', pitchSetpointMm: 2.2860, ODAfterMm: 2.0947, effectiveEps: 1.6203 },
    ],
    shieldStack: [
      { type: 'spiral', partNumber: '962-96001-SPC-2.5-0300', label: 'SPC spiral · sheet 4', direction: 'S', length: 155, width: 0.762, pitch: 2.5, bobbins: 8, gap: 5.7 },
      { type: 'foil', partNumber: '962-96003-ALK-1.4-0250', label: 'Foil in · sheet 4', length: 152, overlap: 50, pitch: 3.556 },
      { type: 'braid', label: 'Niehoff braid · sheet 10', length: 142, carriers: 16, ends: 8, picks: 20.5, gauge: 40, coverage: 97.29 },
    ],
    spiralWidth: 0.762,
    spiralGap: 5.7,
    spiralBobbins: 8,
    helicalWidth: 0.19,
    helicalOverlap: 45,
    foilOverlap: 50,
    braidCoverage: 97.29,
    jacketOD: 2.642,
    freqGHz: 40,
  },
  miSt962032200: {
    label: 'MI-ST962-032-200',
    previewStage: 'spiral',
    conductorOD: 1.3208,
    ptfeLayers: 4,
    ptfeMil: 5,
    ptfeWidth: 0.813,
    ptfeOverlap: 68.75,
    ptfeDensity: 0.9,
    suckout: 2,
    ptfeStack: [
      { passes: 1, partNumber: '962-96000-05L0250', mil: 5, width: 0.635, overlap: 66.7, density: 0.7, direction: 'Z', pitchSetpointMm: 2.4384, ODAfterMm: 1.7780, effectiveEps: 1.6170 },
      { passes: 1, partNumber: '962-96000-05H0250', mil: 5, width: 0.635, overlap: 66.7, density: 1.6, direction: 'S', pitchSetpointMm: 2.2860, ODAfterMm: 2.4384, effectiveEps: 1.6170 },
      { passes: 1, partNumber: '962-96000-05L0375', mil: 5, width: 0.9525, overlap: 75, density: 0.7, direction: 'Z', pitchSetpointMm: 2.4003, ODAfterMm: 3.1750, effectiveEps: 1.6170 },
      { passes: 1, partNumber: '962-96000-04H0375', mil: 4, width: 0.9525, overlap: 66.7, density: 1.6, direction: 'Z', pitchSetpointMm: 3.3909, ODAfterMm: 3.6830, effectiveEps: 1.6170 },
    ],
    shieldStack: [
      { type: 'spiral', partNumber: '962-96001-SPC-2.5-0500', label: 'SPC spiral · sheet 4', direction: 'S', length: 155, width: 1.27, pitch: 2.7, bobbins: 8, gap: 14.5, dieSizeIn: 0.149, ODAfterMm: 3.8608 },
      { type: 'foil', partNumber: '962-96003-1.4-0250', label: 'Foil in · sheet 4', length: 152, overlap: 50, pitch: 3.9624, tension: 5.5, ODAfterMm: 4.0386 },
      { type: 'braid', label: 'Niehoff braid · sheet 10', length: 142, carriers: 16, ends: 10, picks: 11.7, gauge: 38, coverage: 95 },
    ],
    spiralWidth: 1.27,
    spiralGap: 14.5,
    spiralBobbins: 8,
    helicalWidth: 0.19,
    helicalOverlap: 45,
    foilOverlap: 50,
    braidCoverage: 95,
    jacketOD: 4.3942,
    freqGHz: 30,
  },
}

const PTFE_SOLID_DENSITY = 2.15
const PTFE_SOLID_EPS = 2.1
const MIL_TO_MM = 0.0254
const MM_PER_IN = 25.4
const GOLDEN_HISTORY_KEY = 'rf-stack-golden-history-v1'
const EMPTY_MEASURED_TEST = {
  cableId: '',
  measuredZ0: '',
  measuredVp: '',
  measuredSuckoutGHz: '',
  measuredFinalOdIn: '',
  measuredIlDb: '',
  measuredRlDb: '',
  measuredVswr: '',
  measuredCapPfFt: '',
  notes: '',
}

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

function parseFirstNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const value = Number(String(match[1]).replace(/,/g, ''))
      if (Number.isFinite(value)) return value
    }
  }
  return ''
}

function parseMeasuredPaste(text) {
  const source = String(text || '')
  if (!source.trim()) return {}
  return {
    cableId: source.match(/\b(?:MI[-\w.]+|ST[-\w.]+|962[-\w.]+)/i)?.[0] || '',
    measuredZ0: parseFirstNumber(source, [
      /(?:av\.?\s*)?z(?:0|o)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /impedance[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    measuredVp: parseFirstNumber(source, [
      /v(?:p|elocity)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*%/i,
      /velocity[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    measuredSuckoutGHz: parseFirstNumber(source, [
      /suck\s*out[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
      /notch[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:g|ghz)/i,
      /dip[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:g|ghz)/i,
    ]),
    measuredFinalOdIn: parseFirstNumber(source, [
      /(?:final|outgoing|tu)?\s*o\.?d\.?[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|")/i,
      /(?:final|outgoing|tu)?\s*od[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    measuredIlDb: parseFirstNumber(source, [
      /(?:insertion\s*loss|s21|attenuation)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*dB/i,
    ]),
    measuredRlDb: parseFirstNumber(source, [
      /(?:return\s*loss|rl|s11)[^0-9-]*([0-9]+(?:\.[0-9]+)?)\s*dB/i,
    ]),
    measuredVswr: parseFirstNumber(source, [
      /vswr[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
    ]),
    measuredCapPfFt: parseFirstNumber(source, [
      /(?:capacitance|cap\.?|pf\/ft)[^0-9-]*([0-9]+(?:\.[0-9]+)?)/i,
      /([0-9]+(?:\.[0-9]+)?)\s*pF\s*\/\s*ft/i,
    ]),
  }
}

function numeric(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function buildMeasuredCorrelation(measured, computed) {
  const z0 = numeric(measured.measuredZ0)
  const vp = numeric(measured.measuredVp)
  const suckout = numeric(measured.measuredSuckoutGHz)
  const finalOdIn = numeric(measured.measuredFinalOdIn)
  const rlDb = numeric(measured.measuredRlDb)
  const vswr = numeric(measured.measuredVswr)
  const ilDb = numeric(measured.measuredIlDb)
  const capPfFt = numeric(measured.measuredCapPfFt)
  const predictedVp = computed.vp * 100
  const predictedFinalOdIn = (computed.jacketInstalled ? computed.jacketOD : computed.dielectricOD) / MM_PER_IN
  const notchCandidates = [
    ...computed.ptfeNotches.map((item) => ({ label: item.label, freq: item.freq, source: 'PTFE pitch' })),
    ...(computed.spiralCoverage > 0 ? [{ label: 'SPC spiral', freq: computed.spiralNotch, source: 'spiral pitch/gap' }] : []),
    ...(computed.helicalCoverage > 0 ? [{ label: 'SPC helical', freq: computed.helicalNotch, source: 'helical pitch' }] : []),
  ].filter((item) => Number.isFinite(item.freq))
  const nearestNotch = suckout && notchCandidates.length
    ? notchCandidates.reduce((best, item) => {
      const error = Math.abs(item.freq - suckout)
      return !best || error < best.error ? { ...item, error } : best
    }, null)
    : null
  const items = []
  if (z0 != null) {
    const delta = z0 - computed.z0
    if (Math.abs(delta) <= 1.5) {
      items.push({ level: 'pass', title: 'Impedance correlation', body: `Measured ${fmt(z0, 1)} Ω is within ${fmt(Math.abs(delta), 1)} Ω of the stack prediction.` })
    } else if (delta < 0) {
      items.push({ level: 'warn', title: 'Impedance is low', body: `Measured Z0 is ${fmt(Math.abs(delta), 1)} Ω below prediction. Check low dielectric OD, dense/compressed PTFE, foil/spiral pressure, or conductor OD high.` })
    } else {
      items.push({ level: 'warn', title: 'Impedance is high', body: `Measured Z0 is ${fmt(delta, 1)} Ω above prediction. Check high dielectric OD, under-built PTFE, low-density mix, or conductor OD low.` })
    }
  }
  if (vp != null) {
    const delta = vp - predictedVp
    if (Math.abs(delta) <= 1.2) {
      items.push({ level: 'pass', title: 'VP match', body: `Measured VP ${fmt(vp, 1)}% tracks the predicted ${fmt(predictedVp, 1)}%.` })
    } else if (delta < 0) {
      items.push({ level: 'warn', title: 'VP is low', body: `Measured VP is ${fmt(Math.abs(delta), 1)} points low. Effective εr is higher than expected: look for high-density tape, shrink-back, tight tension, or moisture/void collapse.` })
    } else {
      items.push({ level: 'warn', title: 'VP is high', body: `Measured VP is ${fmt(delta, 1)} points high. Dielectric is acting more air-like than the model: check LD tape ratio, wall build, and OD measurement.` })
    }
  }
  if (finalOdIn != null) {
    const delta = finalOdIn - predictedFinalOdIn
    if (Math.abs(delta) <= 0.002) {
      items.push({ level: 'pass', title: 'OD tracks build', body: `Measured OD ${fmt(finalOdIn, 4)} in is close to predicted ${fmt(predictedFinalOdIn, 4)} in.` })
    } else if (delta < 0) {
      items.push({ level: 'warn', title: 'OD is low', body: `Measured OD is ${fmt(Math.abs(delta), 4)} in under model. That usually lowers impedance and points to tape shrink-back, low wrap build, or tighter jacket drawdown.` })
    } else {
      items.push({ level: 'info', title: 'OD is high', body: `Measured OD is ${fmt(delta, 4)} in over model. Check tape overlap, foil/jacket thickness, or loose wrap tension.` })
    }
  }
  if (nearestNotch) {
    const pct = nearestNotch.error / Math.max(0.1, suckout) * 100
    if (pct <= 8) {
      items.push({ level: 'warn', title: 'Suckout matches build pitch', body: `${fmt(suckout, 2)} GHz is close to ${nearestNotch.label} (${fmt(nearestNotch.freq, 2)} GHz). Stagger that pitch or move it above the test band.` })
    } else {
      items.push({ level: 'info', title: 'Suckout does not match modeled pitch', body: `${fmt(suckout, 2)} GHz is not close to the modeled PTFE/spiral/helical notches. Inspect connector launch, foil seam, braid transition, or test fixture resonance.` })
    }
  }
  if (rlDb != null && rlDb < 18) {
    items.push({ level: 'warn', title: 'Return loss risk', body: `Measured RL ${fmt(rlDb, 1)} dB is weak. If impedance and VP match, the likely issue is a localized discontinuity: connector launch, shield transition, or foil/braid step.` })
  }
  if (vswr != null && vswr > 1.25) {
    items.push({ level: 'warn', title: 'VSWR fail clue', body: `Measured VSWR ${fmt(vswr, 2)} is high. Correlate the frequency of the worst point against the notch list and TDR step.` })
  }
  if (ilDb != null && ilDb > Math.abs(computed.baseLoss) * 1.35) {
    items.push({ level: 'info', title: 'Loss above model', body: `Measured loss ${fmt(ilDb, 2)} dB is above the smooth model. Check conductor plating, braid contact, dielectric density, and connector loss.` })
  }
  if (capPfFt != null && z0 != null && vp != null) {
    items.push({ level: 'info', title: 'Capacitance consistency', body: `${fmt(capPfFt, 1)} pF/ft should move opposite Z0. If capacitance is high and Z0 is low, dielectric OD/build is the first suspect.` })
  }
  if (!items.length) {
    items.push({ level: 'info', title: 'Enter measured values', body: 'Paste a test summary or enter Z0, VP, OD, RL/VSWR, and suckout frequency to compare actual test data against this stack.' })
  }
  return { items, nearestNotch, predictedVp, predictedFinalOdIn }
}

function readGoldenHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOLDEN_HISTORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeGoldenHistory(items) {
  try {
    localStorage.setItem(GOLDEN_HISTORY_KEY, JSON.stringify(items.slice(0, 24)))
  } catch {}
}

function primarySuckoutGHz(computed) {
  const values = [
    computed?.tapeNotch,
    computed?.spiralCoverage ? computed?.spiralNotch : Infinity,
    computed?.helicalCoverage ? computed?.helicalNotch : Infinity,
  ].filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? Math.min(...values) : null
}

function formatDelta(value, digits = 1, suffix = '') {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${suffix}`
}

function buildPreApplyPreview(computed, ptfeStack, shieldStack) {
  const primary = primarySuckoutGHz(computed)
  const duplicatedPitchCount = computed.ptfeNotches.reduce((count, notch, index) => {
    return count + computed.ptfeNotches.slice(index + 1).filter((other) => Math.abs(other.freq - notch.freq) <= notch.freq * 0.05).length
  }, 0)
  const checks = [
    {
      label: 'PTFE recipe',
      value: `${ptfeStack.length} tape ${ptfeStack.length === 1 ? 'layer' : 'layers'}`,
      level: ptfeStack.length ? 'pass' : 'warn',
      note: ptfeStack.length ? 'stack is defined' : 'add the dielectric build before MI/apply',
    },
    {
      label: 'Z0 target',
      value: `${fmt(computed.z0, 1)} Ω`,
      level: Math.abs(computed.z0 - 50) <= 1.5 ? 'pass' : Math.abs(computed.z0 - 50) <= 3 ? 'info' : 'warn',
      note: `${formatDelta(computed.z0 - 50, 1, ' Ω')} from 50 Ω`,
    },
    {
      label: 'Velocity factor',
      value: `${fmt(computed.vp * 100, 1)}%`,
      level: computed.vp > 0.72 && computed.vp < 0.86 ? 'pass' : 'info',
      note: `εr eff ${fmt(computed.eps, 3)}`,
    },
    {
      label: 'Primary suckout',
      value: primary ? `${fmt(primary, 2)} GHz` : '—',
      level: primary && primary < computed.freqGHz * 1.05 ? 'warn' : 'pass',
      note: primary && primary < computed.freqGHz * 1.05 ? 'inside or near test band' : 'outside active band',
    },
    {
      label: 'Shield stack',
      value: `${fmt(computed.shieldCoverage, 1)}%`,
      level: shieldStack.length && computed.shieldCoverage >= 94 ? 'pass' : shieldStack.length ? 'info' : 'warn',
      note: shieldStack.length ? `${shieldStack.length} shield/mechanical layers` : 'no shield layers yet',
    },
    {
      label: 'Pitch separation',
      value: duplicatedPitchCount ? `${duplicatedPitchCount} overlap` : 'clear',
      level: duplicatedPitchCount ? 'warn' : 'pass',
      note: duplicatedPitchCount ? 'two tape pitches are too close' : 'PTFE pitch notches are staggered',
    },
  ]
  const warningCount = checks.filter((check) => check.level === 'warn').length
  return {
    status: warningCount ? 'review' : 'ready',
    warningCount,
    primary,
    checks,
  }
}

function measuredSampleFromEntry(entry, fallbackComputed = null) {
  const measured = entry?.measured || {}
  const summary = entry?.summary || {}
  const measuredZ0 = numeric(measured.measuredZ0)
  const measuredVp = numeric(measured.measuredVp)
  const measuredOdIn = numeric(measured.measuredFinalOdIn)
  const predictedZ0 = Number(summary.z0 ?? fallbackComputed?.z0)
  const predictedVp = Number(summary.vp != null ? summary.vp * 100 : fallbackComputed?.vp ? fallbackComputed.vp * 100 : NaN)
  const predictedOdIn = Number(summary.jacketOD || summary.dielectricOD
    ? (summary.jacketOD || summary.dielectricOD) / MM_PER_IN
    : fallbackComputed
      ? ((fallbackComputed.jacketInstalled ? fallbackComputed.jacketOD : fallbackComputed.dielectricOD) / MM_PER_IN)
      : NaN)
  return {
    label: entry?.label || measured.cableId || 'Current measured',
    z0Delta: measuredZ0 != null && Number.isFinite(predictedZ0) ? measuredZ0 - predictedZ0 : null,
    vpDelta: measuredVp != null && Number.isFinite(predictedVp) ? measuredVp - predictedVp : null,
    odDeltaIn: measuredOdIn != null && Number.isFinite(predictedOdIn) ? measuredOdIn - predictedOdIn : null,
  }
}

function averageDelta(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value))
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildFeedbackLearner(history, measured, computed) {
  const samples = history.map((entry) => measuredSampleFromEntry(entry)).filter((sample) => (
    Number.isFinite(sample.z0Delta) || Number.isFinite(sample.vpDelta) || Number.isFinite(sample.odDeltaIn)
  ))
  const currentSample = measuredSampleFromEntry({ label: measured.cableId || 'Unsaved test', measured, summary: {} }, computed)
  if (Number.isFinite(currentSample.z0Delta) || Number.isFinite(currentSample.vpDelta) || Number.isFinite(currentSample.odDeltaIn)) {
    samples.unshift(currentSample)
  }
  const z0Bias = averageDelta(samples, 'z0Delta')
  const vpBias = averageDelta(samples, 'vpDelta')
  const odBiasIn = averageDelta(samples, 'odDeltaIn')
  const recommendations = []
  if (samples.length < 2) {
    recommendations.push({ level: 'info', text: 'Save a few tested reels as golden recipes so the learner can separate real process bias from one-off test noise.' })
  }
  if (Number.isFinite(z0Bias) && Math.abs(z0Bias) > 1) {
    recommendations.push({
      level: 'warn',
      text: z0Bias < 0
        ? `Measured Z0 averages ${fmt(Math.abs(z0Bias), 1)} Ω low. Bias next build toward slightly larger dielectric OD, less compression, or lower effective εr.`
        : `Measured Z0 averages ${fmt(z0Bias, 1)} Ω high. Bias next build toward slightly smaller dielectric OD or denser/tighter PTFE.`,
    })
  }
  if (Number.isFinite(vpBias) && Math.abs(vpBias) > 0.8) {
    recommendations.push({
      level: 'warn',
      text: vpBias < 0
        ? `Measured VP averages ${fmt(Math.abs(vpBias), 1)} points low. Treat the tape mix as denser than catalog or loosen shrink-back compensation.`
        : `Measured VP averages ${fmt(vpBias, 1)} points high. Current stack behaves more air-like than the model; reduce LD ratio assumptions or verify OD.`,
    })
  }
  if (Number.isFinite(odBiasIn) && Math.abs(odBiasIn) > 0.0015) {
    recommendations.push({
      level: odBiasIn < 0 ? 'warn' : 'info',
      text: odBiasIn < 0
        ? `Measured OD averages ${fmt(Math.abs(odBiasIn), 4)} in below model. Add shrink-back correction before issuing the next MI.`
        : `Measured OD averages ${fmt(odBiasIn, 4)} in above model. Check overlap/tension and jacket drawdown before changing impedance math.`,
    })
  }
  if (!recommendations.length) {
    recommendations.push({ level: 'pass', text: 'Saved test data tracks the calculator closely; keep this recipe as the current baseline.' })
  }
  return {
    samples,
    z0Bias,
    vpBias,
    odBiasIn,
    recommendations,
  }
}

function buildSuckoutDoctor(computed, measured) {
  const measuredSuckout = numeric(measured.measuredSuckoutGHz)
  const primary = primarySuckoutGHz(computed)
  const target = measuredSuckout || primary || computed.freqGHz
  const candidates = [
    ...computed.ptfeNotches.map((item) => ({ ...item, source: 'PTFE tape pitch', kind: 'ptfe' })),
    computed.spiralCoverage ? { label: 'SPC spiral', freq: computed.spiralNotch, pitch: computed.pitchSpiral, source: 'spiral repeat', kind: 'spiral' } : null,
    computed.helicalCoverage ? { label: 'SPC helical', freq: computed.helicalNotch, pitch: computed.pitchHelical, source: 'helical repeat', kind: 'helical' } : null,
    computed.foilInstalled ? { label: 'Foil seam', freq: computed.freqGHz * 0.88, pitch: computed.helicalPitch, source: 'foil seam / overlap', kind: 'foil' } : null,
  ].filter((item) => item && Number.isFinite(item.freq) && item.freq > 0)
  const ranked = candidates
    .map((item) => ({ ...item, error: Math.abs(item.freq - target), errorPct: Math.abs(item.freq - target) / Math.max(0.1, target) * 100 }))
    .sort((a, b) => a.error - b.error)
  const root = ranked[0] || null
  const actions = []
  if (root?.kind === 'ptfe') {
    actions.push('Stagger this PTFE pitch from the neighboring tape pass by 8-12%.')
    actions.push('Keep 2/3 wrap for shrink-back control; use 1/2 only when OD needs to land lower.')
    actions.push('Alternate Z/S lay direction and avoid repeating the same pitch on adjacent passes.')
  } else if (root?.kind === 'spiral') {
    actions.push('Move spiral pitch or 8-bobbin gap enough that the repeat notch leaves the test band.')
    actions.push('Recheck the flatwire width rule: dielectric OD × π / bobbins minus requested gap.')
    actions.push('If gap is visually gone, verify width/gap in the 3D stack before saving the MI.')
  } else if (root?.kind === 'helical') {
    actions.push('Change helical pitch separately from spiral pitch so both shield repeats do not line up.')
    actions.push('Use the measured OD after spiral as the base OD before setting the helical/foil layer.')
  } else if (root?.kind === 'foil') {
    actions.push('Offset foil seam, confirm 1/2 vs 2/3 wrap from the MI, and keep seam pressure consistent.')
    actions.push('If return loss is weak but OD/Z0 are good, inspect connector launch and foil-to-braid transition.')
  } else {
    actions.push('No pitch match is strong yet; check connector launch, fixture resonance, and shield transition first.')
  }
  if (numeric(measured.measuredVswr) > 1.25 || numeric(measured.measuredRlDb) < 18) {
    actions.push('VSWR/RL points to a localized discontinuity; compare TDR bump with connector and shield transition locations.')
  }
  return { target, root, ranked: ranked.slice(0, 5), actions }
}

function buildGoldenDiff(entry, computed, ptfeStack, shieldStack) {
  if (!entry) return []
  const summary = entry.summary || {}
  const goldenPtfe = Array.isArray(entry.ptfeStack) ? entry.ptfeStack : []
  const goldenShield = Array.isArray(entry.shieldStack) ? entry.shieldStack : []
  const currentPrimary = primarySuckoutGHz(computed)
  const rows = [
    {
      label: 'Z0',
      current: `${fmt(computed.z0, 1)} Ω`,
      golden: summary.z0 != null ? `${fmt(summary.z0, 1)} Ω` : '—',
      delta: summary.z0 != null ? formatDelta(computed.z0 - summary.z0, 1, ' Ω') : '—',
    },
    {
      label: 'VP',
      current: `${fmt(computed.vp * 100, 1)}%`,
      golden: summary.vp != null ? `${fmt(summary.vp * 100, 1)}%` : '—',
      delta: summary.vp != null ? formatDelta((computed.vp - summary.vp) * 100, 1, ' pt') : '—',
    },
    {
      label: 'Dielectric OD',
      current: `${fmt(computed.dielectricOD / MM_PER_IN, 4)} in`,
      golden: summary.dielectricOD != null ? `${fmt(summary.dielectricOD / MM_PER_IN, 4)} in` : '—',
      delta: summary.dielectricOD != null ? formatDelta((computed.dielectricOD - summary.dielectricOD) / MM_PER_IN, 4, ' in') : '—',
    },
    {
      label: 'Primary suckout',
      current: currentPrimary ? `${fmt(currentPrimary, 2)} GHz` : '—',
      golden: summary.primarySuckout ? `${fmt(summary.primarySuckout, 2)} GHz` : '—',
      delta: summary.primarySuckout && currentPrimary ? formatDelta(currentPrimary - summary.primarySuckout, 2, ' GHz') : '—',
    },
    {
      label: 'PTFE passes',
      current: String(ptfeStack.reduce((sum, layer) => sum + Math.max(1, Number(layer.passes) || 1), 0)),
      golden: String(goldenPtfe.reduce((sum, layer) => sum + Math.max(1, Number(layer.passes) || 1), 0) || '—'),
      delta: formatDelta(ptfeStack.length - goldenPtfe.length, 0, ' layers'),
    },
    {
      label: 'Shield layers',
      current: String(shieldStack.length),
      golden: String(goldenShield.length || '—'),
      delta: formatDelta(shieldStack.length - goldenShield.length, 0, ' layers'),
    },
  ]
  return rows
}

function buildFactoryRunSheetRows(ptfeStack, shieldStack, computed) {
  const rows = []
  const ptfeBuilds = Array.isArray(computed.ptfeBuilds) ? computed.ptfeBuilds : []
  ptfeBuilds.forEach((layer, index) => {
    rows.push({
      step: `Tape #${index + 1}`,
      machine: 'WTM 3-Bay',
      material: layer.partNumber || layer.materialId || 'PTFE tape',
      lay: `${layer.direction || (index % 2 ? 'S' : 'Z')}-DIRECTION`,
      pitch: `${fmt(layer.pitch / MM_PER_IN, 4)} in`,
      wrap: `${ptfeOverlapKey(layer.overlap).toUpperCase()} WRAP`,
      tension: `${fmt(Number(layer.tensionN ?? layer.tension ?? 4), 1)} N`,
      targetOd: `${fmt(layer.odAfterMm / MM_PER_IN, 4)} in`,
      note: `Roller ${index}/${Math.max(6, ptfeBuilds.length + 2)}`,
    })
  })
  let odMm = computed.dielectricOD
  shieldStack.forEach((layer, index) => {
    const type = String(layer.type || '').toLowerCase()
    const explicitOd = Number(layer.ODAfterMm ?? layer.OD_after_mm ?? layer.od_after_mm)
    if (Number.isFinite(explicitOd) && explicitOd > odMm) {
      odMm = explicitOd
    } else if (type === 'spiral') {
      odMm += 0.18
    } else if (type === 'foil') {
      odMm += 0.18
    } else if (type === 'flatwire') {
      odMm += 0.14
    } else if (type === 'braid') {
      odMm += 0.34
    } else if (type === 'jacket' && Number(layer.od) > odMm) {
      odMm = Number(layer.od)
    }
    rows.push({
      step: type === 'spiral' ? 'Spiral shield' : type === 'flatwire' ? 'Flatwire helical' : type === 'foil' ? 'Foil shield' : type === 'braid' ? 'Braid shield' : 'Jacket',
      machine: type === 'braid' ? 'Niehoff Braider' : type === 'spiral' || type === 'foil' || type === 'flatwire' ? 'WTM 2-Bay' : 'Jacket line',
      material: layer.partNumber || layer.part_number || layer.label || type,
      lay: layer.direction ? `${layer.direction}-DIRECTION` : type === 'foil' ? 'FOIL IN' : '-',
      pitch: layer.pitch ? `${fmt(Number(layer.pitch) / MM_PER_IN, 4)} in` : type === 'braid' ? `${fmt(Number(layer.picks), 1)} picks/in` : '-',
      wrap: type === 'spiral' ? `${fmt(Number(layer.gap), 1)}% gap` : type === 'foil' ? `${fmt(Number(layer.overlap), 1)}% overlap` : type === 'braid' ? `${layer.carriers || 16}C x ${layer.ends || 4}E` : '-',
      tension: layer.tension ? `${fmt(Number(layer.tension), 1)} N` : type === 'braid' ? `${fmt(Number(layer.coverage), 1)}% K` : '-',
      targetOd: `${fmt(odMm / MM_PER_IN, 4)} in`,
      note: type === 'braid' ? `AWG ${layer.gauge || '-'}` : '',
    })
  })
  rows.push({
    step: 'Final check',
    machine: 'VNA / Laser',
    material: 'Test',
    lay: '-',
    pitch: '-',
    wrap: '-',
    tension: '-',
    targetOd: `${fmt((computed.jacketInstalled ? computed.jacketOD : odMm) / MM_PER_IN, 4)} in`,
    note: `Z0 ${fmt(computed.z0, 1)} Ω · VP ${fmt(computed.vp * 100, 1)}%`,
  })
  return rows
}

function formatRunSheetText(rows) {
  const header = ['Step', 'Machine', 'Material', 'Lay', 'Pitch', 'Wrap/coverage', 'Tension', 'Target OD', 'Note']
  return [header.join('\t'), ...rows.map((row) => [
    row.step,
    row.machine,
    row.material,
    row.lay,
    row.pitch,
    row.wrap,
    row.tension,
    row.targetOd,
    row.note,
  ].join('\t'))].join('\n')
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

function spiralCoverageFromWidth(widthMm, dielectricOdMm, bobbins = DEFAULT_SPIRAL_BOBBINS) {
  const circ = Math.PI * Number(dielectricOdMm)
  const count = Math.max(1, Math.round(Number(bobbins) || DEFAULT_SPIRAL_BOBBINS))
  const width = Number(widthMm)
  if (!Number.isFinite(circ) || circ <= 0 || !Number.isFinite(width) || width <= 0) return 0
  return clamp((count * width) / circ * 100, 0, 100)
}

function spiralCoverageGapFromWidth(widthMm, dielectricOdMm, bobbins = DEFAULT_SPIRAL_BOBBINS) {
  return clamp(100 - spiralCoverageFromWidth(widthMm, dielectricOdMm, bobbins), 0, 50)
}

function helicalPitchFromOverlap(overlapPct, widthMm) {
  return clamp(Math.max(widthMm, 0.1) * 10 * (1 - clamp(overlapPct, 0, 80) / 100), 0.8, 140)
}

function helicalOverlapFromPitch(pitchMm, widthMm) {
  return clamp((1 - Number(pitchMm) / Math.max(0.1, Number(widthMm) * 10)) * 100, 0, 80)
}

function overlapToPct(value) {
  return ptfeWrapPercent(value)
}

function ptfeOverlapKey(value) {
  return normalizePtfeWrap(value).key
}

function ptfeOverlapLayerCount(value) {
  return ptfeWrapLayers(value)
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

function makePtfeLayer(layer = {}, preset = PRESETS.phaseStable, index = 0) {
  const pitchSetpointMm = Number(layer.pitchSetpointMm ?? layer.pitch_setpoint_mm ?? layer.pitch_mm ?? (layer.pitch_setpoint_in != null ? Number(layer.pitch_setpoint_in) * MM_PER_IN : NaN))
  const odAfterMm = Number(layer.ODAfterMm ?? layer.OD_after_mm ?? layer.od_after_mm)
  const effectiveEps = Number(layer.effectiveEps ?? layer.effective_eps ?? layer.eps_eff)
  const tape = findNearestPtfeTape({
    partNumber: layer.partNumber || layer.part_number,
    thicknessMil: layer.mil ?? layer.tape_thickness_mil ?? (layer.tape_thickness_mm ? layer.tape_thickness_mm / MIL_TO_MM : preset.ptfeMil),
    widthMm: layer.width ?? layer.tape_width_mm ?? preset.ptfeWidth,
    densityGcc: layer.density ?? preset.ptfeDensity,
    densityCode: layer.densityCode || layer.density_code,
    cableOdMm: preset.conductorOD,
  })
  return ptfeTapeToLayer(tape, {
    id: makePtfeId(),
    passes: clamp(Math.round(layer.passes || 1), 1, 12),
    overlap: overlapToPct(layer.overlap ?? preset.ptfeOverlap ?? 66.7),
    direction: layer.direction === 'S' || index % 2 ? 'S' : 'Z',
    pitchSetpointMm: Number.isFinite(pitchSetpointMm) && pitchSetpointMm > 0 ? pitchSetpointMm : undefined,
    ODAfterMm: Number.isFinite(odAfterMm) && odAfterMm > 0 ? odAfterMm : undefined,
    effectiveEps: Number.isFinite(effectiveEps) && effectiveEps > 0 ? effectiveEps : undefined,
    miStation: layer.miStation || layer.mi_station,
    animateKey: makeAnimationKey('ptfe'),
  })
}

function makeShieldLayer(type, source = PRESETS.phaseStable) {
  if (type === 'jacket') {
    return {
      id: makeShieldId(),
      type,
      label: 'Outer jacket',
      length: 190,
      od: source.jacketOD ?? 6.6,
      opacity: 82,
      animateKey: makeAnimationKey('shield'),
    }
  }
  if (type === 'flatwire') {
    const material = findNearestSpcFlatwire({ use: 'helical', thicknessMil: 2.5, widthIn: 0.0075 })
    const width = material?.widthMm ?? source.helicalWidth ?? 0.19
    const overlap = source.helicalOverlap ?? 45
    return spcFlatwireToLayer(material, {
      id: makeShieldId(),
      type,
      label: 'SPC flatwire helical',
      direction: 'S',
      length: 150,
      width,
      pitch: helicalPitchFromOverlap(overlap, width),
      overlap,
      animateKey: makeAnimationKey('shield'),
    })
  }
  if (type === 'foil') {
    const material = findNearestFoilTape({ thicknessMil: 1.4, widthIn: 0.0311 })
    return foilTapeToLayer(material, {
      id: makeShieldId(),
      type,
      label: 'Foil shield',
      length: 152,
      overlap: source.foilOverlap ?? 25,
      animateKey: makeAnimationKey('shield'),
    })
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
  const bobbins = clamp(Math.round(source.spiralBobbins ?? DEFAULT_SPIRAL_BOBBINS), 1, DEFAULT_SPIRAL_BOBBINS)
  const gap = source.spiralGap ?? DEFAULT_SPIRAL_GAP_PCT
  const calculatedWidth = spiralFlatwireWidthFromDielectricOd({
    dielectricOdMm: source.dielectricOD,
    bobbins,
    gapPct: gap,
  })
  const material = findNearestSpcFlatwire({
    use: 'spiral',
    widthMm: Number.isFinite(calculatedWidth.widthMm) ? calculatedWidth.widthMm : source.spiralWidth,
  })
  const width = Number.isFinite(calculatedWidth.widthMm)
    ? calculatedWidth.widthMm
    : material?.widthMm ?? source.spiralWidth ?? 0.5
  return spcFlatwireToLayer(material, {
    id: makeShieldId(),
    type: 'spiral',
    label: 'SPC flatwire spiral',
    direction: 'Z',
    length: 155,
    width,
    pitch: spiralPitchFromGap(gap, width),
    bobbins,
    gap,
    animateKey: makeAnimationKey('shield'),
  })
}

function makePresetShieldStack(preset) {
  if (Array.isArray(preset.shieldStack) && preset.shieldStack.length) {
    return preset.shieldStack.map((layer) => {
      if (layer.type === 'spiral' || layer.type === 'flatwire') {
        const material = findNearestSpcFlatwire({
          partNumber: layer.partNumber || layer.part_number,
          use: layer.type === 'spiral' ? 'spiral' : 'helical',
          widthMm: layer.width,
        })
        return spcFlatwireToLayer(material, {
          id: makeShieldId(),
          ...layer,
          partNumber: material?.partNumber || layer.partNumber,
          width: layer.width ?? material?.widthMm,
          animateKey: makeAnimationKey('shield'),
        })
      }
      if (layer.type === 'foil') {
        const material = findNearestFoilTape({
          partNumber: layer.partNumber || layer.part_number,
          widthMm: layer.width,
        })
        return foilTapeToLayer(material, {
          id: makeShieldId(),
          ...layer,
          partNumber: material?.partNumber || layer.partNumber,
          width: layer.width ?? material?.widthMm,
          animateKey: makeAnimationKey('shield'),
        })
      }
      return {
        id: makeShieldId(),
        ...layer,
        animateKey: makeAnimationKey('shield'),
      }
    })
  }
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
    : [{ passes: preset.ptfeLayers || 1, mil: preset.ptfeMil || 2, width: preset.ptfeWidth || 0.635, overlap: preset.ptfeOverlap || 66.7, density: preset.ptfeDensity || 0.78, direction: 'Z' }]
  return source.map((layer, index) => makePtfeLayer(layer, preset, index))
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

        const makeCutawaySleeveMesh = ({ name, x0, x1, radius, innerRadius, material, progress = 1, openCenter = Math.PI / 2, openAngle = Math.PI * 0.36 }) => {
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

        const makeSpiralBandMesh = ({ name, x0, x1, radius, turns, phase, angularWidth, handedness, material, progress = 1, thickness = 0.008, widthSegments = 5, renderOrder = 8 }) => {
          const p = clamp(progress, 0.02, 1)
          const lengthSegments = Math.max(16, Math.round(220 * p))
          const across = Math.max(1, Math.round(widthSegments))
          const verts = []
          const faces = []
          for (let i = 0; i <= lengthSegments; i++) {
            const t = (i / lengthSegments) * p
            const x = x0 + (x1 - x0) * t
            const center = phase + handedness * turns * Math.PI * 2 * t
            for (let j = 0; j <= across; j++) {
              const offset = (j / across - 0.5) * angularWidth
              const angle = center + offset
              verts.push(x, (radius + thickness) * Math.cos(angle), (radius + thickness) * Math.sin(angle))
            }
          }
          const stride = across + 1
          for (let i = 0; i < lengthSegments; i++) {
            const row = i * stride
            const nextRow = (i + 1) * stride
            for (let j = 0; j < across; j++) {
              faces.push(row + j, row + j + 1, nextRow + j + 1)
              faces.push(row + j, nextRow + j + 1, nextRow + j)
            }
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          geometry.setIndex(faces)
          geometry.computeVertexNormals()
          const mesh = new THREE.Mesh(geometry, material)
          mesh.name = name
          mesh.renderOrder = renderOrder
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
            previewStage: nextConfig.previewStage,
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
          const flatwireGlint = new THREE.MeshStandardMaterial({ name: 'live SPC flatwire narrow highlight', color: 0xffffff, roughness: 0.1, metalness: 1, transparent: true, opacity: 0.46, side: THREE.DoubleSide, depthWrite: false })
          const spiralGapMat = new THREE.MeshStandardMaterial({ name: 'live visible spiral between-wire gap', color: 0x6e7068, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
          const foilMat = new THREE.MeshStandardMaterial({ name: 'live deep golden foil shield', color: 0xd39a22, roughness: 0.2, metalness: 0.94, transparent: true, opacity: 0.94, side: THREE.DoubleSide, depthWrite: true })
          const foilSeamMat = new THREE.MeshStandardMaterial({ name: 'live golden foil overlap seam', color: 0xffcf57, roughness: 0.22, metalness: 0.82, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
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
          const rawShieldStack = Array.isArray(nextConfig.shieldStack) ? nextConfig.shieldStack : []
          const previewStage = nextConfig.previewStage
          const previewIndex = previewStage ? rawShieldStack.findIndex((layer) => layer.type === previewStage) : -1
          const shieldStack = previewIndex >= 0 ? rawShieldStack.slice(0, previewIndex + 1) : rawShieldStack
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
              const jacketGhostMat = new THREE.MeshStandardMaterial({
                name: 'live translucent full jacket wall',
                color: 0x171b1d,
                roughness: 0.72,
                metalness: 0.01,
                transparent: true,
                opacity: clamp(opacity * 0.22, 0.14, 0.32),
                side: THREE.DoubleSide,
                depthWrite: false,
              })
              dynamicGroup.add(makeSleeveMesh({
                name: `live continuous outer jacket wall ${shieldIndex + 1}`,
                x0: jacketX0,
                x1: jacketX1,
                radius: jacketRadius,
                innerRadius: Math.max(radius + 0.035, jacketRadius - 0.095),
                material: jacketGhostMat,
                progress: layerProgress,
              }))
              dynamicGroup.add(makeCutawaySleeveMesh({
                name: `live final outer jacket layer ${shieldIndex + 1}`,
                x0: jacketX0,
                x1: jacketX1,
                radius: jacketRadius,
                innerRadius: Math.max(radius + 0.035, jacketRadius - 0.095),
                material: jacketMat,
                progress: layerProgress,
                openAngle: Math.PI * 0.36,
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

            const width = clamp(Number(layer.width) || 0.13, 0.03, 10)
            const handedness = (layer.direction || (type === 'flatwire' ? 'S' : 'Z')) === 'S' ? -1 : 1

            if (type === 'spiral') {
              const bobbins = clamp(Math.round(Number(layer.bobbins) || DEFAULT_SPIRAL_BOBBINS), 1, DEFAULT_SPIRAL_BOBBINS)
              const pitch = clamp(Number(layer.pitch) || spiralPitchFromGap(Number(layer.gap) || 10, width), 1, 140)
              const gap = clamp(Number(layer.gap ?? DEFAULT_SPIRAL_GAP_PCT), 0, 50)
              const slotAngle = (Math.PI * 2) / Math.max(1, bobbins)
              const bandAngle = slotAngle * (1 - gap / 100)
              const gapAngle = Math.max(0, slotAngle - bandAngle)
              const visualPitch = Math.max(1, pitch * Math.max(1, bobbins))
              const turns = clamp(((x1 - x0) * 13) / visualPitch, 1.2, 9)
              for (let bobbin = 0; bobbin < bobbins; bobbin++) {
                const phase = (Math.PI * 2 * bobbin) / bobbins + shieldIndex * 0.33
                dynamicGroup.add(makeSpiralBandMesh({
                  name: `live SPC flatwire spiral bobbin ${bobbin + 1}`,
                  x0,
                  x1,
                  radius,
                  turns,
                  phase,
                  angularWidth: bandAngle,
                  handedness,
                  material: bobbin % 2 ? flatwireDark : flatwireMat,
                  progress: layerProgress,
                  thickness: 0.014,
                  widthSegments: 5,
                }))
                if (bandAngle > 0.04) {
                  dynamicGroup.add(makeSpiralBandMesh({
                    name: `live SPC flatwire spiral highlight ${bobbin + 1}`,
                    x0,
                    x1,
                    radius,
                    turns,
                    phase: phase - bandAngle * 0.18,
                    angularWidth: Math.min(bandAngle * 0.12, slotAngle * 0.08),
                    handedness,
                    material: flatwireGlint,
                    progress: layerProgress,
                    thickness: 0.019,
                    widthSegments: 1,
                    renderOrder: 9,
                  }))
                }
                if (gapAngle > 0.006) {
                  dynamicGroup.add(makeSpiralBandMesh({
                    name: `live spiral gap between bobbin ${bobbin + 1} and ${bobbin === bobbins - 1 ? 1 : bobbin + 2}`,
                    x0,
                    x1,
                    radius,
                    turns,
                    phase: phase + slotAngle / 2,
                    angularWidth: Math.max(0.006, gapAngle * 0.68),
                    handedness,
                    material: spiralGapMat,
                    progress: layerProgress,
                    thickness: 0.021,
                    widthSegments: 1,
                    renderOrder: 10,
                  }))
                }
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
    ['03', 'SPC spiral', computed.spiralInstalled ? `${computed.spiralBobbins} bobbins · ${fmt(computed.spiralGap, 0)}% gap` : 'not installed', C.foil],
    ['04', 'SPC helical', computed.helicalInstalled ? `${fmt(computed.helicalOverlap, 0)}% overlap` : 'not installed', C.sky],
    ['05', 'Foil shield', computed.foilInstalled ? `${fmt(computed.foilOverlap, 0)}% overlap` : 'not installed', C.foil],
    ['06', 'Braid', computed.braidInstalled ? `${fmt(computed.braidCoverage, 0)}% coverage` : 'not installed', C.braid],
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

function PTFELayerCard({ layer, index, canRemove, conductorOD, onUpdate, onReplay, onRemove }) {
  const direction = layer.direction === 'S' ? 'S' : 'Z'
  const accent = direction === 'Z' ? C.amber : C.sky
  const wrapKey = ptfeOverlapKey(layer.overlap)
  const smallCableGuidance = recommendPtfeWrapForCable({
    cableOdMm: conductorOD,
    tapeWidthMm: layer.width,
    overlap: layer.overlap,
  })
  return (
    <div style={{ ...S.ptfeLayerCard, border: `1px solid ${accent}66` }}>
      <div style={S.ptfeLayerTop}>
        <div style={S.ptfeLayerTitle}>
          <span style={{ ...S.layerDot, background: accent }} />
          <strong>PTFE L{index + 1}</strong>
          <small>{direction}-wrap · {layer.partNumber || `${fmt(layer.width, 1)} mm tape`}</small>
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
        <label style={{ ...S.materialSelect, gridColumn: '1 / -1' }}>
          <span style={S.materialLabel}>Material</span>
          <select
            value={layer.partNumber || ''}
            onChange={(event) => onUpdate({ partNumber: event.target.value })}
            style={S.select}
          >
            {PTFE_TAPE_MATERIALS.map((tape) => (
              <option key={tape.partNumber} value={tape.partNumber}>
                {tape.partNumber} · {tape.thicknessMil} mil {tape.densityCode} · {tape.widthIn.toFixed(4)} in
              </option>
            ))}
          </select>
        </label>
        <Slider label="Width" value={layer.width} setValue={(value) => onUpdate({ width: value })} min={0.1} max={4} step={0.025} unit=" mm" accent={smallCableGuidance.avoidWidth ? C.red : accent} displayDigits={3} />
        <Slider label="Passes" value={layer.passes} setValue={(value) => onUpdate({ passes: Math.round(value) })} min={1} max={12} step={1} accent={accent} />
        <Slider label="Mil" value={layer.mil} setValue={(value) => onUpdate({ mil: value })} min={0.5} max={5} step={0.1} unit=" mil" accent="#fff2c4" />
        <div style={S.wrapPresetGroup}>
          <div style={S.sliderTop}>
            <span>Overlap</span>
            <strong style={{ color: C.amber }}>{normalizePtfeWrap(layer.overlap).percent}%</strong>
          </div>
          <div style={S.wrapPresetBtns}>
            {['1/2', '2/3', '3/4'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onUpdate({ overlap: ptfeWrapPercent(key) })}
                style={{ ...S.wrapPresetBtn, ...(wrapKey === key ? S.wrapPresetBtnActive : {}) }}
              >
                {key}
              </button>
            ))}
          </div>
          {smallCableGuidance.smallCable && wrapKey !== '2/3' && (
            <small style={{ color: C.amber, lineHeight: 1.35 }}>
              OD ≤ {SMALL_CABLE_TAPE_OD_IN.toFixed(3)} in: 2/3 wrap resists shrink-back; 1/2 is for target OD.
            </small>
          )}
          {smallCableGuidance.avoidWidth && (
            <small style={{ color: C.red, lineHeight: 1.35 }}>
              Avoid ≥ {SMALL_CABLE_MAX_PTFE_WIDTH_IN.toFixed(4)} in tape on this small core.
            </small>
          )}
        </div>
        <Slider label="Density" value={layer.density} setValue={(value) => onUpdate({ density: value })} min={0.45} max={1.65} step={0.01} unit=" g/cc" accent={C.sky} />
      </div>
    </div>
  )
}

function ShieldLayerCard({ layer, index, unitMode, dielectricOD, onUpdate, onRemove }) {
  const type = layer.type || 'spiral'
  const isFlatwire = type === 'spiral' || type === 'flatwire'
  const accent = type === 'jacket' ? C.sky : type === 'braid' ? C.braid : type === 'foil' ? C.foil : type === 'flatwire' ? C.sky : C.amber
  const flatwireOptions = isFlatwire
    ? SPC_FLATWIRE_MATERIALS.filter((item) => type === 'spiral' ? item.shieldUse === 'spiral' : item.shieldUse === 'helical')
    : []
  const foilOptions = type === 'foil' ? FOIL_TAPE_MATERIALS : []
  const title = type === 'spiral' ? 'SPC flatwire spiral'
    : type === 'flatwire' ? 'SPC flatwire helical'
      : type === 'foil' ? 'Foil shield'
        : type === 'braid' ? 'Braid shield'
          : 'Outer jacket'
  const width = Number(layer.width) || 1
  const spiralBobbins = clamp(Math.round(Number(layer.bobbins) || DEFAULT_SPIRAL_BOBBINS), 1, DEFAULT_SPIRAL_BOBBINS)
  const spiralGapInput = Number(layer.gap)
  const spiralGap = Number.isFinite(spiralGapInput)
    ? clamp(spiralGapInput, 0, 50)
    : spiralCoverageGapFromWidth(width, dielectricOD, spiralBobbins)
  const spiralPitch = Number(layer.pitch) || spiralPitchFromGap(spiralGap, width)
  const spiralRule = spiralFlatwireWidthFromDielectricOd({
    dielectricOdMm: dielectricOD,
    bobbins: spiralBobbins,
    gapPct: spiralGap,
  })
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
            Spiral is 8 separate flatwires with no overlap; gap is the open space between each neighboring bobbin.
            {Number.isFinite(spiralRule.widthMm) ? ` Current OD at ${spiralBobbins} bobbins and ${fmt(spiralGap, 0)}% between-wire gap calls for ${unitMode === 'inch' ? `${(spiralRule.widthMm / MM_PER_IN).toFixed(4)} in` : `${spiralRule.widthMm.toFixed(3)} mm`}.` : ''}
          </div>
          <div style={S.ptfeLayerGrid}>
            <label style={{ ...S.materialSelect, gridColumn: '1 / -1' }}>
              <span style={S.materialLabel}>SPC material</span>
              <select
                value={layer.partNumber || ''}
                onChange={(event) => {
                  const material = findNearestSpcFlatwire({ partNumber: event.target.value })
                  const nextWidth = material.widthMm
                  const nextGap = spiralCoverageGapFromWidth(nextWidth, dielectricOD, spiralBobbins)
                  onUpdate({
                    ...spcFlatwireToLayer(material),
                    gap: nextGap,
                    bobbins: spiralBobbins,
                    pitch: spiralPitch,
                  })
                }}
                style={S.select}
              >
                {flatwireOptions.map((item) => (
                  <option key={item.partNumber} value={item.partNumber}>
                    {item.partNumber} · {item.thicknessMil ?? 'TBD'} mil · {item.widthIn.toFixed(4)} in
                  </option>
                ))}
              </select>
            </label>
            <DimensionSlider label="Spiral length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
            <DimensionSlider
              label="Flatwire width"
              value={layer.width}
              setValue={(value) => {
                const nextGap = spiralCoverageGapFromWidth(value, dielectricOD, spiralBobbins)
                onUpdate({ width: value, gap: nextGap, pitch: spiralPitch })
              }}
              min={0.03}
              max={6.5}
              step={0.005}
              unitMode={unitMode}
              accent={accent}
            />
            <button
              type="button"
              onClick={() => {
                const defaultRule = spiralFlatwireWidthFromDielectricOd({
                  dielectricOdMm: dielectricOD,
                  bobbins: DEFAULT_SPIRAL_BOBBINS,
                  gapPct: DEFAULT_SPIRAL_GAP_PCT,
                })
                if (!Number.isFinite(defaultRule.widthMm)) return
                const material = findNearestSpcFlatwire({ use: 'spiral', widthMm: defaultRule.widthMm })
                const nextWidth = defaultRule.widthMm
                onUpdate({
                  ...spcFlatwireToLayer(material),
                  width: nextWidth,
                  bobbins: DEFAULT_SPIRAL_BOBBINS,
                  gap: DEFAULT_SPIRAL_GAP_PCT,
                  pitch: spiralPitchFromGap(DEFAULT_SPIRAL_GAP_PCT, nextWidth),
                })
              }}
              style={{ ...S.toolBtn, color: C.teal, border: `1px solid ${C.teal}66` }}
            >
              Apply 8 bobbin width
            </button>
            <DimensionSlider
              label="Pitch"
              value={spiralPitch}
              setValue={(value) => onUpdate({ pitch: value })}
              min={1}
              max={140}
              step={0.1}
              unitMode={unitMode}
              accent={C.teal}
            />
            <Slider
              label="Bobbins"
              value={spiralBobbins}
              setValue={(value) => {
                const nextBobbins = clamp(Math.round(value), 1, DEFAULT_SPIRAL_BOBBINS)
                const nextRule = spiralFlatwireWidthFromDielectricOd({
                  dielectricOdMm: dielectricOD,
                  bobbins: nextBobbins,
                  gapPct: spiralGap,
                })
                const nextWidth = Number.isFinite(nextRule.widthMm) ? nextRule.widthMm : width
                onUpdate({ bobbins: nextBobbins, width: nextWidth, gap: spiralGap, pitch: spiralPitch })
              }}
              min={1}
              max={DEFAULT_SPIRAL_BOBBINS}
              step={1}
              accent={accent}
            />
            <Slider
              label="Between-wire gap"
              value={spiralGap}
              setValue={(value) => {
                const nextGap = clamp(value, 0, 50)
                const nextRule = spiralFlatwireWidthFromDielectricOd({
                  dielectricOdMm: dielectricOD,
                  bobbins: spiralBobbins,
                  gapPct: nextGap,
                })
                const nextWidth = Number.isFinite(nextRule.widthMm) ? nextRule.widthMm : width
                onUpdate({ width: nextWidth, gap: nextGap, pitch: spiralPitch })
              }}
              min={0}
              max={28}
              step={1}
              unit="%"
              accent={spiralGap >= 8 && spiralGap <= 13 ? C.teal : C.amber}
            />
          </div>
        </>
      )}

      {type === 'flatwire' && (
        <>
          <div style={S.shieldHint}>
            Pitch controls taping spin: lower pitch closes the overlap, higher pitch opens it up.
          </div>
          <div style={S.ptfeLayerGrid}>
            <label style={{ ...S.materialSelect, gridColumn: '1 / -1' }}>
              <span style={S.materialLabel}>SPC material</span>
              <select
                value={layer.partNumber || ''}
                onChange={(event) => {
                  const material = findNearestSpcFlatwire({ partNumber: event.target.value })
                  const nextWidth = material.widthMm
                  onUpdate({
                    ...spcFlatwireToLayer(material),
                    overlap: helicalOverlap,
                    pitch: helicalPitchFromOverlap(helicalOverlap, nextWidth),
                  })
                }}
                style={S.select}
              >
                {flatwireOptions.map((item) => (
                  <option key={item.partNumber} value={item.partNumber}>
                    {item.partNumber} · {item.thicknessMil ?? 'TBD'} mil · {item.widthIn.toFixed(4)} in
                  </option>
                ))}
              </select>
            </label>
            <DimensionSlider label="Helical length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
            <DimensionSlider
              label="Flatwire width"
              value={layer.width}
              setValue={(value) => {
                const nextOverlap = helicalOverlapFromPitch(helicalPitch, value)
                onUpdate({ width: value, overlap: nextOverlap, pitch: helicalPitch })
              }}
              min={0.03}
              max={6.5}
              step={0.005}
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
          <label style={{ ...S.materialSelect, gridColumn: '1 / -1' }}>
            <span style={S.materialLabel}>Foil material</span>
            <select
              value={layer.partNumber || ''}
              onChange={(event) => {
                const material = findNearestFoilTape({ partNumber: event.target.value })
                onUpdate({
                  ...foilTapeToLayer(material),
                  label: layer.label,
                  overlap: layer.overlap,
                  pitch: layer.pitch,
                  tension: layer.tension,
                })
              }}
              style={S.select}
            >
              {foilOptions.map((item) => (
                <option key={item.partNumber} value={item.partNumber}>
                  {item.partNumber} · {item.thicknessMil} mil · {item.widthIn.toFixed(4)} in
                </option>
              ))}
            </select>
          </label>
          <DimensionSlider label="Foil length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
          <DimensionSlider label="Foil width" value={layer.width || 0.79} setValue={(value) => onUpdate({ width: value })} min={0.1} max={6} step={0.01} unitMode={unitMode} accent={accent} />
          <DimensionSlider label="Foil pitch" value={Number(layer.pitch) || 3.9624} setValue={(value) => onUpdate({ pitch: value })} min={0.5} max={20} step={0.01} unitMode={unitMode} accent={C.teal} />
          <Slider label="Overlap" value={layer.overlap} setValue={(value) => onUpdate({ overlap: value })} min={0} max={70} step={1} unit="%" accent={accent} />
          <Slider label="Tension" value={Number(layer.tension) || 5.5} setValue={(value) => onUpdate({ tension: value })} min={0} max={12} step={0.5} unit=" N" accent={C.sky} />
        </div>
      )}

      {type === 'braid' && (
        <div style={S.ptfeLayerGrid}>
          <DimensionSlider label="Braid length" value={layer.length} setValue={(value) => onUpdate({ length: value })} min={80} max={230} step={1} unitMode={unitMode} accent={accent} />
          <Slider label="Carriers" value={layer.carriers} setValue={(value) => onUpdate({ carriers: Math.round(value) })} min={8} max={32} step={2} accent={accent} />
          <Slider label="Ends" value={layer.ends} setValue={(value) => onUpdate({ ends: Math.round(value) })} min={2} max={12} step={1} accent={accent} />
          <Slider label="Picks" value={layer.picks} setValue={(value) => onUpdate({ picks: value })} min={8} max={72} step={0.1} unit="/in" accent={C.sky} />
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
  const [measured, setMeasured] = useState(EMPTY_MEASURED_TEST)
  const [measuredPaste, setMeasuredPaste] = useState('')
  const [goldenHistory, setGoldenHistory] = useState(() => readGoldenHistory())
  const [compareGoldenId, setCompareGoldenId] = useState('')
  const [runSheetCopied, setRunSheetCopied] = useState(false)
  const modelConfig = useMemo(() => ({
    ptfeStack,
    shieldStack,
    previewStage: activePreset ? PRESETS[activePreset]?.previewStage : '',
  }), [activePreset, ptfeStack, shieldStack])
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

  const resetBuild = () => {
    setActivePreset('')
    setParams(PRESETS.phaseStable)
    setPtfeStack([])
    setShieldStack([])
    setMeasured(EMPTY_MEASURED_TEST)
    setMeasuredPaste('')
  }

  const updatePtfeLayer = (id, patch) => {
    setPtfeStack((current) => current.map((layer) => {
      if (layer.id !== id) return layer
      if (patch.partNumber) {
        const tape = findNearestPtfeTape({ partNumber: patch.partNumber, cableOdMm: params.conductorOD })
        return ptfeTapeToLayer(tape, { ...layer, ...patch, partNumber: tape.partNumber })
      }
      return { ...layer, ...patch }
    }))
    setActivePreset('')
  }

  const addPtfeLayer = (direction) => {
    setPtfeStack((current) => {
      const last = current[current.length - 1] || makePresetStack(PRESETS.phaseStable)[0]
      const nextDirection = direction || (last.direction === 'Z' ? 'S' : 'Z')
      const tape = findNearestPtfeTape({
        thicknessMil: last.mil * 0.86,
        widthMm: Math.max(0.3175, last.width * 0.82),
        densityCode: last.densityCode || (last.density >= 1.1 ? 'H' : 'L'),
        cableOdMm: params.conductorOD,
      })
      return [
        ...current,
        ptfeTapeToLayer(tape, {
          id: makePtfeId(),
          passes: 1,
          overlap: overlapToPct(nextDirection === 'S' ? '1/2' : '2/3'),
          direction: nextDirection,
          animateKey: makeAnimationKey('ptfe'),
        }),
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
    const layer = makeShieldLayer(type, type === 'spiral' ? { ...params, dielectricOD: computed.dielectricOD } : params)
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
      const shieldLayers = Array.isArray(preset.shield_layers)
        ? preset.shield_layers
        : Array.isArray(preset.shieldStack) ? preset.shieldStack : []
      const totalPasses = layers.reduce((sum, layer) => sum + Math.max(1, Number(layer.passes) || 1), 0)
      const firstLayer = layers[0] || {}
      const avgDensity = layers.length
        ? layers.reduce((sum, layer) => sum + (Number(layer.density) || 0.78) * Math.max(1, Number(layer.passes) || 1), 0) / Math.max(1, totalPasses)
        : 0.78
      const mappedShieldLayers = shieldLayers.map((layer) => ({
        ...layer,
        id: layer.id || makeShieldId(),
        animateKey: layer.animateKey || makeAnimationKey('shield'),
      }))
      if (layers.length) {
        setPtfeStack(layers.map((layer, index) => makePtfeLayer({
          ...layer,
          overlap: overlapToPct(layer.overlap),
          direction: index % 2 ? 'S' : 'Z',
        }, PRESETS.phaseStable, index)))
      }
      if (mappedShieldLayers.length) {
        setShieldStack(mappedShieldLayers)
      }
      setParams((current) => ({
        ...current,
        conductorOD: Number(preset.conductor_od_mm) || current.conductorOD,
        ptfeLayers: layers.length ? clamp(Math.round(totalPasses || current.ptfeLayers), 1, 16) : current.ptfeLayers,
        ptfeMil: layers.length && firstLayer.tape_thickness_mm ? clamp(firstLayer.tape_thickness_mm / MIL_TO_MM, 0.5, 5) : current.ptfeMil,
        ptfeWidth: layers.length && firstLayer.tape_width_mm ? clamp(firstLayer.tape_width_mm, 0.1, 4) : current.ptfeWidth,
        ptfeOverlap: layers.length ? overlapToPct(firstLayer.overlap) : current.ptfeOverlap,
        ptfeDensity: layers.length ? clamp(avgDensity || current.ptfeDensity, 0.45, 1.65) : current.ptfeDensity,
        spiralWidth: mappedShieldLayers.find((layer) => layer.type === 'spiral')?.width ?? current.spiralWidth,
        spiralGap: mappedShieldLayers.find((layer) => layer.type === 'spiral')?.gap ?? current.spiralGap,
        spiralBobbins: mappedShieldLayers.find((layer) => layer.type === 'spiral')?.bobbins ?? current.spiralBobbins,
        helicalWidth: mappedShieldLayers.find((layer) => layer.type === 'flatwire')?.width ?? current.helicalWidth,
        helicalOverlap: mappedShieldLayers.find((layer) => layer.type === 'flatwire')?.overlap ?? current.helicalOverlap,
        foilOverlap: mappedShieldLayers.find((layer) => layer.type === 'foil')?.overlap ?? current.foilOverlap,
        braidCoverage: mappedShieldLayers.find((layer) => layer.type === 'braid')?.coverage ?? current.braidCoverage,
        jacketOD: Number(preset.jacket_od_mm) || mappedShieldLayers.find((layer) => layer.type === 'jacket')?.od || current.jacketOD,
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
    const spiralBobbins = clamp(Math.round(Number(spiralLayer?.bobbins ?? params.spiralBobbins)), 1, DEFAULT_SPIRAL_BOBBINS)
    const spiralGapInput = Number(spiralLayer?.gap ?? params.spiralGap)
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
    let measuredBuildOD = params.conductorOD
    const layerBuilds = ptfeStack.map((layer) => {
      const passes = Math.max(1, Number(layer.passes) || 1)
      const mil = Number(layer.mil) || 2
      const overlap = overlapToPct(layer.overlap)
      const calculatedRadial = passes * mil * MIL_TO_MM * ptfeOverlapLayerCount(overlap) * tension
      const odAfterMm = Number(layer.ODAfterMm ?? layer.OD_after_mm ?? layer.od_after_mm)
      const radial = Number.isFinite(odAfterMm) && odAfterMm > measuredBuildOD
        ? (odAfterMm - measuredBuildOD) / 2
        : calculatedRadial
      const epsOverride = Number(layer.effectiveEps ?? layer.effective_eps ?? layer.eps_eff)
      measuredBuildOD += radial * 2
      return {
        ...layer,
        passes,
        mil,
        overlap,
        radial,
        eps: Number.isFinite(epsOverride) && epsOverride > 0
          ? epsOverride
          : densityToEps(Number(layer.density) || summary.avgDensity),
      }
    })
    const rawDielectricWall = layerBuilds.reduce((sum, layer) => sum + layer.radial, 0)
    const dielectricWall = rawDielectricWall || 0.12
    const dielectricOD = params.conductorOD + 2 * dielectricWall
    let mixRadius = params.conductorOD / 2
    let logTotal = 0
    let weightedLog = 0
    layerBuilds.forEach((layer) => {
      const nextRadius = mixRadius + layer.radial
      if (nextRadius > mixRadius && layer.eps > 0) {
        const dlog = Math.log(nextRadius / mixRadius)
        logTotal += dlog
        weightedLog += dlog / layer.eps
      }
      mixRadius = nextRadius
    })
    const epsBase = layerBuilds.length && rawDielectricWall > 0 && weightedLog > 0
      ? logTotal / weightedLog
      : 1.02
    const eps = epsBase * (1 + params.suckout * 0.0018)
    const vp = 1 / Math.sqrt(eps)
    const z0 = z0From(params.conductorOD, dielectricOD, eps)
    const spiralGapPct = Number.isFinite(spiralGapInput)
      ? clamp(spiralGapInput, 0, 50)
      : spiralCoverageGapFromWidth(spiralWidth, dielectricOD, spiralBobbins)
    const spiralPitchMm = Number(spiralLayer?.pitch ?? spiralPitchFromGap(spiralGapPct, spiralWidth))
    const ptfeNotches = layerBuilds.map((layer, index) => {
      const layerOD = params.conductorOD + 2 * layerBuilds.slice(0, index).reduce((sum, item) => sum + item.radial, 0)
      const pitchOverride = Number(layer.pitchSetpointMm ?? layer.pitch_setpoint_mm ?? layer.pitch_mm ?? (layer.pitch_setpoint_in != null ? Number(layer.pitch_setpoint_in) * MM_PER_IN : NaN))
      const pitch = Number.isFinite(pitchOverride) && pitchOverride > 0
        ? pitchOverride
        : (ptfeShopPitchSetpoint({
          cableOdMm: layerOD,
          tapeWidthMm: layer.width,
          overlap: layer.overlap,
          densityCode: layer.densityCode,
          density: layer.density,
          partNumber: layer.partNumber,
        }).pitchMm || pitchFrom(layer.width, layer.overlap, layerOD, 1))
      return {
        id: layer.id,
        label: `L${index + 1} ${layer.direction}`,
        pitch,
        freq: notchGHz(pitch, vp),
        width: layer.width,
        direction: layer.direction,
      }
    })
    let buildOdCursor = params.conductorOD
    const ptfeBuilds = layerBuilds.map((layer, index) => {
      buildOdCursor += layer.radial * 2
      return {
        ...layer,
        odAfterMm: buildOdCursor,
        pitch: ptfeNotches[index]?.pitch,
      }
    })
    const pitchTape = ptfeNotches[0]?.pitch || (ptfeShopPitchSetpoint({
      cableOdMm: params.conductorOD,
      tapeWidthMm: summary.avgWidth,
      overlap: summary.avgOverlap,
    }).pitchMm || pitchFrom(summary.avgWidth, summary.avgOverlap, dielectricOD, 1))
    const tapeNotch = ptfeNotches.length ? Math.min(...ptfeNotches.map((item) => item.freq)) : notchGHz(pitchTape, vp)
    const spiralGap = -Math.abs(spiralGapPct)
    const pitchSpiral = spiralLayer ? Math.max(0.01, spiralPitchMm / Math.max(1, spiralBobbins)) : pitchFrom(spiralWidth, spiralGap, dielectricOD + 0.25, spiralBobbins)
    const pitchHelical = helicalLayer ? Math.max(0.01, helicalPitchMm) : pitchFrom(helicalWidth, helicalOverlapPct, dielectricOD + 0.48, 1)
    const spiralNotch = notchGHz(pitchSpiral, vp)
    const helicalNotch = notchGHz(pitchHelical, vp)
    const spiralCirc = Math.PI * dielectricOD
    const shieldCirc = Math.PI * (dielectricOD + 0.3)
    const spiralWidthRule = spiralFlatwireWidthFromDielectricOd({
      dielectricOdMm: dielectricOD,
      bobbins: spiralBobbins,
      gapPct: spiralGapPct,
    })
    const spiralRawCoverage = clamp((spiralBobbins * spiralWidth) / Math.max(0.001, spiralCirc) * 100, 0, 100)
    const spiralCoverage = spiralLayer ? clamp(Math.min(100 - spiralGapPct, spiralRawCoverage), 0, 100) : 0
    const helicalCoverage = helicalLayer ? clamp((helicalWidth * (1 + helicalOverlapPct / 80)) / shieldCirc * 100, 0, 100) : 0
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
      spiralInstalled: Boolean(spiralLayer),
      helicalInstalled: Boolean(helicalLayer),
      foilInstalled: Boolean(foilLayer),
      braidInstalled: Boolean(braidLayer),
      ptfeBuilds,
      ptfeNotches,
      dielectricOD,
      eps,
      vp,
      z0,
      spiralWidth,
      spiralWidthRule,
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

  const correlation = useMemo(() => buildMeasuredCorrelation(measured, computed), [measured, computed])
  const preApplyPreview = useMemo(() => buildPreApplyPreview(computed, ptfeStack, shieldStack), [computed, ptfeStack, shieldStack])
  const feedbackLearner = useMemo(() => buildFeedbackLearner(goldenHistory, measured, computed), [goldenHistory, measured, computed])
  const suckoutDoctor = useMemo(() => buildSuckoutDoctor(computed, measured), [computed, measured])
  const selectedGolden = useMemo(() => (
    goldenHistory.find((entry) => entry.id === compareGoldenId) || goldenHistory[0] || null
  ), [compareGoldenId, goldenHistory])
  const goldenDiff = useMemo(() => buildGoldenDiff(selectedGolden, computed, ptfeStack, shieldStack), [selectedGolden, computed, ptfeStack, shieldStack])
  const runSheetRows = useMemo(() => buildFactoryRunSheetRows(ptfeStack, shieldStack, computed), [ptfeStack, shieldStack, computed])

  const updateMeasured = (key) => (value) => {
    setMeasured((current) => ({ ...current, [key]: value }))
  }

  const applyMeasuredPaste = () => {
    const parsed = parseMeasuredPaste(measuredPaste)
    setMeasured((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== '' && value != null)),
      notes: current.notes || measuredPaste.slice(0, 500),
    }))
  }

  const saveGoldenRecipe = () => {
    const id = `golden-${Date.now()}`
    const label = measured.cableId || activePreset || `RF recipe ${new Date().toLocaleDateString()}`
    const entry = {
      id,
      label,
      createdAt: new Date().toISOString(),
      measured,
      summary: {
        z0: computed.z0,
        vp: computed.vp,
        dielectricOD: computed.dielectricOD,
        jacketOD: computed.jacketInstalled ? computed.jacketOD : null,
        primarySuckout: Math.min(
          computed.tapeNotch,
          computed.spiralCoverage ? computed.spiralNotch : Infinity,
          computed.helicalCoverage ? computed.helicalNotch : Infinity,
        ),
        shieldCoverage: computed.shieldCoverage,
      },
      params,
      ptfeStack,
      shieldStack,
      diagnosis: correlation.items.slice(0, 4),
    }
    setGoldenHistory((current) => {
      const next = [entry, ...current].slice(0, 24)
      writeGoldenHistory(next)
      return next
    })
    setCompareGoldenId(id)
  }

  const loadGoldenRecipe = (entry) => {
    if (!entry) return
    setParams(entry.params || PRESETS.phaseStable)
    setPtfeStack(Array.isArray(entry.ptfeStack) ? entry.ptfeStack : [])
    setShieldStack(Array.isArray(entry.shieldStack) ? entry.shieldStack : [])
    setMeasured(entry.measured || EMPTY_MEASURED_TEST)
    setMeasuredPaste('')
    setActivePreset('')
    setCompareGoldenId(entry.id || '')
  }

  const deleteGoldenRecipe = (id) => {
    setGoldenHistory((current) => {
      const next = current.filter((entry) => entry.id !== id)
      writeGoldenHistory(next)
      return next
    })
  }

  const copyRunSheet = async () => {
    try {
      await navigator.clipboard.writeText(formatRunSheetText(runSheetRows))
      setRunSheetCopied(true)
      window.setTimeout(() => setRunSheetCopied(false), 1600)
    } catch {
      setRunSheetCopied(false)
    }
  }

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
          <div style={S.presets}>
            <button type="button" style={S.resetBtn} onClick={resetBuild}>
              <RotateCcw size={13} /> Reset
            </button>
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
                    conductorOD={params.conductorOD}
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
                    dielectricOD={computed.dielectricOD}
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

      <div style={S.correlationGrid}>
        <MeasuredTestCorrelator
          measured={measured}
          measuredPaste={measuredPaste}
          setMeasuredPaste={setMeasuredPaste}
          updateMeasured={updateMeasured}
          applyMeasuredPaste={applyMeasuredPaste}
          correlation={correlation}
          computed={computed}
          onSave={saveGoldenRecipe}
        />
        <GoldenRecipeHistory
          history={goldenHistory}
          onLoad={loadGoldenRecipe}
          onDelete={deleteGoldenRecipe}
        />
      </div>

      <ClosedLoopIntelligence
        preview={preApplyPreview}
        learner={feedbackLearner}
        doctor={suckoutDoctor}
        history={goldenHistory}
        selectedGolden={selectedGolden}
        compareGoldenId={compareGoldenId}
        setCompareGoldenId={setCompareGoldenId}
        goldenDiff={goldenDiff}
        runSheetRows={runSheetRows}
        runSheetCopied={runSheetCopied}
        copyRunSheet={copyRunSheet}
        computed={computed}
      />

      <div style={S.notes}>
        <div style={S.noteTitle}><Activity size={13} /> Interpretation</div>
        <p>
          PTFE is the dielectric wrap, not a shield. The RF shields start at SPC flatwire spiral/helical layers, then foil, then braid; jacket is the final mechanical sleeve. Coverage is compounded as independent leak paths, so foil + braid + flatwire rapidly pushes shielding effectiveness up.
        </p>
        <p>
          PTFE overlap is locked to 50%, 66.7%, or 75%. For OD {SMALL_CABLE_TAPE_OD_IN.toFixed(3)} in and below, use 2/3 wrap to control shrink-back and avoid {SMALL_CABLE_MAX_PTFE_WIDTH_IN.toFixed(4)} in tape unless the target OD needs 1/2 wrap.
        </p>
        <p>
          Tape suckout is still here, but now it is tied to the same build recipe: changing PTFE wrap, suckout, calculated flatwire width, or braid coverage updates Z0, TDR, insertion loss, return loss, VSWR, and coverage together.
        </p>
      </div>
    </section>
  )
}

function MeasuredTestCorrelator({ measured, measuredPaste, setMeasuredPaste, updateMeasured, applyMeasuredPaste, correlation, computed, onSave }) {
  const fields = [
    ['measuredZ0', 'Av. Z0', 'Ω'],
    ['measuredVp', 'VP', '%'],
    ['measuredSuckoutGHz', 'Suckout', 'GHz'],
    ['measuredFinalOdIn', 'Final OD', 'in'],
    ['measuredRlDb', 'Return loss', 'dB'],
    ['measuredVswr', 'VSWR', ''],
    ['measuredIlDb', 'Loss / S21', 'dB'],
    ['measuredCapPfFt', 'Cap', 'pF/ft'],
  ]
  return (
    <section style={S.correlationPanel}>
      <div style={S.correlationHead}>
        <div>
          <div style={S.cardEyebrow}>Measured Test Correlator</div>
          <h2 style={S.cardTitle}>Actual test → root cause → next setting</h2>
        </div>
        <button type="button" style={S.saveBtn} onClick={onSave}>Save golden</button>
      </div>
      <div style={S.measurePasteGrid}>
        <label style={S.textareaLabel}>
          <span>Paste report text</span>
          <textarea
            value={measuredPaste}
            onChange={(event) => setMeasuredPaste(event.target.value)}
            placeholder={'Example: Av. Zo: 48.3 Ω, VP: 78.5%, suckout at 32 GHz, VSWR 1.25, cap 26.8 pF/ft'}
            style={S.textarea}
          />
        </label>
        <div style={S.measureActions}>
          <input
            value={measured.cableId}
            onChange={(event) => updateMeasured('cableId')(event.target.value)}
            placeholder="Cable / MI id"
            style={S.textInput}
          />
          <button type="button" style={S.toolBtn} onClick={applyMeasuredPaste}>Parse text</button>
          <div style={S.correlationMini}>
            <span>Predicted</span>
            <strong>{fmt(computed.z0, 1)} Ω · {fmt(computed.vp * 100, 1)}% VP</strong>
            <small>OD {fmt((computed.jacketInstalled ? computed.jacketOD : computed.dielectricOD) / MM_PER_IN, 4)} in</small>
          </div>
        </div>
      </div>
      <div style={S.measureGrid}>
        {fields.map(([key, label, unit]) => (
          <MeasurementInput
            key={key}
            label={label}
            unit={unit}
            value={measured[key]}
            onChange={updateMeasured(key)}
          />
        ))}
      </div>
      <label style={S.textareaLabel}>
        <span>Operator / test notes</span>
        <textarea
          value={measured.notes}
          onChange={(event) => updateMeasured('notes')(event.target.value)}
          placeholder="Actual OD after shield, connector notes, test date, or what changed on this reel."
          style={{ ...S.textarea, minHeight: 68 }}
        />
      </label>
      <div style={S.diagnosisList}>
        {correlation.items.map((item, index) => (
          <CorrelationBullet key={`${item.title}-${index}`} item={item} />
        ))}
      </div>
    </section>
  )
}

function MeasurementInput({ label, unit, value, onChange }) {
  return (
    <label style={S.measureInput}>
      <span>{label}</span>
      <div style={S.measureInputRow}>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          style={S.numberInput}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  )
}

function CorrelationBullet({ item }) {
  const color = item.level === 'pass' ? C.teal : item.level === 'warn' ? C.amber : C.sky
  return (
    <div style={{ ...S.diagnosisItem, borderColor: `${color}66` }}>
      <span style={{ ...S.diagnosisDot, background: color }} />
      <div>
        <strong style={{ color }}>{item.title}</strong>
        <p>{item.body}</p>
      </div>
    </div>
  )
}

function GoldenRecipeHistory({ history, onLoad, onDelete }) {
  return (
    <section style={S.correlationPanel}>
      <div style={S.correlationHead}>
        <div>
          <div style={S.cardEyebrow}>Golden Recipe History</div>
          <h2 style={S.cardTitle}>Saved recipe + actual test memory</h2>
        </div>
        <div style={S.historyCount}>{history.length}</div>
      </div>
      {history.length === 0 ? (
        <div style={S.emptyState}>
          Save a golden recipe after entering measured Z0, VP, OD, and suckout. It stays in this browser and can be loaded back into the stack later.
        </div>
      ) : (
        <div style={S.historyList}>
          {history.map((entry) => {
            const summary = entry.summary || {}
            const measured = entry.measured || {}
            return (
              <div key={entry.id} style={S.historyItem}>
                <div style={S.historyTop}>
                  <div>
                    <div style={S.historyTitle}>{entry.label}</div>
                    <div style={S.historyDate}>{new Date(entry.createdAt).toLocaleString()}</div>
                  </div>
                  <button type="button" style={S.iconBtn} onClick={() => onDelete(entry.id)} title="Delete recipe">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={S.historyStats}>
                  <span>Z0 {measured.measuredZ0 || fmt(summary.z0, 1)}</span>
                  <span>VP {measured.measuredVp || fmt((summary.vp || 0) * 100, 1)}%</span>
                  <span>Notch {measured.measuredSuckoutGHz || fmt(summary.primarySuckout, 1)} GHz</span>
                </div>
                {(entry.diagnosis || []).slice(0, 2).map((item, index) => (
                  <div key={index} style={S.historyDiagnosis}>{item.title}</div>
                ))}
                <button type="button" style={S.loadBtn} onClick={() => onLoad(entry)}>Load recipe</button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ClosedLoopIntelligence({
  preview,
  learner,
  doctor,
  history,
  selectedGolden,
  compareGoldenId,
  setCompareGoldenId,
  goldenDiff,
  runSheetRows,
  runSheetCopied,
  copyRunSheet,
  computed,
}) {
  return (
    <section style={S.closedLoopShell}>
      <div style={S.closedLoopHeader}>
        <div>
          <div style={S.cardEyebrow}>Closed-loop RF assistant</div>
          <h2 style={S.cardTitle}>Preview, learn, diagnose, compare, then print.</h2>
        </div>
        <div style={{ ...S.liveBadge, color: preview.status === 'ready' ? C.teal : C.amber, borderColor: preview.status === 'ready' ? `${C.teal}66` : `${C.amber}66` }}>
          {preview.status === 'ready' ? 'apply ready' : `${preview.warningCount} review`}
        </div>
      </div>
      <div style={S.closedLoopGrid}>
        <PreApplyPreviewCard preview={preview} computed={computed} />
        <MeasuredFeedbackLearner learner={learner} />
        <SuckoutDoctorCard doctor={doctor} />
        <GoldenCompareCard
          history={history}
          selectedGolden={selectedGolden}
          compareGoldenId={compareGoldenId}
          setCompareGoldenId={setCompareGoldenId}
          goldenDiff={goldenDiff}
        />
        <FactoryRunSheetCard rows={runSheetRows} copied={runSheetCopied} onCopy={copyRunSheet} />
      </div>
    </section>
  )
}

function PreApplyPreviewCard({ preview, computed }) {
  return (
    <div style={S.intelCard}>
      <div style={S.intelTitle}><Target size={14} /> Preview Before Apply</div>
      <div style={S.previewHero}>
        <strong>{fmt(computed.z0, 1)} Ω</strong>
        <span>{fmt(computed.vp * 100, 1)}% VP</span>
        <span>OD {fmt((computed.jacketInstalled ? computed.jacketOD : computed.dielectricOD) / MM_PER_IN, 4)} in</span>
      </div>
      <div style={S.checkList}>
        {preview.checks.map((check) => (
          <CheckRow key={check.label} item={check} />
        ))}
      </div>
    </div>
  )
}

function MeasuredFeedbackLearner({ learner }) {
  return (
    <div style={S.intelCard}>
      <div style={S.intelTitle}><Brain size={14} /> Measured Feedback Learner</div>
      <div style={S.biasGrid}>
        <BiasChip label="Z0 bias" value={learner.z0Bias} suffix=" Ω" digits={1} />
        <BiasChip label="VP bias" value={learner.vpBias} suffix=" pt" digits={1} />
        <BiasChip label="OD bias" value={learner.odBiasIn} suffix=" in" digits={4} />
      </div>
      <div style={S.intelMiniText}>{learner.samples.length} measured sample{learner.samples.length === 1 ? '' : 's'} in memory</div>
      <div style={S.checkList}>
        {learner.recommendations.map((item, index) => (
          <div key={index} style={{ ...S.learningLine, borderColor: item.level === 'pass' ? `${C.teal}55` : item.level === 'warn' ? `${C.amber}55` : `${C.sky}55` }}>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function SuckoutDoctorCard({ doctor }) {
  const confidence = doctor.root ? (doctor.root.errorPct <= 8 ? 'high match' : doctor.root.errorPct <= 18 ? 'possible match' : 'weak match') : 'no match'
  return (
    <div style={S.intelCard}>
      <div style={S.intelTitle}><Activity size={14} /> Suckout Doctor</div>
      <div style={S.doctorRoot}>
        <span>Target {fmt(doctor.target, 2)} GHz</span>
        <strong>{doctor.root ? doctor.root.label : 'No pitch source'}</strong>
        <small>{confidence}{doctor.root ? ` · ${fmt(doctor.root.error, 2)} GHz away` : ''}</small>
      </div>
      <div style={S.rankList}>
        {doctor.ranked.slice(0, 3).map((item) => (
          <div key={`${item.label}-${item.freq}`} style={S.rankRow}>
            <span>{item.label}</span>
            <strong>{fmt(item.freq, 2)} GHz</strong>
          </div>
        ))}
      </div>
      <ul style={S.actionList}>
        {doctor.actions.slice(0, 3).map((action, index) => (
          <li key={index}>{action}</li>
        ))}
      </ul>
    </div>
  )
}

function GoldenCompareCard({ history, selectedGolden, compareGoldenId, setCompareGoldenId, goldenDiff }) {
  return (
    <div style={S.intelCard}>
      <div style={S.intelTitle}><GitCompare size={14} /> MI Diff / Golden Compare</div>
      {history.length ? (
        <>
          <select
            value={compareGoldenId || selectedGolden?.id || ''}
            onChange={(event) => setCompareGoldenId(event.target.value)}
            style={S.select}
          >
            {history.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
          <div style={S.diffTable}>
            {goldenDiff.map((row) => (
              <div key={row.label} style={S.diffRow}>
                <span>{row.label}</span>
                <strong>{row.current}</strong>
                <small>{row.delta}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={S.emptyState}>Save one measured golden recipe, then this card will show exactly what changed from the known-good MI.</div>
      )}
    </div>
  )
}

function FactoryRunSheetCard({ rows, copied, onCopy }) {
  return (
    <div style={{ ...S.intelCard, ...S.runSheetCard }}>
      <div style={S.runSheetHead}>
        <div style={S.intelTitle}><ClipboardList size={14} /> Factory Run Sheet Mode</div>
        <button type="button" style={S.saveBtn} onClick={onCopy}>
          {copied ? 'Copied' : 'Copy sheet'}
        </button>
      </div>
      <div style={S.runSheetTable}>
        <div style={{ ...S.runSheetRow, ...S.runSheetHeaderRow }}>
          <span>Step</span>
          <span>Machine</span>
          <span>Material</span>
          <span>Pitch</span>
          <span>OD</span>
        </div>
        {rows.slice(0, 9).map((row, index) => (
          <div key={`${row.step}-${index}`} style={S.runSheetRow}>
            <span>{row.step}</span>
            <span>{row.machine}</span>
            <span>{row.material}</span>
            <span>{row.pitch}</span>
            <span>{row.targetOd}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CheckRow({ item }) {
  const color = item.level === 'pass' ? C.teal : item.level === 'warn' ? C.amber : C.sky
  return (
    <div style={S.checkRow}>
      <span style={{ ...S.checkLight, background: color }} />
      <div>
        <strong>{item.label}</strong>
        <small>{item.note}</small>
      </div>
      <b style={{ color }}>{item.value}</b>
    </div>
  )
}

function BiasChip({ label, value, suffix, digits }) {
  const color = !Number.isFinite(value) ? C.muted : Math.abs(value) < (digits >= 4 ? 0.0015 : 0.8) ? C.teal : C.amber
  return (
    <div style={S.biasChip}>
      <span>{label}</span>
      <strong style={{ color }}>{Number.isFinite(value) ? formatDelta(value, digits, suffix) : '—'}</strong>
    </div>
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
  materialSelect: { display: 'grid', gap: 6, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.3 },
  materialLabel: { color: C.muted },
  select: { width: '100%', minHeight: 34, background: '#070b0c', color: C.text, border: `1px solid ${C.borderHi}`, padding: '0 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 0 },
  slider: { display: 'grid', gap: 6, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.3 },
  sliderTop: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  wrapPresetGroup: { display: 'grid', gap: 6, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.3 },
  wrapPresetBtns: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 },
  wrapPresetBtn: { minHeight: 28, background: '#070b0c', border: `1px solid ${C.borderHi}`, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, cursor: 'pointer' },
  wrapPresetBtnActive: { border: `1px solid ${C.amber}`, color: C.amber, background: 'rgba(251,191,36,0.12)' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 },
  metric: { border: `1px solid ${C.border}`, background: C.panel, padding: 12, borderRadius: 3, minHeight: 94 },
  metricLabel: { color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  metricValue: { fontFamily: 'JetBrains Mono, monospace', fontSize: 24, marginTop: 9 },
  metricSub: { color: C.muted, fontSize: 11, marginTop: 5 },
  chartGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 12 },
  chartCard: { border: `1px solid ${C.border}`, background: C.panel, padding: 12, borderRadius: 3 },
  chartHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  chartSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  correlationGrid: { display: 'grid', gridTemplateColumns: 'minmax(min(100%, 520px), 1.25fr) minmax(min(100%, 360px), 0.75fr)', gap: 12 },
  correlationPanel: { border: `1px solid ${C.border}`, background: C.panel, padding: 14, borderRadius: 3, display: 'grid', gap: 12, minWidth: 0 },
  correlationHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  saveBtn: { background: 'rgba(251,191,36,0.12)', border: `1px solid ${C.amber}77`, color: C.amber, minHeight: 32, padding: '0 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, cursor: 'pointer', whiteSpace: 'nowrap' },
  measurePasteGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(170px, 0.36fr)', gap: 10 },
  textareaLabel: { display: 'grid', gap: 6, color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4 },
  textarea: { width: '100%', minHeight: 92, resize: 'vertical', background: '#070b0c', color: C.text, border: `1px solid ${C.borderHi}`, padding: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.55, outline: 0 },
  measureActions: { display: 'grid', gap: 8, alignContent: 'start' },
  textInput: { width: '100%', minHeight: 34, background: '#070b0c', color: C.text, border: `1px solid ${C.borderHi}`, padding: '0 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 0 },
  correlationMini: { border: `1px solid rgba(94,234,212,0.2)`, background: 'rgba(94,234,212,0.055)', padding: 9, display: 'grid', gap: 3, color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, lineHeight: 1.35 },
  measureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))', gap: 8 },
  measureInput: { display: 'grid', gap: 5, color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  measureInputRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 6 },
  numberInput: { minWidth: 0, minHeight: 32, background: '#070b0c', color: C.text, border: `1px solid ${C.borderHi}`, padding: '0 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 0 },
  diagnosisList: { display: 'grid', gap: 8 },
  diagnosisItem: { display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr)', gap: 9, border: '1px solid', background: '#080d0f', padding: 10 },
  diagnosisDot: { width: 8, height: 8, borderRadius: 999, marginTop: 5, boxShadow: '0 0 13px currentColor' },
  historyCount: { minWidth: 34, height: 30, display: 'grid', placeItems: 'center', border: `1px solid ${C.borderHi}`, color: C.teal, fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 },
  historyList: { display: 'grid', gap: 9, maxHeight: 560, overflow: 'auto', paddingRight: 2 },
  historyItem: { border: `1px solid ${C.borderHi}`, background: '#080d0f', padding: 10, display: 'grid', gap: 8 },
  historyTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  historyTitle: { color: C.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4 },
  historyDate: { color: C.muted, fontSize: 10, marginTop: 3 },
  historyStats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, color: C.teal, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  historyDiagnosis: { color: C.dim, borderLeft: `2px solid ${C.amber}`, paddingLeft: 8, fontSize: 11 },
  loadBtn: { background: '#070b0c', border: `1px solid ${C.teal}66`, color: C.teal, minHeight: 30, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, cursor: 'pointer' },
  closedLoopShell: { border: `1px solid ${C.border}`, background: 'linear-gradient(135deg, rgba(16,22,25,0.98), rgba(9,13,14,0.96))', padding: 14, borderRadius: 3, display: 'grid', gap: 12 },
  closedLoopHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  closedLoopGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 },
  intelCard: { border: `1px solid ${C.borderHi}`, background: '#080d0f', padding: 12, display: 'grid', gap: 10, minWidth: 0 },
  runSheetCard: { gridColumn: '1 / -1' },
  intelTitle: { display: 'flex', alignItems: 'center', gap: 7, color: C.teal, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.7 },
  previewHero: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 7, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  checkList: { display: 'grid', gap: 7 },
  checkRow: { display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', border: `1px solid rgba(167,176,182,0.12)`, background: '#070b0c', padding: 8, minWidth: 0 },
  checkLight: { width: 7, height: 7, borderRadius: 999, boxShadow: '0 0 12px currentColor' },
  biasGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 },
  biasChip: { border: `1px solid rgba(167,176,182,0.13)`, background: '#070b0c', padding: 8, display: 'grid', gap: 4, color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, minWidth: 0 },
  intelMiniText: { color: C.muted, fontSize: 11 },
  learningLine: { borderLeft: '2px solid', padding: '7px 8px', background: '#070b0c', color: C.dim, fontSize: 11, lineHeight: 1.45 },
  doctorRoot: { border: `1px solid rgba(94,234,212,0.18)`, background: 'rgba(94,234,212,0.045)', padding: 9, display: 'grid', gap: 4, color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  rankList: { display: 'grid', gap: 5 },
  rankRow: { display: 'flex', justifyContent: 'space-between', gap: 8, border: `1px solid rgba(167,176,182,0.12)`, padding: '6px 8px', background: '#070b0c', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  actionList: { margin: 0, paddingLeft: 18, color: C.dim, fontSize: 11, lineHeight: 1.55 },
  diffTable: { display: 'grid', gap: 6 },
  diffRow: { display: 'grid', gridTemplateColumns: 'minmax(88px, 1fr) minmax(78px, auto) minmax(70px, auto)', gap: 8, alignItems: 'center', border: `1px solid rgba(167,176,182,0.12)`, background: '#070b0c', padding: '7px 8px', color: C.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  runSheetHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  runSheetTable: { display: 'grid', border: `1px solid ${C.border}`, overflowX: 'auto' },
  runSheetRow: { display: 'grid', gridTemplateColumns: '120px 126px minmax(180px, 1fr) 92px 92px', gap: 8, alignItems: 'center', minWidth: 720, padding: '7px 9px', borderTop: `1px solid rgba(167,176,182,0.10)`, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
  runSheetHeaderRow: { borderTop: 0, color: C.amber, background: 'rgba(251,191,36,0.06)', textTransform: 'uppercase', letterSpacing: 1.3 },
  notes: { border: `1px solid ${C.border}`, background: C.panel, padding: 14, color: C.dim, lineHeight: 1.7, fontSize: 12, borderRadius: 3 },
  noteTitle: { display: 'flex', alignItems: 'center', gap: 8, color: C.teal, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 },
}

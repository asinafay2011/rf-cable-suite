// Company defaults memory: a small JSON blob in localStorage that the agent
// can read and write across sessions. Use cases: factory-specific Cu price,
// preferred jacket material, in-house standard tolerances, contact info, etc.
// Schema is open — agent can add any string-keyed primitives or objects.

import { useEffect, useState } from 'react'

const KEY = 'rfsuite.company-defaults'
const EVT = 'companyDefaultsChanged'

const DEFAULT_DEFAULTS = {
  // Materials & cost (used for BOM + recipe cost estimates)
  cu_price_usd_kg: 9.5,
  spc_price_usd_kg: 17.5,
  fep_price_usd_kg: 28.0,
  preferred_jacket: 'lszh',           // pvc | lszh | tpu | pur | fep_jkt
  preferred_conductor: 'spc',         // cu | spc | tc | npc
  preferred_dielectric: 'fep_foamed', // pe_solid | pe_foamed | ptfe | fep | fep_foamed | pfa | eptfe

  // Process limits (line speed, anneal temp ceilings the floor honours)
  max_line_speed_m_min: 1000,
  max_anneal_c: 520,

  // Tolerances applied during QC verdicts
  z0_tol_pct: 5,
  od_tol_mm: 0.05,

  // Free-form notes / metadata the engineer wants the agent to remember
  company_name: '',
  factory_location: '',
  notes: '',
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_DEFAULTS, ...(parsed || {}) }
  } catch {
    return { ...DEFAULT_DEFAULTS }
  }
}

function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
    window.dispatchEvent(new CustomEvent(EVT))
    return true
  } catch {
    return false
  }
}

export function getCompanyDefaults() {
  return read()
}

// Merge-update: only overwrites the keys present in `patch`. Pass null/undefined
// to leave a key alone, or call resetCompanyDefaults() for a hard reset.
export function setCompanyDefaults(patch) {
  if (!patch || typeof patch !== 'object') return read()
  const current = read()
  const next = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) continue
    next[k] = v
  }
  write(next)
  return next
}

export function resetCompanyDefaults() {
  write({ ...DEFAULT_DEFAULTS })
  return { ...DEFAULT_DEFAULTS }
}

export function exportCompanyDefaults() {
  const data = read()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `company-defaults-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// React hook
export function useCompanyDefaults() {
  const [data, setData] = useState(read)
  useEffect(() => {
    const refresh = () => setData(read())
    window.addEventListener(EVT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return data
}

export const COMPANY_DEFAULTS_SCHEMA = DEFAULT_DEFAULTS

// Persistence for user-added cable specs. Two namespaces — RF and Cable —
// to mirror the two built-in databases.

const RF_KEY = 'rfsuite.custom-rf-cables'
const CABLE_KEY = 'rfsuite.custom-cables'

function readMap(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed != null ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(map))
    return true
  } catch (err) {
    return false
  }
}

function notifyChange() {
  // Dispatch a custom event so React components can re-read the store
  // (storage event only fires across tabs, not in the same tab)
  window.dispatchEvent(new CustomEvent('customCablesChanged'))
}

// ── RF ────────────────────────────────────────────────────────────
export function getCustomRfCables() { return readMap(RF_KEY) }

export function addCustomRfCable(spec) {
  const id = (spec.id || spec.name || `custom-${Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const map = readMap(RF_KEY)
  map[id] = {
    ...spec,
    id,
    name: spec.name || id,
    custom: true,
    addedAt: spec.addedAt || new Date().toISOString(),
  }
  writeMap(RF_KEY, map)
  notifyChange()
  return { id, cable: map[id] }
}

export function deleteCustomRfCable(id) {
  const map = readMap(RF_KEY)
  if (!(id in map)) return false
  delete map[id]
  writeMap(RF_KEY, map)
  notifyChange()
  return true
}

// ── Cable / Highspeed ─────────────────────────────────────────────
export function getCustomCableCables() { return readMap(CABLE_KEY) }

export function addCustomCableCable(spec) {
  const id = (spec.id || spec.name || `custom-${Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const map = readMap(CABLE_KEY)
  map[id] = {
    ...spec,
    id,
    name: spec.name || id,
    custom: true,
    addedAt: spec.addedAt || new Date().toISOString(),
  }
  writeMap(CABLE_KEY, map)
  notifyChange()
  return { id, cable: map[id] }
}

export function deleteCustomCableCable(id) {
  const map = readMap(CABLE_KEY)
  if (!(id in map)) return false
  delete map[id]
  writeMap(CABLE_KEY, map)
  notifyChange()
  return true
}

// ── Export / Import (per side) ────────────────────────────────────
export function exportLibrary(side) {
  const data = side === 'rf' ? readMap(RF_KEY) : readMap(CABLE_KEY)
  const blob = new Blob(
    [JSON.stringify({ side, exported: new Date().toISOString(), cables: data }, null, 2)],
    { type: 'application/json' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${side}-custom-cables-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
  return Object.keys(data).length
}

export async function importLibrary(side, file) {
  const text = await file.text()
  const json = JSON.parse(text)
  const cables = json.cables || json // accept either wrapped or raw
  if (typeof cables !== 'object' || cables == null) throw new Error('JSON must be an object of cables')
  const key = side === 'rf' ? RF_KEY : CABLE_KEY
  const merged = { ...readMap(key) }
  let added = 0
  for (const [id, spec] of Object.entries(cables)) {
    merged[id] = { ...spec, id, custom: true }
    added++
  }
  writeMap(key, merged)
  notifyChange()
  return added
}

// ── React hook for components that need to subscribe ──────────────
import { useEffect, useState } from 'react'
export function useCustomCables(side) {
  const [data, setData] = useState(() => side === 'rf' ? readMap(RF_KEY) : readMap(CABLE_KEY))
  useEffect(() => {
    const refresh = () => setData(side === 'rf' ? readMap(RF_KEY) : readMap(CABLE_KEY))
    window.addEventListener('customCablesChanged', refresh)
    window.addEventListener('storage', refresh) // cross-tab
    return () => {
      window.removeEventListener('customCablesChanged', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [side])
  return data
}

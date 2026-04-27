// Persistent defect log — tracks every defect the agent classifies from
// shop-floor photos so the engineer can spot recurring patterns over time.
// Lives in browser localStorage, no telemetry.

import { useEffect, useState } from 'react'

const KEY = 'cablelab.defect-log'
const EVT = 'defectLogChanged'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    window.dispatchEvent(new CustomEvent(EVT))
    return true
  } catch {
    return false
  }
}

export function getDefectLog() {
  return read()
}

export function addDefectEntry(entry) {
  const list = read()
  const id = `def-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const item = {
    id,
    timestamp: new Date().toISOString(),
    type: entry.type || 'unknown',
    stage: entry.stage || null,
    severity: entry.severity || 'medium',
    root_cause: entry.root_cause || '',
    suggested_fix: entry.suggested_fix || '',
    recipe_id: entry.recipe_id || null,
    notes: entry.notes || '',
  }
  list.unshift(item)
  if (list.length > 200) list.length = 200
  write(list)
  return item
}

export function deleteDefectEntry(id) {
  const list = read().filter((e) => e.id !== id)
  write(list)
}

export function clearDefectLog() {
  write([])
}

export function exportDefectLog() {
  const data = read()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `defect-log-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function useDefectLog() {
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

import { useEffect, useState } from 'react'

const KEY = 'rfsuite.shop-memory.v1'
const EVT = 'shopMemoryChanged'

const nowIso = () => new Date().toISOString()

const BUILT_IN_RULES = [
  {
    id: 'ptfe-prefer-two-third-wrap',
    status: 'active',
    category: 'ptfe_taping',
    title: 'Prefer 2/3 PTFE wrap',
    rule: 'Prefer 2/3 wrap for PTFE tape to reduce shrink-back. Use 1/2 wrap only when the target OD requires the lower single-pass build.',
    applies_to: ['ptfe', 'taping', 'mi'],
    source: 'built-in shop rule from engineer correction',
    priority: 90,
    created_at: '2026-05-13T00:00:00.000Z',
    approved_at: '2026-05-13T00:00:00.000Z',
  },
  {
    id: 'wtm-min-taping-pitch-00390',
    status: 'active',
    category: 'wtm_taping',
    title: 'WTM minimum taping pitch',
    rule: 'WTM taping-head pitch set-point is based on incoming OD, wrap mode, and shop MI calibration from MI-ST962-032-130 / 032-200. Clamp to 0.0390 in/rev only when the OD-based calculated pitch is lower than the machine minimum.',
    applies_to: ['wtm', 'ptfe', 'taping', 'mi', 'notch'],
    source: 'built-in shop rule from engineer correction',
    priority: 95,
    created_at: '2026-05-13T00:00:00.000Z',
    approved_at: '2026-05-13T00:00:00.000Z',
  },
  {
    id: 'small-cable-avoid-00375-ptfe',
    status: 'active',
    category: 'ptfe_taping',
    title: 'Small cable PTFE width limit',
    rule: 'For cable OD 0.051 in and below, do not use 0.0375 in PTFE tape width; select a narrower stocked tape.',
    applies_to: ['ptfe', 'small_cable', 'material_selection'],
    source: 'built-in shop rule from engineer correction',
    priority: 85,
    created_at: '2026-05-13T00:00:00.000Z',
    approved_at: '2026-05-13T00:00:00.000Z',
  },
  {
    id: 'spc-spiral-eight-bobbin-ten-gap',
    status: 'active',
    category: 'spc_spiral',
    title: 'SPC spiral 8 bobbin width rule',
    rule: 'SPC spiral flatwire width = dielectric OD * pi / 8 bobbins minus 10% gap. The gap is between each of the 8 flatwires; do not overlap spiral flatwire.',
    applies_to: ['spc_spiral', 'flatwire', '3d_render'],
    source: 'built-in shop rule from engineer correction',
    priority: 90,
    created_at: '2026-05-13T00:00:00.000Z',
    approved_at: '2026-05-13T00:00:00.000Z',
  },
  {
    id: 'shop-mi-template-layout',
    status: 'active',
    category: 'mi_export',
    title: 'Use real shop MI layout',
    rule: 'When exporting MI, use the real MI-ST962-032-130.xlsx shop workbook layout and fill only the required cells such as tape part number, pitch set-point, tension, and OD after each tape/shield pass.',
    applies_to: ['mi', 'xlsx', 'taping'],
    source: 'built-in shop rule from engineer correction',
    priority: 90,
    created_at: '2026-05-13T00:00:00.000Z',
    approved_at: '2026-05-13T00:00:00.000Z',
  },
]

function slugify(text) {
  const raw = String(text || 'shop-rule').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return raw || 'shop-rule'
}

function normaliseRule(rule, fallbackStatus = 'pending') {
  const title = String(rule?.title || '').trim() || 'Shop rule'
  const body = String(rule?.rule || rule?.description || '').trim()
  const created = rule?.created_at || nowIso()
  return {
    id: String(rule?.id || `${slugify(title)}-${Date.now().toString(36)}`),
    status: rule?.status || fallbackStatus,
    category: String(rule?.category || 'process'),
    title,
    rule: body,
    applies_to: Array.isArray(rule?.applies_to)
      ? rule.applies_to.map(String).filter(Boolean)
      : String(rule?.applies_to || '').split(',').map((s) => s.trim()).filter(Boolean),
    reason: String(rule?.reason || '').trim(),
    source: String(rule?.source || rule?.source_message || 'agent proposal').trim(),
    confidence: Number.isFinite(Number(rule?.confidence)) ? Number(rule.confidence) : undefined,
    priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : 50,
    created_at: created,
    approved_at: rule?.approved_at || null,
    updated_at: rule?.updated_at || created,
  }
}

function readStoredRules() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.rules) ? parsed.rules.map((r) => normaliseRule(r)) : []
  } catch {
    return []
  }
}

function read() {
  const stored = readStoredRules()
  const storedIds = new Set(stored.map((r) => r.id))
  const merged = [
    ...BUILT_IN_RULES.filter((r) => !storedIds.has(r.id)),
    ...stored,
  ]
  return {
    rules: merged
      .filter((r) => r.rule)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.title).localeCompare(String(b.title))),
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ rules: data.rules || [] }))
    window.dispatchEvent(new CustomEvent(EVT))
    return true
  } catch {
    return false
  }
}

function publicMemory(data = read()) {
  const rules = data.rules || []
  return {
    active_rules: rules.filter((r) => r.status === 'active'),
    pending_rules: rules.filter((r) => r.status === 'pending'),
    archived_rules: rules.filter((r) => r.status === 'archived' || r.status === 'rejected'),
    stored_at: 'browser localStorage (this device only)',
    approval_model: 'agent may propose rules; engineer approval makes them active',
  }
}

export function getShopMemory() {
  return publicMemory()
}

export function formatActiveShopRulesForPrompt() {
  const active = getShopMemory().active_rules
  if (!active.length) return ''
  return active
    .map((rule, i) => `${i + 1}. [${rule.category}] ${rule.title}: ${rule.rule}`)
    .join('\n')
}

export function proposeShopRule(input = {}) {
  const rule = normaliseRule({ ...input, status: 'pending' }, 'pending')
  if (!rule.rule) throw new Error('Need a rule text to propose.')
  const data = read()
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const duplicate = data.rules.find((r) => norm(r.rule) === norm(rule.rule) || norm(r.title) === norm(rule.title))
  if (duplicate) {
    return {
      ok: true,
      duplicate: true,
      rule: duplicate,
      note: duplicate.status === 'active'
        ? 'This shop rule is already active.'
        : 'A matching shop rule is already pending approval.',
      memory: publicMemory(data),
    }
  }
  data.rules.push(rule)
  write(data)
  return {
    ok: true,
    rule,
    note: 'Saved as a pending shop rule. It will not affect future answers until the engineer approves it in Shop Memory.',
    memory: publicMemory(data),
  }
}

export function approveShopRule(id) {
  const data = read()
  const rule = data.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`Unknown shop rule: ${id}`)
  rule.status = 'active'
  rule.approved_at = nowIso()
  rule.updated_at = rule.approved_at
  write(data)
  return publicMemory(data)
}

export function rejectShopRule(id) {
  const data = read()
  const rule = data.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`Unknown shop rule: ${id}`)
  rule.status = 'rejected'
  rule.updated_at = nowIso()
  write(data)
  return publicMemory(data)
}

export function archiveShopRule(id) {
  const data = read()
  const rule = data.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`Unknown shop rule: ${id}`)
  rule.status = 'archived'
  rule.updated_at = nowIso()
  write(data)
  return publicMemory(data)
}

export function saveShopRule(input = {}) {
  const rule = normaliseRule({
    ...input,
    status: input.status || 'active',
    approved_at: input.status === 'pending' ? null : (input.approved_at || nowIso()),
    source: input.source || 'manual entry',
  })
  if (!rule.rule) throw new Error('Need a rule text to save.')
  const data = read()
  const idx = data.rules.findIndex((r) => r.id === rule.id)
  if (idx >= 0) data.rules[idx] = { ...data.rules[idx], ...rule, updated_at: nowIso() }
  else data.rules.push(rule)
  write(data)
  return publicMemory(data)
}

export function exportShopMemory() {
  const data = getShopMemory()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shop-memory-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function useShopMemory() {
  const [data, setData] = useState(getShopMemory)
  useEffect(() => {
    const refresh = () => setData(getShopMemory())
    window.addEventListener(EVT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return data
}

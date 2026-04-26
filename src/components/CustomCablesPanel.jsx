import React, { useRef, useState } from 'react'
import { Trash2, Download, Upload, Sparkles, X, Edit3 } from 'lucide-react'
import {
  useCustomCables,
  deleteCustomRfCable,
  deleteCustomCableCable,
  exportLibrary,
  importLibrary,
  addCustomRfCable,
  addCustomCableCable,
} from './customCableStore.js'
import { useToast } from './Toaster.jsx'

// Lightweight panel that renders the user's custom cable library.
// Supply `side` = 'rf' or 'cable'.
export default function CustomCablesPanel({ side = 'rf', accentColor = '#d97706' }) {
  const cables = useCustomCables(side)
  const toast = useToast()
  const fileRef = useRef(null)
  const [editing, setEditing] = useState(null)

  const list = Object.values(cables).sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  )

  const onExport = () => {
    const n = exportLibrary(side)
    toast.success(`Exported ${n} cable${n === 1 ? '' : 's'} to JSON`)
  }

  const onImportClick = () => fileRef.current?.click()
  const onImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const n = await importLibrary(side, file)
      toast.success(`Imported ${n} cable${n === 1 ? '' : 's'} into your local library`)
    } catch (err) {
      toast.error(`Import failed: ${err.message || err}`)
    }
  }

  const onDelete = (id, name) => {
    if (!window.confirm(`Delete "${name}" from your local library?`)) return
    const ok = side === 'rf' ? deleteCustomRfCable(id) : deleteCustomCableCable(id)
    if (ok) toast.success(`Deleted ${name}`)
  }

  return (
    <div
      style={{
        background: '#12171a',
        border: '1px solid #252e33',
        borderRadius: 4,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: accentColor, textTransform: 'uppercase' }}>
            ◆ Custom cables · {list.length} saved
          </div>
          <div style={{ fontSize: 11, color: '#6b7479', marginTop: 2 }}>
            Saved on this device. Survives close/reopen. Use the agent to add ("Hey agent, add this cable…") or paste a JSON via Import.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setEditing({})}
            title="Open the manual add form"
            style={btn(accentColor)}
          >
            <Sparkles size={11} /> Add
          </button>
          <button onClick={onExport} disabled={list.length === 0} style={btn('#384249', list.length === 0)}>
            <Download size={11} /> Export
          </button>
          <button onClick={onImportClick} style={btn('#384249')}>
            <Upload size={11} /> Import
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImport} style={{ display: 'none' }} />
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 12px', color: '#6b7479', fontSize: 12, fontStyle: 'italic' }}>
          No custom cables yet. Ask the agent to add one, click Add above, or Import a previously-exported JSON.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {list.map((c) => (
            <div
              key={c.id}
              style={{
                background: '#0d1416',
                border: '1px solid #252e33',
                borderRadius: 4,
                padding: 10,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                color: '#a7b0b6',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setEditing(c)}
                    title="Edit cable"
                    style={iconBtn}
                  >
                    <Edit3 size={11} />
                  </button>
                  <button
                    onClick={() => onDelete(c.id, c.name)}
                    title="Delete cable"
                    style={iconBtn}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#6b7479', marginBottom: 6 }}>id: {c.id}{c.family ? ` · ${c.family}` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                {c.z0 != null && <KV k="Z₀" v={`${c.z0} Ω`} />}
                {c.vf != null && <KV k="VF" v={`${(c.vf * 100).toFixed(1)}%`} />}
                {c.od_mm != null && <KV k="OD" v={`${c.od_mm} mm`} />}
                {c.cap_pf_ft != null && <KV k="C" v={`${c.cap_pf_ft} pF/ft`} />}
                {c.fmax_ghz != null && <KV k="f_max" v={`${c.fmax_ghz} GHz`} />}
                {c.atten_db_per_100ft && Object.keys(c.atten_db_per_100ft).length > 0 && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 10, color: '#6b7479', marginTop: 4 }}>
                    atten: {Object.entries(c.atten_db_per_100ft).slice(0, 3).map(([f, db]) => `${db}dB@${f}MHz`).join(' · ')}
                  </div>
                )}
              </div>
              {c.notes && <div style={{ fontSize: 10, color: '#a7b0b6', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>{c.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CableForm
          side={side}
          accentColor={accentColor}
          initial={editing}
          onSave={(spec) => {
            const adder = side === 'rf' ? addCustomRfCable : addCustomCableCable
            adder(spec)
            toast.success(`Saved ${spec.name}`)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div>
      <span style={{ color: '#6b7479' }}>{k}: </span>
      <span style={{ color: '#f0ebe2' }}>{v}</span>
    </div>
  )
}

function CableForm({ initial, onSave, onCancel, accentColor, side }) {
  const [form, setForm] = useState({
    id: initial.id || '',
    name: initial.name || '',
    family: initial.family || '',
    z0: initial.z0 ?? 50,
    vf: initial.vf ?? 0.66,
    od_mm: initial.od_mm ?? '',
    cap_pf_ft: initial.cap_pf_ft ?? '',
    fmax_ghz: initial.fmax_ghz ?? '',
    atten_text: initial.atten_db_per_100ft
      ? Object.entries(initial.atten_db_per_100ft).map(([f, db]) => `${f}, ${db}`).join('\n')
      : '',
    notes: initial.notes || '',
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.id || !form.name || !form.z0) {
      window.alert('id, name, and Z₀ are required')
      return
    }
    // Parse attenuation lines: "freq_MHz, dB" each line
    const atten_db_per_100ft = {}
    for (const line of (form.atten_text || '').split('\n')) {
      const m = line.trim().match(/^(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*$/)
      if (m) atten_db_per_100ft[m[1]] = parseFloat(m[2])
    }
    onSave({
      id: form.id, name: form.name,
      family: form.family || undefined,
      z0: parseFloat(form.z0),
      vf: form.vf === '' ? undefined : parseFloat(form.vf),
      od_mm: form.od_mm === '' ? undefined : parseFloat(form.od_mm),
      cap_pf_ft: form.cap_pf_ft === '' ? undefined : parseFloat(form.cap_pf_ft),
      fmax_ghz: form.fmax_ghz === '' ? undefined : parseFloat(form.fmax_ghz),
      atten_db_per_100ft: Object.keys(atten_db_per_100ft).length > 0 ? atten_db_per_100ft : undefined,
      notes: form.notes || undefined,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,13,15,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <form
        onSubmit={submit}
        style={{
          background: '#0a0d0f',
          border: `1px solid ${accentColor}`,
          borderRadius: 6,
          padding: 20,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          color: '#a7b0b6',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: accentColor, textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 }}>
            ◆ {initial.id ? 'Edit cable' : 'Add cable'} · {side === 'rf' ? 'RF library' : 'Cable library'}
          </div>
          <button type="button" onClick={onCancel} style={iconBtn}>
            <X size={13} />
          </button>
        </div>
        <FormGrid>
          <Input label="id (slug, required)" value={form.id} onChange={set('id')} placeholder="e.g. company-spec-A" disabled={!!initial.id} />
          <Input label="name (required)" value={form.name} onChange={set('name')} placeholder="e.g. Brian Spec Cable A" />
          <Input label="family (optional)" value={form.family} onChange={set('family')} placeholder="e.g. RG · 50 Ω" />
          <Input label="Z₀ (Ω, required)" value={form.z0} onChange={set('z0')} type="number" step="0.1" />
          <Input label="VF (fraction)" value={form.vf} onChange={set('vf')} type="number" step="0.01" />
          <Input label="OD (mm)" value={form.od_mm} onChange={set('od_mm')} type="number" step="0.01" />
          <Input label="C (pF/ft)" value={form.cap_pf_ft} onChange={set('cap_pf_ft')} type="number" step="0.1" />
          <Input label="f_max (GHz)" value={form.fmax_ghz} onChange={set('fmax_ghz')} type="number" step="0.1" />
        </FormGrid>
        <Field label="Attenuation table (one per line: freq_MHz, dB/100ft)">
          <textarea
            value={form.atten_text}
            onChange={(e) => set('atten_text')(e.target.value)}
            rows={4}
            placeholder={"100, 4.4\n400, 9.4\n900, 14.8\n1000, 16.0"}
            style={inputStyle}
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            rows={3}
            style={inputStyle}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onCancel} style={btn('#384249')}>Cancel</button>
          <button type="submit" style={btn(accentColor)}>Save to local library</button>
        </div>
      </form>
    </div>
  )
}

function Input({ label, value, onChange, ...rest }) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        {...rest}
      />
    </Field>
  )
}
function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      {children}
    </label>
  )
}
function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{children}</div>
}

const inputStyle = {
  width: '100%',
  background: '#12171a',
  border: '1px solid #252e33',
  borderRadius: 3,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 12,
  color: '#fbbf24',
  outline: 'none',
}

const iconBtn = {
  background: 'transparent',
  border: '1px solid #252e33',
  borderRadius: 3,
  padding: '4px 6px',
  color: '#6b7479',
  cursor: 'pointer',
}
const btn = (color, disabled = false) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: `1px solid ${color}80`,
  borderRadius: 3,
  padding: '5px 10px',
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  color,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})

import React, { useState } from 'react'
import { Building2, Save, RotateCcw, Download, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useCompanyDefaults,
  setCompanyDefaults,
  resetCompanyDefaults,
  exportCompanyDefaults,
} from './companyDefaults.js'
import { useToast } from './Toaster.jsx'

// Lightweight collapsible panel that shows the company-wide defaults the agent
// reads/writes. Engineer can also edit by hand here. Persisted to localStorage.
export default function CompanyDefaultsPanel({ accentColor = '#d97706' }) {
  const data = useCompanyDefaults()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)

  const editing = draft !== null
  const view = editing ? draft : data

  const startEdit = () => setDraft({ ...data })
  const cancelEdit = () => setDraft(null)
  const save = () => {
    setCompanyDefaults(draft)
    setDraft(null)
    toast.success('Company defaults saved')
  }
  const reset = () => {
    if (!window.confirm('Reset all company defaults? This will clear the agent\'s memory of factory-specific values.')) return
    resetCompanyDefaults()
    setDraft(null)
    toast.info('Company defaults reset')
  }
  const onExport = () => {
    exportCompanyDefaults()
    toast.success('Defaults exported as JSON')
  }
  const update = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <div style={{ background: '#12171a', border: '1px solid #252e33', borderRadius: 4, padding: 14, marginBottom: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', color: '#a7b0b6', cursor: 'pointer', padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={14} style={{ color: accentColor }} />
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: accentColor, textTransform: 'uppercase' }}>
              ◆ Company defaults · agent memory
            </div>
            <div style={{ fontSize: 11, color: '#6b7479', marginTop: 2, textAlign: 'left' }}>
              {data.company_name ? `${data.company_name}` : 'No company name set'} · Cu ${data.cu_price_usd_kg}/kg · jacket {data.preferred_jacket} · saved on this device
            </div>
          </div>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #252e33' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            <Field label="Company name" value={view.company_name} editing={editing} onChange={update('company_name')} />
            <Field label="Factory location" value={view.factory_location} editing={editing} onChange={update('factory_location')} />
            <Field label="Cu price ($/kg)" value={view.cu_price_usd_kg} editing={editing} onChange={update('cu_price_usd_kg')} type="number" step="0.1" />
            <Field label="SPC price ($/kg)" value={view.spc_price_usd_kg} editing={editing} onChange={update('spc_price_usd_kg')} type="number" step="0.1" />
            <Field label="FEP price ($/kg)" value={view.fep_price_usd_kg} editing={editing} onChange={update('fep_price_usd_kg')} type="number" step="0.5" />
            <Field label="Preferred conductor" value={view.preferred_conductor} editing={editing} onChange={update('preferred_conductor')} />
            <Field label="Preferred dielectric" value={view.preferred_dielectric} editing={editing} onChange={update('preferred_dielectric')} />
            <Field label="Preferred jacket" value={view.preferred_jacket} editing={editing} onChange={update('preferred_jacket')} />
            <Field label="Max line speed m/min" value={view.max_line_speed_m_min} editing={editing} onChange={update('max_line_speed_m_min')} type="number" />
            <Field label="Max anneal °C" value={view.max_anneal_c} editing={editing} onChange={update('max_anneal_c')} type="number" />
            <Field label="Z₀ tolerance (%)" value={view.z0_tol_pct} editing={editing} onChange={update('z0_tol_pct')} type="number" step="0.5" />
            <Field label="OD tolerance (mm)" value={view.od_tol_mm} editing={editing} onChange={update('od_tol_mm')} type="number" step="0.01" />
          </div>
          <div style={{ marginTop: 8 }}>
            <Field label="Notes" value={view.notes} editing={editing} onChange={update('notes')} multiline />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {editing ? (
              <>
                <button onClick={save} style={btn(accentColor)}><Save size={11} /> Save</button>
                <button onClick={cancelEdit} style={btn('#384249')}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={startEdit} style={btn(accentColor)}>Edit</button>
                <button onClick={onExport} style={btn('#384249')}><Download size={11} /> Export</button>
                <button onClick={reset} style={btn('#384249')}><RotateCcw size={11} /> Reset</button>
              </>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: '#6b7479', alignSelf: 'center' }}>
              Tell the agent “remember Cu is $11/kg” to update without leaving chat.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, editing, onChange, type = 'text', step, multiline }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      {editing ? (
        multiline ? (
          <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            style={inputStyle}
          />
        ) : (
          <input
            type={type}
            value={value ?? ''}
            step={step}
            onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
            style={inputStyle}
          />
        )
      ) : (
        <span style={{ color: '#fbbf24', fontSize: 11, padding: '4px 6px', background: '#0a0d0f', border: '1px solid #252e33', borderRadius: 3, minHeight: 22, lineHeight: '14px' }}>
          {value === '' || value == null ? <span style={{ color: '#6b7479' }}>—</span> : value}
        </span>
      )}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  background: '#0a0d0f',
  border: '1px solid #252e33',
  borderRadius: 3,
  padding: '4px 6px',
  fontFamily: 'inherit',
  fontSize: 11,
  color: '#fbbf24',
  outline: 'none',
}

const btn = (color) => ({
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
  cursor: 'pointer',
})

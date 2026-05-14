import React, { useState } from 'react'
import { Brain, Check, Download, Plus, RotateCcw, X } from 'lucide-react'
import {
  approveShopRule,
  archiveShopRule,
  exportShopMemory,
  rejectShopRule,
  saveShopRule,
  useShopMemory,
} from './shopMemory.js'
import { useToast } from './Toaster.jsx'

export default function ShopMemoryPanel({ accentColor = '#d97706' }) {
  const memory = useShopMemory()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    category: 'process',
    applies_to: '',
    rule: '',
  })

  const active = memory.active_rules || []
  const pending = memory.pending_rules || []

  const approve = (id) => {
    approveShopRule(id)
    toast.success('Shop rule approved')
  }
  const reject = (id) => {
    rejectShopRule(id)
    toast.info('Pending rule rejected')
  }
  const archive = (id) => {
    if (!window.confirm('Archive this shop rule? The agent will stop using it.')) return
    archiveShopRule(id)
    toast.info('Shop rule archived')
  }
  const onExport = () => {
    exportShopMemory()
    toast.success('Shop memory exported')
  }
  const addManual = () => {
    try {
      saveShopRule({
        title: draft.title,
        category: draft.category || 'process',
        applies_to: draft.applies_to,
        rule: draft.rule,
        status: 'active',
      })
      setDraft({ title: '', category: 'process', applies_to: '', rule: '' })
      setAdding(false)
      toast.success('Manual shop rule saved')
    } catch (err) {
      toast.error(err.message || 'Could not save rule')
    }
  }

  return (
    <div style={{ background: '#12171a', border: '1px solid #252e33', borderRadius: 4, padding: 14, marginBottom: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', color: '#a7b0b6', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={14} style={{ color: accentColor }} />
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: accentColor, textTransform: 'uppercase', textAlign: 'left' }}>
              ◆ Shop memory · self-learning
            </div>
            <div style={{ fontSize: 11, color: '#6b7479', marginTop: 2, textAlign: 'left' }}>
              {active.length} active rule{active.length === 1 ? '' : 's'} · {pending.length} pending approval · saved on this device
            </div>
          </div>
        </div>
        <span style={{ color: pending.length ? '#fbbf24' : '#6b7479', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
          {pending.length ? `${pending.length} pending` : (open ? 'hide' : 'show')}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #252e33' }}>
          <div style={{ fontSize: 11, color: '#a8a29e', lineHeight: 1.5, marginBottom: 10 }}>
            Agent can propose new shop rules from corrections, but they stay pending until approved here.
          </div>

          {pending.length > 0 && (
            <section style={{ marginBottom: 12 }}>
              <SectionTitle color="#fbbf24">Pending approval</SectionTitle>
              <div style={{ display: 'grid', gap: 8 }}>
                {pending.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} accentColor="#fbbf24">
                    <button onClick={() => approve(rule.id)} style={btn('#5eead4')}><Check size={11} /> Approve</button>
                    <button onClick={() => reject(rule.id)} style={btn('#f87171')}><X size={11} /> Reject</button>
                  </RuleCard>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle color={accentColor}>Active rules</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              {active.map((rule) => (
                <RuleCard key={rule.id} rule={rule} accentColor={accentColor}>
                  <button onClick={() => archive(rule.id)} style={btn('#6b7479')}><RotateCcw size={11} /> Archive</button>
                </RuleCard>
              ))}
            </div>
          </section>

          {adding && (
            <div style={{ marginTop: 12, padding: 10, border: '1px solid #252e33', borderRadius: 4, background: '#0a0d0f' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                <Field label="Title" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} />
                <Field label="Category" value={draft.category} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} />
                <Field label="Applies to" value={draft.applies_to} onChange={(v) => setDraft((d) => ({ ...d, applies_to: v }))} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Field label="Rule" value={draft.rule} onChange={(v) => setDraft((d) => ({ ...d, rule: v }))} multiline />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button onClick={addManual} style={btn('#5eead4')}><Check size={11} /> Save active</button>
                <button onClick={() => setAdding(false)} style={btn('#6b7479')}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setAdding(true)} style={btn(accentColor)}><Plus size={11} /> Add rule</button>
            <button onClick={onExport} style={btn('#384249')}><Download size={11} /> Export</button>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: '#6b7479', alignSelf: 'center' }}>
              Tell the agent “learn this as a shop rule” to create a pending item.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children, color }) {
  return (
    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1.5, color, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function RuleCard({ rule, accentColor, children }) {
  return (
    <div style={{ border: '1px solid #252e33', borderRadius: 4, background: '#0a0d0f', padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: '#f0ebe2', fontWeight: 700 }}>{rule.title}</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: accentColor, marginTop: 2 }}>
            {rule.category} · {(rule.applies_to || []).join(', ') || 'general'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#c9d0d4', lineHeight: 1.45, marginTop: 7 }}>{rule.rule}</div>
      {rule.reason && <div style={{ fontSize: 10, color: '#6b7479', lineHeight: 1.4, marginTop: 5 }}>Why: {rule.reason}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, multiline }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#6b7479', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={inputStyle} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  background: '#050708',
  border: '1px solid #252e33',
  borderRadius: 3,
  padding: '5px 7px',
  fontFamily: 'JetBrains Mono, monospace',
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
  padding: '5px 9px',
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  color,
  cursor: 'pointer',
})

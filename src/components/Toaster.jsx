import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) {
    // Outside provider — log instead of crashing
    return {
      success: (msg) => console.log('[toast]', msg),
      error: (msg) => console.error('[toast]', msg),
      info: (msg) => console.log('[toast]', msg),
    }
  }
  return ctx
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((kind, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    const ttl = opts.ttl ?? (kind === 'error' ? 6000 : 3500)
    setToasts((t) => [...t, { id, kind, message }])
    if (ttl > 0) setTimeout(() => remove(id), ttl)
    return id
  }, [remove])

  const api = {
    success: (m, o) => push('success', m, o),
    error:   (m, o) => push('error', m, o),
    info:    (m, o) => push('info', m, o),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function Toast({ toast, onDismiss }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const colors = {
    success: { fg: '#5eead4', bg: '#0d2620', border: '#1f5a4f' },
    error:   { fg: '#f87171', bg: '#2a1010', border: '#7a2020' },
    info:    { fg: '#fbbf24', bg: '#1f1610', border: '#3d2a1c' },
  }[toast.kind] || { fg: '#a7b0b6', bg: '#12171a', border: '#252e33' }

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info

  return (
    <div
      className="pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-md border shadow-2xl backdrop-blur-md"
      style={{
        background: colors.bg + 'ee',
        borderColor: colors.border,
        fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateX(0)' : 'translateX(20px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
      }}
      role="status"
    >
      <Icon size={14} style={{ color: colors.fg, marginTop: 2, flexShrink: 0 }} />
      <div className="flex-1 text-[13px] leading-relaxed" style={{ color: '#f0ebe2' }}>
        {toast.message}
      </div>
      <button
        onClick={onDismiss}
        className="text-[#6b7479] hover:text-[#fbbf24] flex-shrink-0"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}

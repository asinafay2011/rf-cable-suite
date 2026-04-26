import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Trash2, Minimize2, Wrench, ChevronRight, ChevronDown, Eye, EyeOff, Image as ImageIcon, X as XIcon, Paperclip, Download, Mic, MicOff, HelpCircle } from 'lucide-react'

const MODEL_DEFAULT = 'claude-sonnet-4-6'
const MAX_TOOL_TURNS = 6

const DEFAULT_MODELS = [
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',   tier: 'flagship' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', tier: 'balanced' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',  tier: 'fast' },
]

export default function FloatingAgent({
  accent = '#c97b3f',
  accentBright = '#e89357',
  label = '◆ AGENT',
  systemPrompt,
  starters = [],
  roleDescription = 'Domain expert.',
  topics = [],
  placeholder = 'Ask anything…',
  model = MODEL_DEFAULT,
  models = DEFAULT_MODELS,
  fontFamily = '"Bricolage Grotesque", system-ui, sans-serif',
  maxTokens = 2048,
  storageKey,
  tools,        // optional Anthropic-format tool array
  onToolUse,    // optional (name, input) => result|Promise<result>
  onAttachData, // optional (file) => Promise<{ summary: string, chip: { name, info } } | null>
  attachAccept = 'image/*', // file input accept pattern
  context,      // optional { section, sectionLabel, extra? } — added to system prompt at runtime
  contextStarters, // optional (context) => string[] — overrides `starters` based on current context
  toolToSection,   // optional { [toolName]: { id, label } } — maps tool to a target tab
  onJumpToSection, // optional (sectionId) => void — host wires this to its section setter
}) {
  const [open, setOpen] = useState(false)
  const modelKey = storageKey ? `${storageKey}-model` : null
  const [modelId, setModelId] = useState(() => {
    if (!modelKey) return model
    try {
      const stored = localStorage.getItem(modelKey)
      if (stored && models.some((m) => m.id === stored)) return stored
    } catch {}
    return model
  })
  useEffect(() => {
    if (!modelKey) return
    try { localStorage.setItem(modelKey, modelId) } catch {}
  }, [modelKey, modelId])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const currentModel = models.find((m) => m.id === modelId) || models[0]

  // Resize state — persisted size per-app
  const sizeKey = storageKey ? `${storageKey}-size` : null
  const [size, setSize] = useState(() => {
    if (!sizeKey) return { w: 380, h: 520 }
    try {
      const raw = localStorage.getItem(sizeKey)
      if (raw) {
        const s = JSON.parse(raw)
        if (s?.w > 0 && s?.h > 0) return s
      }
    } catch {}
    return { w: 380, h: 520 }
  })
  useEffect(() => {
    if (!sizeKey) return
    try { localStorage.setItem(sizeKey, JSON.stringify(size)) } catch {}
  }, [sizeKey, size])
  const [resizing, setResizing] = useState(false)
  const [pendingImage, setPendingImage] = useState(null) // { mediaType, data, dataUrl }
  const [pendingData, setPendingData] = useState(null)   // { summary, chip: { name, info } }
  const fileInputRef = useRef(null)

  // Show/hide tool pills toggle — default hidden for cleaner look
  const showToolsKey = storageKey ? `${storageKey}-show-tools` : null
  const [showTools, setShowTools] = useState(() => {
    if (!showToolsKey) return false
    try {
      const v = localStorage.getItem(showToolsKey)
      return v === '1'
    } catch { return false }
  })
  useEffect(() => {
    if (!showToolsKey) return
    try { localStorage.setItem(showToolsKey, showTools ? '1' : '0') } catch {}
  }, [showToolsKey, showTools])

  const startResize = (edges) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = size.w
    const startH = size.h
    setResizing(true)
    const onMove = (ev) => {
      let w = startW
      let h = startH
      if (edges.includes('right')) {
        w = Math.max(280, Math.min(window.innerWidth - 32, startW + (ev.clientX - startX)))
      }
      if (edges.includes('top')) {
        h = Math.max(280, Math.min(window.innerHeight - 32, startH - (ev.clientY - startY)))
      }
      setSize({ w, h })
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const [messages, setMessages] = useState(() => {
    if (!storageKey) return []
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamBlocks, setStreamBlocks] = useState(null) // in-flight assistant blocks
  const [toolStatus, setToolStatus] = useState(null)     // 'executing' | null
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamBlocks, toolStatus, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  // Streams one turn, returns { blocks, stop_reason }
  const streamOnce = async (messagesPayload, onUpdate) => {
    const contextSuffix = context?.sectionLabel
      ? `\n\nUser context (provided by the host app — use this to tailor your suggestions):\n- Currently viewing tab: ${context.sectionLabel}${context.extra ? `\n- Additional context: ${context.extra}` : ''}`
      : ''
    const body = {
      model: modelId,
      max_tokens: maxTokens,
      system: (systemPrompt || '') + contextSuffix,
      messages: messagesPayload,
      stream: true,
    }
    if (tools && tools.length) body.tools = tools

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) {
      let detail = ''
      try { const j = await res.json(); detail = j?.error?.message || j?.error || '' } catch {}
      throw new Error(detail || `HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const blocks = []
    let stopReason = 'end_turn'

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const chunk of events) {
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            const ev = JSON.parse(jsonStr)
            if (ev.type === 'content_block_start') {
              const b = { ...ev.content_block }
              if (b.type === 'text') b.text = ''
              else if (b.type === 'tool_use') { b.input_json = ''; b.input = {} }
              blocks[ev.index] = b
              onUpdate?.(blocks.map(x => ({ ...x })))
            } else if (ev.type === 'content_block_delta') {
              const b = blocks[ev.index]
              if (!b) continue
              if (ev.delta.type === 'text_delta') {
                b.text = (b.text || '') + ev.delta.text
                onUpdate?.(blocks.map(x => ({ ...x })))
              } else if (ev.delta.type === 'input_json_delta') {
                b.input_json = (b.input_json || '') + ev.delta.partial_json
              }
            } else if (ev.type === 'content_block_stop') {
              const b = blocks[ev.index]
              if (b && b.type === 'tool_use' && b.input_json) {
                try { b.input = JSON.parse(b.input_json) } catch {}
                onUpdate?.(blocks.map(x => ({ ...x })))
              }
            } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
              stopReason = ev.delta.stop_reason
            }
          } catch {}
        }
      }
    }

    return { blocks: blocks.filter(Boolean), stop_reason: stopReason }
  }

  // Build the messages array sent to the API from internal state.
  // Strip our display-only `input_json` field from tool_use blocks.
  const toApiMessages = (history) =>
    history.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : m.content.map((b) => {
            if (b.type === 'tool_use') {
              return { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} }
            }
            if (b.type === 'tool_result') {
              return { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content }
            }
            if (b.type === 'text') return { type: 'text', text: b.text || '' }
            if (b.type === 'image') return { type: 'image', source: b.source }
            return b
          }),
    }))

  // Read a File/Blob as base64 data URL
  const readImage = (file) =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('Not an image'))
      const reader = new FileReader()
      reader.onload = () => {
        const url = reader.result
        const m = /^data:([^;]+);base64,(.+)$/.exec(url)
        if (!m) return reject(new Error('Bad image encoding'))
        resolve({ mediaType: m[1], data: m[2], dataUrl: url })
      }
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(file)
    })

  const onPaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        e.preventDefault()
        try {
          const img = await readImage(file)
          setPendingImage(img)
        } catch (err) {
          setError(err.message || 'Could not read image')
        }
        return
      }
    }
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be picked twice
    if (!file) return
    // Try image first when MIME indicates image
    if (file.type.startsWith('image/')) {
      try {
        const img = await readImage(file)
        setPendingImage(img)
        return
      } catch (err) {
        setError(err.message || 'Could not read image')
        return
      }
    }
    // Fall back to data attachment handler if provided
    if (onAttachData) {
      try {
        const result = await onAttachData(file)
        if (result) setPendingData(result)
      } catch (err) {
        setError(err.message || 'Could not read file')
      }
      return
    }
    setError(`Unsupported file: ${file.name}`)
  }

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim()
    const img = pendingImage
    const data = pendingData
    if ((!text && !img && !data) || loading) return

    // ── Slash commands (intercepted before sending to API) ──
    if (text.startsWith('/')) {
      const cmd = text.split(/\s+/)[0].slice(1).toLowerCase()
      if (cmd === 'clear') { clear(); setInput(''); return }
      if (cmd === 'export') { exportMarkdown(); setInput(''); return }
      if (cmd === 'copy')   { copyMarkdown(); setInput(''); return }
      if (cmd === 'tools' || cmd === 'help') {
        const helpText =
`**Available slash commands**
- \`/clear\` — clear the conversation
- \`/export\` — download conversation as markdown (.md)
- \`/copy\` — copy conversation to clipboard as markdown
- \`/tools\` — list available tools
- \`/help\` — this help

**Tips**
- Drag the top edge / right edge / corner of the panel to resize.
- Click the ◉ eye icon in the header to show/hide tool calls.
- Use the model picker chip in the header to switch between Opus / Sonnet / Haiku.
- Paste an image (Ctrl+V) or click 📎 to attach images and ${attachAccept.includes('.s1p') ? '.s1p / .s2p Touchstone files' : 'images'}.${voiceSupported ? '\n- Click the 🎤 mic to dictate by voice.' : ''}` +
          (tools && tools.length ? `\n\n**${tools.length} tools available:**\n${tools.map((t) => `- \`${t.name}\` — ${t.description.split('.')[0]}`).join('\n')}` : '')
        const fakeAssistant = { role: 'assistant', content: [{ type: 'text', text: helpText }] }
        setMessages([...messages, { role: 'user', content: text }, fakeAssistant])
        setInput('')
        return
      }
      // Unknown command — show error chip but still send to LLM
      setError(`Unknown command: /${cmd}. Try /help.`)
      setInput('')
      return
    }

    setInput('')
    setError(null)
    setPendingImage(null)
    setPendingData(null)

    const composedText = [
      data ? data.summary : null,
      text || (img ? 'What do you see in this image?' : data ? 'Analyze this measurement and tell me anything notable.' : ''),
    ].filter(Boolean).join('\n\n')

    const userContent = img
      ? [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data }, _dataUrl: img.dataUrl },
          { type: 'text', text: composedText },
        ]
      : composedText
    let history = [...messages, { role: 'user', content: userContent }]
    setMessages(history)
    setLoading(true)
    setStreamBlocks(null)

    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        setStreamBlocks([])
        const { blocks, stop_reason } = await streamOnce(toApiMessages(history), setStreamBlocks)
        const assistantMsg = { role: 'assistant', content: blocks }
        history = [...history, assistantMsg]
        setMessages(history)
        setStreamBlocks(null)

        if (stop_reason !== 'tool_use') break
        if (!onToolUse) break

        const toolUses = blocks.filter((b) => b.type === 'tool_use')
        if (toolUses.length === 0) break

        setToolStatus('executing')
        const results = []
        for (const tu of toolUses) {
          let result
          try {
            result = await onToolUse(tu.name, tu.input || {})
          } catch (err) {
            result = { error: err?.message || 'Tool failed' }
          }
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          })
        }
        setToolStatus(null)
        history = [...history, { role: 'user', content: results }]
        setMessages(history)
      }
    } catch (err) {
      setError(err.message || 'Request failed')
      setStreamBlocks(null)
      setToolStatus(null)
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clear = () => {
    setMessages([])
    setStreamBlocks(null)
    setToolStatus(null)
    setError(null)
  }

  // ── Markdown export of the conversation ───────────────
  const exportMarkdown = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const lines = [`# ${label} — exported ${new Date().toLocaleString()}`, '']
    for (const m of messages) {
      if (m.role === 'user') {
        if (typeof m.content === 'string') {
          lines.push(`## You`, '', m.content, '')
        } else if (Array.isArray(m.content)) {
          const text = m.content.find((b) => b.type === 'text')?.text || ''
          const hasImage = m.content.some((b) => b.type === 'image')
          if (text || hasImage) {
            lines.push(`## You`, '')
            if (hasImage) lines.push('_[image attached]_', '')
            if (text) lines.push(text, '')
          }
        }
      } else if (m.role === 'assistant') {
        lines.push(`## ${label.replace(/^◆ /, '').replace(/ · AGENT$/i, '')}`, '')
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]
        for (const b of blocks) {
          if (b.type === 'text' && b.text) lines.push(b.text, '')
          else if (b.type === 'tool_use') {
            lines.push(`> 🔧 \`${b.name}(${Object.entries(b.input || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})\``, '')
          }
        }
      }
    }
    const md = lines.join('\n')
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${ts}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  const copyMarkdown = async () => {
    const lines = []
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string') {
        lines.push(`**You:** ${m.content}`, '')
      } else if (m.role === 'assistant') {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]
        for (const b of blocks) if (b.type === 'text' && b.text) lines.push(b.text, '')
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch {}
  }

  // ── Voice input via Web Speech API ────────────────────
  const recognitionRef = useRef(null)
  const [voiceOn, setVoiceOn] = useState(false)
  const voiceSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  const toggleVoice = () => {
    if (!voiceSupported) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.')
      return
    }
    if (voiceOn) {
      recognitionRef.current?.stop()
      setVoiceOn(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const transcript = [...e.results].map((r) => r[0].transcript).join('')
      setInput(transcript)
    }
    rec.onerror = (e) => {
      setError(`Voice error: ${e.error || 'unknown'}`)
      setVoiceOn(false)
    }
    rec.onend = () => setVoiceOn(false)
    recognitionRef.current = rec
    rec.start()
    setVoiceOn(true)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 px-4 py-3 rounded-full text-[#0a0d0f] shadow-2xl transition-colors border"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          background: accent,
          borderColor: accentBright,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = accentBright)}
        onMouseLeave={(e) => (e.currentTarget.style.background = accent)}
        aria-label="Open chat"
      >
        <MessageSquare size={16} strokeWidth={2.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Ask</span>
        {messages.length > 0 && (
          <span className="text-[10px] bg-[#0a0d0f]/30 px-1.5 py-0.5 rounded">{visibleCount(messages)}</span>
        )}
      </button>
    )
  }

  // Visual messages — collapse user tool_results into the previous assistant's tool_use blocks
  const view = buildView(messages, streamBlocks)

  return (
    <div
      className="fixed bottom-4 left-4 z-[90] flex flex-col max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] bg-[#0a0d0f] border border-[#252e33] rounded-md shadow-2xl backdrop-blur-md overflow-hidden"
      style={{ fontFamily, width: size.w, height: size.h, userSelect: resizing ? 'none' : undefined }}
    >
      {/* Resize handles — top edge, right edge, top-right corner */}
      <div
        onPointerDown={startResize('top')}
        className="absolute top-0 left-2 right-3 h-1.5 cursor-ns-resize hover:bg-[#c97b3f]/20 z-[5]"
        title="Drag to resize"
      />
      <div
        onPointerDown={startResize('right')}
        className="absolute top-3 bottom-0 right-0 w-1.5 cursor-ew-resize hover:bg-[#c97b3f]/20 z-[5]"
        title="Drag to resize"
      />
      <div
        onPointerDown={startResize('top right')}
        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-[6]"
        style={{ background: 'linear-gradient(225deg, transparent 40%, ' + accent + ' 40%, ' + accent + ' 55%, transparent 55%, transparent 70%, ' + accent + ' 70%, ' + accent + ' 85%, transparent 85%)' }}
        title="Drag to resize"
      />
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#252e33] bg-[#12171a]">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: '#5eead4', boxShadow: '0 0 8px #5eead4' }}
          />
          <span
            className="text-[11px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: accent, fontFamily: '"JetBrains Mono", monospace' }}
          >
            {label}
          </span>
          {tools && tools.length > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider border"
              style={{ color: accent, borderColor: accent, background: 'transparent' }}
              title={`${tools.length} tools available`}
            >
              {tools.length} tools
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setModelMenuOpen((v) => !v)}
              disabled={loading}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider border bg-transparent hover:bg-[#1f1610] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: '#a7b0b6', borderColor: '#384249', fontFamily: '"JetBrains Mono", monospace' }}
              title={`Model: ${currentModel.label}`}
            >
              <span>{currentModel.label}</span>
              <ChevronDown size={9} />
            </button>
            {modelMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[100]"
                  onClick={() => setModelMenuOpen(false)}
                />
                <div
                  className="absolute top-full left-0 mt-1 z-[101] min-w-[160px] bg-[#0a0d0f] border border-[#252e33] rounded shadow-xl overflow-hidden"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setModelId(m.id); setModelMenuOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[#12171a] transition-colors"
                      style={{ color: m.id === modelId ? accent : '#a7b0b6' }}
                    >
                      <span>{m.label}</span>
                      <span className="text-[9px] uppercase tracking-wider text-[#6b7479]">{m.tier}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {tools && tools.length > 0 && (
            <button
              onClick={() => setShowTools((v) => !v)}
              className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
              title={showTools ? 'Hide tool calls' : 'Show tool calls'}
              style={showTools ? { color: accent } : undefined}
            >
              {showTools ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={exportMarkdown}
              className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
              title="Export conversation as markdown (or use /export)"
            >
              <Download size={13} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clear}
              className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
              title="Clear conversation (or use /clear)"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
            title="Minimize"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[13px] leading-relaxed"
      >
        {view.length === 0 && !loading && (
          <div className="space-y-3">
            <div className="text-[#a7b0b6] text-[12px] leading-relaxed">
              {roleDescription}
              {topics.length > 0 && (
                <>
                  {' '}Ask about{' '}
                  {topics.map((t, i) => (
                    <span key={t}>
                      <span style={{ color: accent }}>{t}</span>
                      {i < topics.length - 2 ? ', ' : i === topics.length - 2 ? ', or ' : ''}
                    </span>
                  ))}
                  .
                </>
              )}
            </div>
            <div className="space-y-1.5">
              {(contextStarters ? contextStarters(context) : starters).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left px-2.5 py-2 text-[12px] text-[#a7b0b6] bg-[#12171a] hover:bg-[#171d20] hover:text-[#fbbf24] border border-[#252e33] hover:border-[#384249] rounded transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {view
          .filter((item) => showTools || item.kind !== 'tool')
          .map((item, i) => (
            <ViewItem
              key={i}
              item={item}
              accent={accent}
              jumpTarget={item.kind === 'tool' ? toolToSection?.[item.name] : null}
              onJumpToSection={onJumpToSection}
            />
          ))}

        {toolStatus === 'executing' && (
          <div className="flex items-center gap-2 text-[#6b7479] text-[12px]">
            <Wrench size={12} className="animate-pulse" style={{ color: accent }} />
            <span>running tool…</span>
          </div>
        )}

        {loading && view.length > 0 && view[view.length - 1].kind !== 'streaming' && !toolStatus && (
          <div className="flex items-center gap-2 text-[#6b7479] text-[12px]">
            <Loader2 size={12} className="animate-spin" />
            <span>thinking…</span>
          </div>
        )}

        {loading && view.length === 0 && (
          <div className="flex items-center gap-2 text-[#6b7479] text-[12px]">
            <Loader2 size={12} className="animate-spin" />
            <span>thinking…</span>
          </div>
        )}

        {error && (
          <div className="text-[12px] text-[#f87171] bg-[#2a1010] border border-[#7a2020] rounded px-2.5 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-[#252e33] bg-[#0a0d0f] p-2 space-y-2">
        {pendingImage && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[#12171a] border border-[#252e33] rounded">
            <img
              src={pendingImage.dataUrl}
              alt=""
              className="w-10 h-10 object-cover rounded border border-[#252e33]"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#a7b0b6] truncate" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {pendingImage.mediaType.replace('image/', '').toUpperCase()} · {Math.round((pendingImage.data.length * 3) / 4 / 1024)} KB
              </div>
              <div className="text-[10px] text-[#6b7479]">attached — press Enter to send</div>
            </div>
            <button
              onClick={() => setPendingImage(null)}
              className="p-1 text-[#6b7479] hover:text-[#f87171] rounded"
              title="Remove image"
            >
              <XIcon size={13} />
            </button>
          </div>
        )}
        {pendingData && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[#12171a] border rounded" style={{ borderColor: accent + '60' }}>
            <div className="w-10 h-10 rounded border flex items-center justify-center shrink-0" style={{ borderColor: accent + '60', background: '#0a0d0f' }}>
              <span style={{ color: accent, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 700 }}>S1P</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#a7b0b6] truncate" style={{ fontFamily: '"JetBrains Mono", monospace' }} title={pendingData.chip.name}>
                {pendingData.chip.name}
              </div>
              <div className="text-[10px] text-[#6b7479] truncate" title={pendingData.chip.info}>{pendingData.chip.info}</div>
            </div>
            <button
              onClick={() => setPendingData(null)}
              className="p-1 text-[#6b7479] hover:text-[#f87171] rounded"
              title="Remove attachment"
            >
              <XIcon size={13} />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept={attachAccept}
            onChange={onPickFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="shrink-0 p-2 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            title={onAttachData ? 'Attach image or measurement file' : 'Attach image (or paste / Ctrl+V)'}
          >
            <Paperclip size={14} />
          </button>
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              disabled={loading}
              className="shrink-0 p-2 hover:bg-[#1f1610] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
              style={{ color: voiceOn ? '#f87171' : '#6b7479' }}
              title={voiceOn ? 'Stop voice input' : 'Start voice input'}
            >
              {voiceOn ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            placeholder={pendingImage || pendingData ? 'Add a question (optional)…' : placeholder}
            className="flex-1 resize-none bg-[#12171a] border border-[#252e33] focus:outline-none rounded px-2.5 py-2 text-[13px] text-[#f0ebe2] placeholder:text-[#6b7479] max-h-[120px]"
            style={{ fontFamily: 'inherit' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
            onBlur={(e) => (e.currentTarget.style.borderColor = '')}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !pendingImage && !pendingData)}
            className="shrink-0 px-3 py-2 disabled:bg-[#252e33] disabled:text-[#6b7479] disabled:cursor-not-allowed text-[#0a0d0f] rounded transition-colors flex items-center gap-1"
            style={{ background: loading || (!input.trim() && !pendingImage && !pendingData) ? undefined : accent }}
            onMouseEnter={(e) => {
              if (!loading && (input.trim() || pendingImage)) e.currentTarget.style.background = accentBright
            }}
            onMouseLeave={(e) => {
              if (!loading && (input.trim() || pendingImage)) e.currentTarget.style.background = accent
            }}
            title="Send (Enter)"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Build a flat array of view items from messages + in-flight stream
// Stitches assistant tool_use blocks with their matching tool_result by id
function buildView(messages, streamBlocks) {
  const view = []
  // Pre-index tool_results by tool_use_id for stitching
  const resultsById = {}
  for (const m of messages) {
    if (m.role === 'user' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'tool_result') resultsById[b.tool_use_id] = b
      }
    }
  }

  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        view.push({ kind: 'user', text: m.content })
      } else if (Array.isArray(m.content)) {
        // User message with blocks — could be image+text, or tool_result
        const hasNonTool = m.content.some((b) => b.type === 'image' || b.type === 'text')
        if (hasNonTool) {
          const textBlock = m.content.find((b) => b.type === 'text')
          const imgBlock = m.content.find((b) => b.type === 'image')
          view.push({
            kind: 'user',
            text: textBlock?.text || '',
            imageUrl: imgBlock?._dataUrl ||
              (imgBlock?.source?.type === 'base64'
                ? `data:${imgBlock.source.media_type};base64,${imgBlock.source.data}`
                : null),
          })
        }
        // tool_result-only user messages are not shown directly (stitched into tool_use above)
      }
    } else if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]
      for (const b of blocks) {
        if (b.type === 'text' && (b.text || '').trim()) {
          view.push({ kind: 'assistant', text: b.text })
        } else if (b.type === 'tool_use') {
          view.push({
            kind: 'tool',
            name: b.name,
            input: b.input || {},
            result: resultsById[b.id]?.content,
          })
        }
      }
    }
  }

  // In-flight stream
  if (streamBlocks && streamBlocks.length > 0) {
    for (const b of streamBlocks) {
      if (!b) continue
      if (b.type === 'text' && (b.text || '').length > 0) {
        view.push({ kind: 'streaming', text: b.text })
      } else if (b.type === 'tool_use') {
        view.push({
          kind: 'tool',
          name: b.name,
          input: b.input || tryParseJson(b.input_json) || {},
          result: undefined,
          partial: true,
        })
      }
    }
  }

  return view
}

function tryParseJson(s) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

function visibleCount(messages) {
  return messages.filter((m) => m.role === 'user' && typeof m.content === 'string').length +
         messages.filter((m) => m.role === 'assistant').length
}

function ViewItem({ item, accent, jumpTarget, onJumpToSection }) {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap bg-[#2a1d14] border border-[#3d2a1c] text-[#fbbf24] space-y-2">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              className="max-w-full max-h-[240px] rounded border border-[#3d2a1c]"
            />
          )}
          {item.text && <div>{item.text}</div>}
        </div>
      </div>
    )
  }
  if (item.kind === 'assistant' || item.kind === 'streaming') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap bg-[#12171a] border border-[#252e33] text-[#f0ebe2]">
          {item.text}
          {item.kind === 'streaming' && (
            <span
              className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse"
              style={{ background: accent }}
            />
          )}
        </div>
      </div>
    )
  }
  if (item.kind === 'tool') {
    return <ToolPill name={item.name} input={item.input} result={item.result} accent={accent} partial={item.partial} jumpTarget={jumpTarget} onJumpToSection={onJumpToSection} />
  }
  return null
}

function ToolPill({ name, input, result, accent, partial, jumpTarget, onJumpToSection }) {
  const [open, setOpen] = useState(false)
  const inputSummary = summarizeInput(input)
  let parsedResult = result
  if (typeof result === 'string') {
    try { parsedResult = JSON.parse(result) } catch {}
  }
  const canJump = jumpTarget && onJumpToSection && !partial && !parsedResult?.error
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[92%] w-full text-[12px] rounded border bg-[#0d1416]"
        style={{ borderColor: '#252e33' }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#12171a] rounded-t"
        >
          <ChevronRight
            size={11}
            style={{ color: accent, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          />
          <Wrench size={11} style={{ color: accent }} />
          <span className="font-mono text-[11px]" style={{ color: accent }}>{name}</span>
          <span className="text-[#6b7479] font-mono text-[11px] truncate flex-1">({inputSummary})</span>
          {partial ? (
            <Loader2 size={10} className="animate-spin text-[#6b7479]" />
          ) : parsedResult?.error ? (
            <span className="text-[10px] text-[#f87171]">err</span>
          ) : parsedResult ? (
            <span className="text-[10px]" style={{ color: '#5eead4' }}>ok</span>
          ) : null}
        </button>
        {open && (
          <div className="px-2.5 pb-2 pt-0 border-t" style={{ borderColor: '#1a2226' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#6b7479] mt-2 mb-1">input</div>
            <pre className="font-mono text-[11px] text-[#a7b0b6] whitespace-pre-wrap break-all">{JSON.stringify(input, null, 2)}</pre>
            {parsedResult !== undefined && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-[#6b7479] mt-2 mb-1">result</div>
                <pre
                  className="font-mono text-[11px] whitespace-pre-wrap break-all"
                  style={{ color: parsedResult?.error ? '#f87171' : '#f0ebe2' }}
                >{typeof parsedResult === 'object' ? JSON.stringify(parsedResult, null, 2) : String(parsedResult)}</pre>
              </>
            )}
            {canJump && (
              <button
                onClick={() => onJumpToSection(jumpTarget.id)}
                className="mt-2 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border bg-transparent hover:bg-[#1f1610]"
                style={{ color: accent, borderColor: accent + '60' }}
              >
                → Open in {jumpTarget.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return ''
  const entries = Object.entries(input)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? v : JSON.stringify(v)}`)
    .join(', ') + (entries.length > 4 ? '…' : '')
}

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MessageSquare, Send, Loader2, Trash2, Minimize2, Wrench, ChevronRight, ChevronDown, Eye, EyeOff, Image as ImageIcon, X as XIcon, Paperclip, Download, Mic, MicOff, HelpCircle, Globe } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useIsMobile } from './useIsMobile.js'

const MODEL_DEFAULT = 'claude-sonnet-4-6'
const MAX_TOOL_TURNS = 6
const MAX_STORED_MESSAGES = 40
const MAX_STORED_CHAT_BYTES = 700_000
const MAX_STORED_STRING = 12_000
const MAX_STORED_TOOL_RESULT_STRING = 80_000

const DEFAULT_MODELS = [
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',   tier: 'flagship' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', tier: 'balanced' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',  tier: 'fast' },
]

function redactDownloadPayload(value) {
  if (!value || typeof value !== 'object') return value
  const clone = Array.isArray(value) ? [...value] : { ...value }
  if (clone._download && typeof clone._download === 'object') {
    const { text, content, base64, data, ...meta } = clone._download
    const bytes = typeof text === 'string' ? text.length
      : typeof content === 'string' ? content.length
        : typeof base64 === 'string' ? Math.round(base64.length * 0.75)
          : undefined
    clone._download = {
      ...meta,
      bytes,
      payload: bytes ? 'redacted from model context; click Download in the tool card' : undefined,
    }
  }
  return clone
}

function sanitizeToolResultContent(content) {
  if (typeof content !== 'string') return content
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(redactDownloadPayload(parsed))
  } catch {
    return content
  }
}

function compactString(value, max = MAX_STORED_STRING) {
  if (typeof value !== 'string' || value.length <= max) return value
  return `${value.slice(0, max)}\n\n[trimmed ${value.length - max} chars from saved chat history]`
}

function compactForStorage(value, depth = 0) {
  if (value == null) return value
  if (typeof value === 'string') return compactString(value)
  if (typeof value !== 'object') return value
  if (depth > 5) return '[trimmed nested object from saved chat history]'
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => compactForStorage(item, depth + 1))
  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'base64' || key === 'data') && typeof child === 'string' && child.length > 2000) {
      out[key] = `[${key} payload omitted from saved chat history: ${child.length} chars]`
    } else {
      out[key] = compactForStorage(child, depth + 1)
    }
  }
  return out
}

function compactToolResultForStorage(content) {
  if (typeof content !== 'string') return compactForStorage(content)
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(compactForStorage(redactDownloadPayload(parsed)))
  } catch {
    return compactString(content, MAX_STORED_TOOL_RESULT_STRING)
  }
}

function compactBlockForStorage(block) {
  if (!block || typeof block !== 'object') return block
  if (block.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_use_id: block.tool_use_id,
      content: compactToolResultForStorage(block.content),
    }
  }
  if (block.type === 'image') {
    return {
      type: 'text',
      text: `[image attachment omitted from saved chat history${block.source?.media_type ? `: ${block.source.media_type}` : ''}]`,
    }
  }
  if (block.type === 'document') {
    return {
      type: 'text',
      text: `[document attachment omitted from saved chat history${block._pdfMeta?.name ? `: ${block._pdfMeta.name}` : ''}]`,
    }
  }
  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: compactForStorage(block.input || {}),
    }
  }
  if (block.type === 'text') return { type: 'text', text: compactString(block.text || '') }
  if (block.type === 'thinking') {
    return {
      type: 'thinking',
      thinking: compactString(block.thinking || '', 4000),
      signature: block.signature || '',
    }
  }
  return compactForStorage(block)
}

function compactMessageForStorage(message) {
  if (!message || typeof message !== 'object') return null
  const role = message.role === 'assistant' ? 'assistant' : 'user'
  if (typeof message.content === 'string') return { role, content: compactString(message.content) }
  if (Array.isArray(message.content)) {
    return {
      role,
      content: message.content.map(compactBlockForStorage).filter(Boolean),
    }
  }
  return { role, content: compactString(String(message.content ?? '')) }
}

function compactMessagesForStorage(messages) {
  if (!Array.isArray(messages)) return []
  let compacted = messages
    .slice(-MAX_STORED_MESSAGES)
    .map(compactMessageForStorage)
    .filter(Boolean)
  while (compacted.length > 4 && JSON.stringify(compacted).length > MAX_STORED_CHAT_BYTES) {
    compacted = compacted.slice(2)
  }
  return compacted
}

function loadStoredMessages(storageKey) {
  if (!storageKey) return []
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    return compactMessagesForStorage(JSON.parse(raw))
  } catch {
    try { localStorage.removeItem(storageKey) } catch {}
    return []
  }
}

function hasDownloadPayload(spec) {
  return Boolean(spec?.base64 || spec?.text || spec?.content || spec?.data)
}

class AgentItemBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Agent message render failed', error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="text-[12px] text-[#fbbf24] bg-[#1f1610] border border-[#7c4a16] rounded px-2.5 py-2">
        Agent card skipped because saved tool data was malformed.
        <button
          type="button"
          onClick={this.props.onClear}
          className="ml-2 underline text-[#f0ebe2] hover:text-[#fbbf24]"
        >
          Clear chat
        </button>
      </div>
    )
  }
}

function downloadToolFile(spec) {
  if (!spec || typeof window === 'undefined') return
  if (!hasDownloadPayload(spec)) {
    window.alert('This file payload was removed from saved chat history to keep the app fast. Ask the agent to regenerate the MI download.')
    return
  }
  const filename = spec.filename || 'tool-result.txt'
  const mime = spec.mime || 'application/octet-stream'
  let blob
  if (spec.base64) {
    const binary = atob(spec.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    blob = new Blob([bytes], { type: mime })
  } else {
    blob = new Blob([spec.text ?? spec.content ?? spec.data ?? ''], { type: mime })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
  const isMobile = useIsMobile()
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
  const [panelPosition, setPanelPosition] = useState(null)
  const clampPanelPosition = (pos, panelSize = size) => {
    if (typeof window === 'undefined') return pos
    const margin = 12
    const panelW = Math.min(panelSize.w, window.innerWidth - margin * 2)
    const panelH = Math.min(panelSize.h, window.innerHeight - margin * 2)
    return {
      x: Math.min(Math.max(margin, pos.x), Math.max(margin, window.innerWidth - panelW - margin)),
      y: Math.min(Math.max(margin, pos.y), Math.max(margin, window.innerHeight - panelH - margin)),
    }
  }
  const positionPanelNearLauncher = (anchorRect) => {
    if (typeof window === 'undefined') return { x: 16, y: 16 }
    if (!anchorRect) {
      return clampPanelPosition({ x: 16, y: window.innerHeight - size.h - 16 })
    }
    const margin = 12
    const gap = 12
    const panelW = Math.min(size.w, window.innerWidth - margin * 2)
    const panelH = Math.min(size.h, window.innerHeight - margin * 2)
    const roomRight = window.innerWidth - anchorRect.right
    const preferRight = roomRight >= panelW + gap || anchorRect.left < window.innerWidth / 2
    let x = preferRight ? anchorRect.right + gap : anchorRect.left - panelW - gap
    if (x + panelW > window.innerWidth - margin) x = anchorRect.left - panelW - gap
    if (x < margin) x = anchorRect.left
    const y = anchorRect.top + anchorRect.height / 2 - panelH / 2
    return clampPanelPosition({ x, y })
  }
  const openAtLauncher = (anchorRect) => {
    if (!isMobile) setPanelPosition(positionPanelNearLauncher(anchorRect))
    setOpen(true)
  }
  const syncPanelToLauncher = (anchorRect) => {
    if (!isMobile && open && anchorRect) setPanelPosition(positionPanelNearLauncher(anchorRect))
  }
  useEffect(() => {
    if (isMobile || !panelPosition) return undefined
    const handleResize = () => {
      setPanelPosition((current) => (current ? clampPanelPosition(current) : current))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isMobile, panelPosition, size.w, size.h])
  const [pendingImage, setPendingImage] = useState(null) // { mediaType, data, dataUrl }
  const [pendingPdf, setPendingPdf] = useState(null)     // { name, sizeKB, data }  PDF base64 sent as document block
  const [pendingData, setPendingData] = useState(null)   // { summary, chip: { name, info } }
  const fileInputRef = useRef(null)

  // Web search toggle (Anthropic native server-side tool)
  const webSearchKey = storageKey ? `${storageKey}-web-search` : null
  const [webSearch, setWebSearch] = useState(() => {
    if (!webSearchKey) return false
    try { return localStorage.getItem(webSearchKey) === '1' } catch { return false }
  })
  useEffect(() => {
    if (!webSearchKey) return
    try { localStorage.setItem(webSearchKey, webSearch ? '1' : '0') } catch {}
  }, [webSearchKey, webSearch])

  // Extended thinking toggle (Claude's structured reasoning chain visible to the user)
  const thinkingKey = storageKey ? `${storageKey}-thinking` : null
  const [thinkingMode, setThinkingMode] = useState(() => {
    if (!thinkingKey) return false
    try { return localStorage.getItem(thinkingKey) === '1' } catch { return false }
  })
  useEffect(() => {
    if (!thinkingKey) return
    try { localStorage.setItem(thinkingKey, thinkingMode ? '1' : '0') } catch {}
  }, [thinkingKey, thinkingMode])

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
    const startPanelPosition = panelPosition
    setResizing(true)
    const onMove = (ev) => {
      let w = startW
      let h = startH
      if (edges.includes('right')) {
        const left = startPanelPosition?.x ?? 16
        w = Math.max(280, Math.min(window.innerWidth - left - 12, startW + (ev.clientX - startX)))
      }
      if (edges.includes('top')) {
        h = Math.max(280, Math.min(window.innerHeight - 32, startH - (ev.clientY - startY)))
      }
      setSize({ w, h })
      if (edges.includes('top') && startPanelPosition) {
        setPanelPosition(clampPanelPosition({ ...startPanelPosition, y: startPanelPosition.y + startH - h }, { w, h }))
      }
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
    return loadStoredMessages(storageKey)
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
      localStorage.setItem(storageKey, JSON.stringify(compactMessagesForStorage(messages)))
    } catch {}
  }, [messages, storageKey])

  // Streams one turn, returns { blocks, stop_reason }
  const streamOnce = async (messagesPayload, onUpdate) => {
    const contextSuffix = context?.sectionLabel
      ? `\n\nUser context (provided by the host app — use this to tailor your suggestions):\n- Currently viewing tab: ${context.sectionLabel}${context.extra ? `\n- Additional context: ${context.extra}` : ''}`
      : ''
    const webSearchSuffix = webSearch
      ? '\n\nWeb search is enabled this turn. Use the web_search tool to look up live datasheets, manufacturer specs, latest standards revisions, or any cable information that is not in the on-board database. After finding a spec, offer to save it via add_cable so the user keeps a permanent local copy.'
      : ''
    const body = {
      model: modelId,
      max_tokens: maxTokens,
      system: (systemPrompt || '') + contextSuffix + webSearchSuffix,
      messages: messagesPayload,
      stream: true,
    }
    // Extended thinking — Claude's interleaved reasoning. Requires more tokens.
    if (thinkingMode) {
      body.thinking = { type: 'enabled', budget_tokens: 4000 }
      body.max_tokens = Math.max(maxTokens, 8000)
      // Thinking requires temperature unset (defaults to 1)
      delete body.temperature
    }
    const toolsList = []
    if (tools && tools.length) toolsList.push(...tools)
    if (webSearch) toolsList.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 })
    if (toolsList.length) body.tools = toolsList

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
              else if (b.type === 'thinking') b.thinking = ''
              else if (b.type === 'tool_use') { b.input_json = ''; b.input = {} }
              blocks[ev.index] = b
              onUpdate?.(blocks.map(x => ({ ...x })))
            } else if (ev.type === 'content_block_delta') {
              const b = blocks[ev.index]
              if (!b) continue
              if (ev.delta.type === 'text_delta') {
                b.text = (b.text || '') + ev.delta.text
                onUpdate?.(blocks.map(x => ({ ...x })))
              } else if (ev.delta.type === 'thinking_delta') {
                b.thinking = (b.thinking || '') + (ev.delta.thinking || '')
                onUpdate?.(blocks.map(x => ({ ...x })))
              } else if (ev.delta.type === 'signature_delta') {
                b.signature = (b.signature || '') + (ev.delta.signature || '')
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
              return { type: 'tool_result', tool_use_id: b.tool_use_id, content: sanitizeToolResultContent(b.content) }
            }
            if (b.type === 'text') return { type: 'text', text: b.text || '' }
            if (b.type === 'image') return { type: 'image', source: b.source }
            if (b.type === 'document') return { type: 'document', source: b.source }
            if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking || '', signature: b.signature || '' }
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

  // Read any file as base64 (used for PDF document blocks).
  const readBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const url = reader.result
        const m = /^data:[^;]+;base64,(.+)$/.exec(url)
        if (!m) return reject(new Error('Bad file encoding'))
        resolve(m[1])
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
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
    // PDF — send as document content block (Anthropic supports PDFs natively)
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      try {
        if (file.size > 32 * 1024 * 1024) {
          throw new Error('PDF too large (max 32 MB)')
        }
        const data = await readBase64(file)
        setPendingPdf({ name: file.name, sizeKB: Math.round(file.size / 1024), data })
        return
      } catch (err) {
        setError(err.message || 'Could not read PDF')
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
    const pdf = pendingPdf
    const data = pendingData
    if ((!text && !img && !pdf && !data) || loading) return

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
    setPendingPdf(null)
    setPendingData(null)

    const composedText = [
      data ? data.summary : null,
      text || (img
        ? 'What do you see in this image?'
        : pdf
          ? `Datasheet attached: ${pdf.name}. Extract the cable specs (id, name, family, Z₀ Ω, VF, OD mm, attenuation table { freq_MHz: dB_per_100ft }, AWG, materials, datasheet URL if present) and offer to save via add_cable. Be thorough — cite the page where each value appears.`
          : data
            ? 'Analyze this measurement and tell me anything notable.'
            : ''),
    ].filter(Boolean).join('\n\n')

    // Build the user content blocks, supporting all combinations of attachments.
    let userContent
    if (img || pdf) {
      const blocks = []
      if (pdf) {
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf.data },
          _pdfMeta: { name: pdf.name, sizeKB: pdf.sizeKB },
        })
      }
      if (img) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
          _dataUrl: img.dataUrl,
        })
      }
      blocks.push({ type: 'text', text: composedText })
      userContent = blocks
    } else {
      userContent = composedText
    }
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
  const [phoneMode, setPhoneMode] = useState(false)  // continuous conversation
  const voiceSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const ttsSupported = typeof window !== 'undefined' && !!window.speechSynthesis

  const voiceManualStopRef = useRef(false)
  const phoneModeRef = useRef(false)  // mirror in ref for use inside callbacks
  useEffect(() => { phoneModeRef.current = phoneMode }, [phoneMode])
  const autoSendTimerRef = useRef(null)

  // Voice command shortcuts — match before sending to LLM
  const parseVoiceCommand = (rawText) => {
    const text = rawText.trim().toLowerCase().replace(/[.!?,]+$/, '')
    if (/^(?:hey )?(?:claude|cable|robot)?[,\s]*(?:please\s+)?(?:run\s+)?(?:the\s+)?auto[\s-]?fix$/i.test(text)) {
      return { action: 'autofix' }
    }
    if (/^(?:hey )?(?:claude|cable|robot)?[,\s]*(?:please\s+)?clear (?:the )?(?:chat|conversation|history)$/i.test(text)) {
      return { action: 'clear' }
    }
    if (/^(?:hey )?(?:claude|cable|robot)?[,\s]*(?:please\s+)?stop (?:listening|talking|the chat|the call)$/i.test(text)) {
      return { action: 'stop_voice' }
    }
    const navMatch = text.match(/^(?:hey )?(?:claude|cable|robot)?[,\s]*(?:please\s+)?(?:show me|open|go to|switch to|take me to)\s+(?:the\s+)?(.+)$/i)
    if (navMatch) {
      return { action: 'navigate', target: navMatch[1].trim() }
    }
    return null
  }

  // Map a free-form voice navigation target to the closest section id
  const resolveNavTarget = (target) => {
    const t = target.toLowerCase()
    const map = {
      home: 'home', overview: 'home',
      progression: 'progression', flow: 'progression',
      conductor: 'm1', strand: 'm1', wire: 'm1',
      'twisted pair': 'm2', pair: 'm2',
      bundle: 'm3', '4-pair': 'm3',
      'z calc': 'calc', 'impedance calc': 'calc', impedance: 'calc',
      'tdr sim': 'tdr', tdr: 'tdr',
      'vna lab': 'vna', vna: 'vna', touchstone: 'vna',
      'process sim': 'sim', process: 'sim', recipe: 'sim',
      braid: 'braid', shield: 'braid',
      atten: 'atten', attenuation: 'atten',
      suckout: 'suckout', notch: 'suckout', tape: 'suckout',
      next: 'next', crosstalk: 'next',
      eye: 'eye', 'eye diagram': 'eye',
      cost: 'cost', bom: 'cost',
      qc: 'qc', 'qc stats': 'qc', cpk: 'qc', stats: 'qc',
      lay: 'lay', 'lay design': 'lay',
      library: 'library', vendors: 'library',
      catalog: 'catalog', glenair: 'catalog',
    }
    for (const [k, v] of Object.entries(map)) {
      if (t === k || t.includes(k)) return v
    }
    return null
  }

  const toggleVoice = (opts = {}) => {
    const { phone = false } = opts
    if (!voiceSupported) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.')
      return
    }
    if (voiceOn) {
      voiceManualStopRef.current = true
      recognitionRef.current?.stop()
      setVoiceOn(false)
      setPhoneMode(false)
      return
    }
    voiceManualStopRef.current = false
    setPhoneMode(phone)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    let finalTranscript = ''
    rec.onresult = (e) => {
      let interim = ''
      let newFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalTranscript += piece
          newFinal = true
        } else {
          interim += piece
        }
      }
      setInput((finalTranscript + interim).trimStart())
      // Phone mode: when user pauses (got a final), auto-send after a brief idle window
      if (phoneModeRef.current && newFinal) {
        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
        autoSendTimerRef.current = setTimeout(() => {
          const stash = finalTranscript.trim()
          if (!stash) return
          // Try a voice command first
          const cmd = parseVoiceCommand(stash)
          finalTranscript = ''
          if (cmd) {
            handleVoiceCommand(cmd)
            setInput('')
            return
          }
          // Otherwise: send as message
          send(stash)
          finalTranscript = ''
        }, 1300)
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setError(`Voice error: ${e.error || 'unknown'}`)
      voiceManualStopRef.current = true
      setVoiceOn(false)
      setPhoneMode(false)
    }
    rec.onend = () => {
      if (!voiceManualStopRef.current) {
        try { rec.start() } catch { setVoiceOn(false); setPhoneMode(false) }
      } else {
        setVoiceOn(false)
        setPhoneMode(false)
      }
    }
    recognitionRef.current = rec
    try {
      rec.start()
      setVoiceOn(true)
    } catch (err) {
      setError(`Voice start failed: ${err.message || err}`)
    }
  }

  const handleVoiceCommand = (cmd) => {
    if (cmd.action === 'autofix') {
      // Trigger Process Sim auto-fix via the same custom event the tab uses
      window.dispatchEvent(new CustomEvent('cable-suite:apply-preset', { detail: { section: 'sim-autofix', params: {}, label: 'Voice: auto-fix' } }))
      // Fallback: ask the agent if we're not on sim
      send('Run auto-fix on the current Process Sim recipe.')
      return
    }
    if (cmd.action === 'clear') {
      clear()
      return
    }
    if (cmd.action === 'stop_voice') {
      voiceManualStopRef.current = true
      recognitionRef.current?.stop()
      setVoiceOn(false)
      setPhoneMode(false)
      return
    }
    if (cmd.action === 'navigate') {
      const targetId = resolveNavTarget(cmd.target)
      if (targetId && onJumpToSection) {
        onJumpToSection(targetId)
      } else {
        send(`Can you take me to ${cmd.target}?`)
      }
      return
    }
  }

  // Phone-mode TTS: speak the agent's last text response
  const speakResponse = (text) => {
    if (!ttsSupported || !text) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text.slice(0, 1000).replace(/\[.+?\]/g, ''))  // strip citations
      utter.rate = 1.05
      utter.pitch = 1
      utter.lang = 'en-US'
      window.speechSynthesis.speak(utter)
    } catch {}
  }

  // When phone-mode, after each completed response speak it aloud
  const lastSpokenIndexRef = useRef(-1)
  useEffect(() => {
    if (!phoneMode || loading) return
    const lastIdx = messages.length - 1
    if (lastIdx <= lastSpokenIndexRef.current) return
    const last = messages[lastIdx]
    if (last?.role !== 'assistant') return
    const text = Array.isArray(last.content)
      ? last.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ')
      : (typeof last.content === 'string' ? last.content : '')
    if (text) speakResponse(text)
    lastSpokenIndexRef.current = lastIdx
  }, [messages, loading, phoneMode])

  const launcher = (
    <CorgiChatLauncher
      accent={accent}
      accentBright={accentBright}
      count={messages.length > 0 ? visibleCount(messages) : 0}
      isMobile={isMobile}
      busy={loading || toolStatus === 'executing'}
      storageKey={storageKey}
      active={open}
      onOpen={openAtLauncher}
      onMove={syncPanelToLauncher}
    />
  )

  if (!open) return <>{launcher}</>

  // Visual messages — collapse user tool_results into the previous assistant's tool_use blocks
  const view = buildView(messages, streamBlocks)
  const desktopPanelPosition = !isMobile && typeof window !== 'undefined'
    ? (panelPosition || clampPanelPosition({ x: 16, y: window.innerHeight - size.h - 16 }))
    : { x: 16, y: 16 }

  return (
    <>
      {!isMobile && launcher}
      {/* Mobile backdrop — tap to dismiss. Page peeks through above the sheet. */}
      {isMobile && (
        <div
          className="fixed inset-0 z-[89] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          style={{ animation: 'agentBackdropIn 0.2s ease-out' }}
        />
      )}
      <style>{`
        @keyframes agentBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes agentSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    <div
      className={`fixed z-[90] flex flex-col bg-[#0a0d0f] border-[#252e33] shadow-2xl overflow-hidden ${
        isMobile
          ? 'left-0 right-0 bottom-0 rounded-t-2xl border-t border-l border-r'  // bottom-sheet on mobile
          : 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] rounded-md border'
      }`}
      style={isMobile
        ? { fontFamily, top: 'max(env(safe-area-inset-top, 0px), 56px)', animation: 'agentSheetUp 0.28s cubic-bezier(0.32, 0.72, 0.0, 1)' }
        : { fontFamily, width: size.w, height: size.h, left: `${desktopPanelPosition.x}px`, top: `${desktopPanelPosition.y}px`, userSelect: resizing ? 'none' : undefined }
      }
    >
      {/* Mobile drag handle — visual cue + tap-to-dismiss */}
      {isMobile && (
        <button
          onClick={() => setOpen(false)}
          className="w-full flex items-center justify-center pt-2 pb-1.5 active:bg-[#1f1610]"
          title="Tap to close"
          aria-label="Close chat"
        >
          <span className="block w-12 h-1 rounded-full bg-[#384249]" />
        </button>
      )}
      {/* Resize handles — desktop only (mobile uses fixed bottom-sheet) */}
      {!isMobile && (
        <>
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
        </>
      )}
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
          <button
            onClick={() => setThinkingMode((v) => !v)}
            className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
            title={thinkingMode ? 'Extended thinking ON — agent shows its reasoning chain before answering (slower, more thoughtful). Click to disable.' : 'Extended thinking OFF — fast direct answers. Click to enable Claude\'s reasoning chain.'}
            style={thinkingMode ? { color: '#a78bfa' } : undefined}
          >
            <span className="font-mono text-[10px] font-bold tracking-tight">⊞</span>
          </button>
          <button
            onClick={() => setWebSearch((v) => !v)}
            className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
            title={webSearch ? 'Web search ON — agent can look up live datasheets / standards. Click to disable.' : 'Web search OFF — only on-board DB + training knowledge. Click to enable live web lookups.'}
            style={webSearch ? { color: '#5eead4' } : undefined}
          >
            <Globe size={13} />
          </button>
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
            className={`text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors ${isMobile ? 'px-2.5 py-1.5 flex items-center gap-1' : 'p-1.5'}`}
            title="Minimize"
            style={isMobile ? { color: accent, borderColor: accent + '50', borderWidth: 1, borderStyle: 'solid' } : undefined}
          >
            {isMobile ? (
              <>
                <XIcon size={14} />
                <span className="text-[10px] font-mono uppercase tracking-wider">Done</span>
              </>
            ) : (
              <Minimize2 size={13} />
            )}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-3 py-3 space-y-3 leading-relaxed ${isMobile ? 'text-[14.5px]' : 'text-[13px]'}`}
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
          .filter((item) => {
            if (item.kind !== 'tool') return true
            if (showTools) return true
            // Force-show actionable tool pills (one-click preset apply) even when "hide tools" is on
            let r = item.result
            if (typeof r === 'string') { try { r = JSON.parse(r) } catch {} }
            return r?._apply_preset != null || r?._download != null
          })
          .map((item, i) => (
            <AgentItemBoundary key={i} resetKey={`${item.kind}-${i}-${item.name || ''}`} onClear={clear}>
              <ViewItem
              key={i}
              item={item}
              accent={accent}
              jumpTarget={item.kind === 'tool' ? toolToSection?.[item.name] : null}
              onJumpToSection={onJumpToSection}
              />
            </AgentItemBoundary>
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
        {pendingPdf && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[#12171a] border rounded" style={{ borderColor: accent + '60' }}>
            <div className="w-10 h-10 rounded border flex items-center justify-center shrink-0" style={{ borderColor: accent + '60', background: '#0a0d0f' }}>
              <span style={{ color: accent, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 700 }}>PDF</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#a7b0b6] truncate" style={{ fontFamily: '"JetBrains Mono", monospace' }} title={pendingPdf.name}>
                {pendingPdf.name}
              </div>
              <div className="text-[10px] text-[#6b7479]">{pendingPdf.sizeKB} KB · datasheet · agent will extract specs</div>
            </div>
            <button
              onClick={() => setPendingPdf(null)}
              className="p-1 text-[#6b7479] hover:text-[#f87171] rounded"
              title="Remove PDF"
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
            capture={isMobile && attachAccept.includes('image') ? 'environment' : undefined}
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
            <>
              <button
                onClick={() => toggleVoice({ phone: false })}
                disabled={loading}
                className="shrink-0 p-2 hover:bg-[#1f1610] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                style={{ color: voiceOn && !phoneMode ? '#f87171' : '#6b7479' }}
                title={voiceOn && !phoneMode ? 'Stop voice input' : 'Start voice dictation (transcribe + edit before send)'}
              >
                {voiceOn && !phoneMode ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button
                onClick={() => toggleVoice({ phone: true })}
                disabled={loading}
                className="shrink-0 p-2 hover:bg-[#1f1610] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                style={{ color: phoneMode ? '#5eead4' : '#6b7479' }}
                title={phoneMode ? 'End phone-mode call' : 'Start phone-mode call — continuous listen + speak. Try voice commands: "auto-fix", "open process sim", "clear chat".'}
              >
                <span className="text-[14px] leading-none">{phoneMode ? '☎' : '☏'}</span>
              </button>
            </>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            placeholder={pendingImage || pendingPdf || pendingData ? 'Add a question (optional)…' : placeholder}
            className="flex-1 resize-none bg-[#12171a] border border-[#252e33] focus:outline-none rounded px-2.5 py-2 text-[13px] text-[#f0ebe2] placeholder:text-[#6b7479] max-h-[120px]"
            style={{ fontFamily: 'inherit' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
            onBlur={(e) => (e.currentTarget.style.borderColor = '')}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !pendingImage && !pendingPdf && !pendingData)}
            className="shrink-0 px-3 py-2 disabled:bg-[#252e33] disabled:text-[#6b7479] disabled:cursor-not-allowed text-[#0a0d0f] rounded transition-colors flex items-center gap-1"
            style={{ background: loading || (!input.trim() && !pendingImage && !pendingPdf && !pendingData) ? undefined : accent }}
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
    </>
  )
}

function CorgiChatLauncher({ accent, accentBright, count, isMobile, busy, storageKey, active, onOpen, onMove }) {
  const [modelReady, setModelReady] = useState(false)
  const launcherRef = useRef(null)
  const dragKey = storageKey ? `${storageKey}-corgi-launcher-position` : 'cable-suite-corgi-launcher-position'
  const [position, setPosition] = useState(() => {
    try {
      const raw = localStorage.getItem(dragKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed
    } catch {}
    return null
  })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({
    active: false,
    moved: false,
    justDragged: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    width: 204,
    height: 146,
  })

  const clampPosition = (x, y, width = dragRef.current.width, height = dragRef.current.height) => {
    if (typeof window === 'undefined') return { x, y }
    const margin = isMobile ? 8 : 12
    const maxX = Math.max(margin, window.innerWidth - width - margin)
    const maxY = Math.max(margin, window.innerHeight - height - margin)
    return {
      x: Math.min(Math.max(margin, x), maxX),
      y: Math.min(Math.max(margin, y), maxY),
    }
  }

  const rectFromPosition = (next, width = dragRef.current.width, height = dragRef.current.height) => ({
    left: next.x,
    top: next.y,
    right: next.x + width,
    bottom: next.y + height,
    width,
    height,
  })

  useEffect(() => {
    if (!position) return
    try { localStorage.setItem(dragKey, JSON.stringify(position)) } catch {}
  }, [dragKey, position])

  useEffect(() => {
    if (!position) return undefined
    const handleResize = () => {
      const rect = launcherRef.current?.getBoundingClientRect()
      setPosition((current) => {
        if (!current) return current
        const next = clampPosition(current.x, current.y, rect?.width || dragRef.current.width, rect?.height || dragRef.current.height)
        if (active) onMove?.(rectFromPosition(next, rect?.width || dragRef.current.width, rect?.height || dragRef.current.height))
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [position, isMobile, active, onMove])

  const handlePointerDown = (event) => {
    if (event.button != null && event.button !== 0) return
    const rect = launcherRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current.active = true
    dragRef.current.moved = false
    dragRef.current.pointerId = event.pointerId
    dragRef.current.startX = event.clientX
    dragRef.current.startY = event.clientY
    dragRef.current.originX = rect.left
    dragRef.current.originY = rect.top
    dragRef.current.width = rect.width
    dragRef.current.height = rect.height
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    setDragging(true)
    const next = clampPosition(drag.originX + dx, drag.originY + dy, drag.width, drag.height)
    setPosition(next)
    if (active) onMove?.(rectFromPosition(next, drag.width, drag.height))
    event.preventDefault()
  }

  const finishDrag = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.active = false
    drag.pointerId = null
    setDragging(false)
    if (drag.moved) {
      event.currentTarget.blur?.()
      drag.justDragged = true
      window.setTimeout(() => {
        dragRef.current.justDragged = false
      }, 120)
    }
  }

  const handleClick = (event) => {
    if (dragRef.current.justDragged) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const rect = launcherRef.current?.getBoundingClientRect()
    onOpen(rect
      ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
      : null)
  }

  return (
    <>
      <style>{`
        @keyframes corgiFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-3px) rotate(1deg); }
        }
        @keyframes corgiWag {
          0%, 100% { transform: rotate(-22deg); }
          50% { transform: rotate(22deg); }
        }
        @keyframes corgiBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.08); }
        }
        @keyframes corgiListen {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .agent-corgi-launcher {
          position: fixed;
          left: 16px;
          bottom: 14px;
          z-index: 90;
          width: 204px;
          height: 146px;
          border: 0;
          background: transparent;
          padding: 0;
          cursor: grab;
          touch-action: none;
          isolation: isolate;
          filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.45));
        }
        .agent-corgi-launcher-dragging {
          cursor: grabbing;
        }
        .agent-corgi-launcher-open {
          z-index: 91;
        }
        .agent-corgi-launcher:focus {
          outline: none;
        }
        .agent-corgi-launcher:focus-visible {
          outline: none;
        }
        .agent-corgi-launcher-mobile {
          left: 10px;
          bottom: 8px;
          width: 182px;
          height: 132px;
        }
        .agent-corgi-stage {
          position: absolute;
          left: 0;
          bottom: 6px;
          width: 138px;
          height: 126px;
          transform-origin: 50% 100%;
          transition: transform 0.18s ease;
          animation: corgiFloat 4.6s ease-in-out infinite;
        }
        .agent-corgi-launcher:hover .agent-corgi-stage {
          transform: translateY(-4px) scale(1.04);
        }
        .agent-corgi-launcher-busy .agent-corgi-stage {
          animation: corgiListen 1.15s ease-in-out infinite;
        }
        .agent-corgi-model {
          position: absolute;
          left: -26px;
          top: -42px;
          width: 184px;
          height: 166px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.22s ease;
        }
        .agent-corgi-model-ready {
          opacity: 1;
        }
        .agent-corgi-css {
          transition: opacity 0.2s ease;
        }
        .agent-corgi-css-hidden {
          opacity: 0;
        }
        .agent-corgi-shadow {
          position: absolute;
          left: 14px;
          width: 112px;
          bottom: 4px;
          height: 13px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.34);
          filter: blur(5px);
        }
        .agent-corgi-body {
          position: absolute;
          left: 13px;
          bottom: 8px;
          width: 58px;
          height: 36px;
          border-radius: 26px 24px 19px 20px;
          background: linear-gradient(135deg, #f6a23a 0%, #c6671d 62%, #8b3d12 100%);
          border: 1px solid rgba(255, 225, 179, 0.75);
          box-shadow: inset 0 7px 10px rgba(255, 220, 155, 0.28), inset -10px -8px 14px rgba(62, 27, 8, 0.28);
        }
        .agent-corgi-chest {
          position: absolute;
          left: 7px;
          bottom: 2px;
          width: 26px;
          height: 27px;
          border-radius: 18px 18px 12px 16px;
          background: #fff3d8;
          opacity: 0.96;
        }
        .agent-corgi-leg {
          position: absolute;
          bottom: 1px;
          width: 9px;
          height: 14px;
          border-radius: 8px 8px 4px 4px;
          background: #7a3713;
        }
        .agent-corgi-leg.front { left: 21px; }
        .agent-corgi-leg.back { left: 55px; }
        .agent-corgi-tail {
          position: absolute;
          left: 63px;
          bottom: 31px;
          width: 20px;
          height: 12px;
          border: 5px solid #f6a23a;
          border-left: 0;
          border-bottom: 0;
          border-radius: 0 16px 0 0;
          transform-origin: 0 100%;
          animation: corgiWag 0.72s ease-in-out infinite;
        }
        .agent-corgi-head {
          position: absolute;
          left: 6px;
          top: 4px;
          width: 43px;
          height: 39px;
          border-radius: 20px 20px 17px 17px;
          background: linear-gradient(145deg, #f5a23e 0%, #d87522 74%);
          border: 1px solid rgba(255, 229, 188, 0.78);
          box-shadow: inset 0 8px 10px rgba(255, 223, 174, 0.24);
        }
        .agent-corgi-ear {
          position: absolute;
          top: -10px;
          width: 18px;
          height: 23px;
          background: #b95417;
          border: 1px solid rgba(255, 222, 180, 0.6);
          transform-origin: 50% 100%;
          clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
        }
        .agent-corgi-ear.left { left: 2px; transform: rotate(-17deg); }
        .agent-corgi-ear.right { right: 2px; transform: rotate(17deg); }
        .agent-corgi-face-white {
          position: absolute;
          left: 9px;
          top: 10px;
          width: 25px;
          height: 25px;
          border-radius: 16px 16px 13px 13px;
          background: #fff5dc;
        }
        .agent-corgi-eye {
          position: absolute;
          top: 15px;
          width: 4px;
          height: 5px;
          border-radius: 999px;
          background: #21140d;
          animation: corgiBlink 5.5s ease-in-out infinite;
        }
        .agent-corgi-eye.left { left: 13px; }
        .agent-corgi-eye.right { right: 13px; }
        .agent-corgi-nose {
          position: absolute;
          left: 18px;
          top: 24px;
          width: 7px;
          height: 5px;
          border-radius: 999px;
          background: #21140d;
        }
        .agent-corgi-mouth {
          position: absolute;
          left: 18px;
          top: 29px;
          width: 8px;
          height: 4px;
          border-bottom: 1.5px solid #4d2b1d;
          border-radius: 0 0 10px 10px;
        }
        .agent-corgi-collar {
          position: absolute;
          left: 12px;
          bottom: 32px;
          width: 40px;
          height: 8px;
          border-radius: 999px;
          background: var(--agent-accent);
          box-shadow: 0 0 16px color-mix(in srgb, var(--agent-accent) 56%, transparent);
        }
        .agent-corgi-tag {
          position: absolute;
          left: 136px;
          bottom: 24px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 34px;
          padding: 0 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--agent-accent-bright), var(--agent-accent));
          border: 1px solid color-mix(in srgb, var(--agent-accent-bright) 72%, #fff 18%);
          color: #0a0d0f;
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.3px;
          text-transform: uppercase;
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.4);
          transition: transform 0.18s ease, background 0.18s ease;
        }
        .agent-corgi-launcher:hover .agent-corgi-tag {
          transform: translateX(3px);
          background: var(--agent-accent-bright);
        }
        .agent-corgi-count {
          min-width: 18px;
          height: 18px;
          display: inline-grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(10, 13, 15, 0.28);
          font-size: 10px;
          letter-spacing: 0;
        }
      `}</style>
      <button
        ref={launcherRef}
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className={`agent-corgi-launcher ${isMobile ? 'agent-corgi-launcher-mobile' : ''} ${busy ? 'agent-corgi-launcher-busy' : ''} ${dragging ? 'agent-corgi-launcher-dragging' : ''} ${active ? 'agent-corgi-launcher-open' : ''}`}
        style={{
          '--agent-accent': accent,
          '--agent-accent-bright': accentBright,
          ...(position ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto' } : null),
        }}
        aria-label="Open chat"
        title="Drag to move. Click to ask."
      >
        <span className="agent-corgi-shadow" aria-hidden="true" />
        <span className="agent-corgi-stage" aria-hidden="true">
          <CorgiModelPreview assetUrl="/models/corgi-assistant.glb" onReady={setModelReady} />
          <span className={`agent-corgi-css ${modelReady ? 'agent-corgi-css-hidden' : ''}`}>
            <span className="agent-corgi-tail" />
            <span className="agent-corgi-body">
              <span className="agent-corgi-chest" />
              <span className="agent-corgi-leg front" />
              <span className="agent-corgi-leg back" />
              <span className="agent-corgi-collar" />
            </span>
            <span className="agent-corgi-head">
              <span className="agent-corgi-ear left" />
              <span className="agent-corgi-ear right" />
              <span className="agent-corgi-face-white" />
              <span className="agent-corgi-eye left" />
              <span className="agent-corgi-eye right" />
              <span className="agent-corgi-nose" />
              <span className="agent-corgi-mouth" />
            </span>
          </span>
        </span>
        <span className="agent-corgi-tag">
          <MessageSquare size={14} strokeWidth={2.4} />
          Ask
          {count > 0 && <span className="agent-corgi-count">{count}</span>}
        </span>
      </button>
    </>
  )
}

function CorgiModelPreview({ assetUrl, onReady }) {
  const mountRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    let frameId = 0
    let renderer = null
    let scene = null
    let camera = null
    let model = null
    let resizeObserver = null

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
      const mount = mountRef.current
      if (!mount) return

      try {
        const exists = await fetch(assetUrl, { method: 'HEAD' })
        if (!alive || !exists.ok) {
          setReady(false)
          onReady?.(false)
          return
        }
      } catch {
        setReady(false)
        onReady?.(false)
        return
      }

      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
        ])
        if (!alive || !mountRef.current) return

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.display = 'block'
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(31, 1, 0.01, 80)
        camera.position.set(0, 0.04, 4.75)
        scene.add(camera)

        const ambient = new THREE.HemisphereLight(0xfff0d4, 0x182022, 2.8)
        const key = new THREE.DirectionalLight(0xffffff, 3.1)
        key.position.set(-2.2, 3.2, 4.4)
        const rim = new THREE.DirectionalLight(0xfbbf24, 1.3)
        rim.position.set(2.4, 0.6, 3.2)
        scene.add(ambient, key, rim)

        const resize = () => {
          if (!renderer || !camera || !mountRef.current) return
          const rect = mountRef.current.getBoundingClientRect()
          const width = Math.max(72, Math.floor(rect.width || 98))
          const height = Math.max(60, Math.floor(rect.height || 82))
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
        }
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(mount)
        resize()

        new GLTFLoader().load(
          assetUrl,
          (gltf) => {
            if (!alive || !scene) return
            model = gltf.scene
            const box = new THREE.Box3().setFromObject(model)
            const center = box.getCenter(new THREE.Vector3())
            const size = box.getSize(new THREE.Vector3())
            model.position.sub(center)
            const maxDim = Math.max(size.x, size.y, size.z, 0.001)
            model.scale.setScalar(1.72 / maxDim)
            model.rotation.set(-0.06, -1.62, 0.02)
            model.traverse((node) => {
              if (!node.isMesh || !node.material) return
              node.castShadow = false
              node.receiveShadow = false
              const mats = Array.isArray(node.material) ? node.material : [node.material]
              mats.forEach((mat) => {
                mat.roughness = Math.min(mat.roughness ?? 0.55, 0.72)
                mat.needsUpdate = true
              })
            })
            scene.add(model)
            setReady(true)
            onReady?.(true)
          },
          undefined,
          () => {
            setReady(false)
            onReady?.(false)
          }
        )

        const animate = () => {
          if (!alive || !renderer || !scene || !camera) return
          const t = performance.now() / 1000
          if (model) {
            model.position.y = -0.56 + Math.sin(t * 2.1) * 0.014
            model.rotation.y = -1.62 + Math.sin(t * 0.9) * 0.035
            model.rotation.z = 0.02 + Math.sin(t * 1.4) * 0.025
          }
          renderer.render(scene, camera)
          frameId = requestAnimationFrame(animate)
        }
        animate()
      } catch {
        setReady(false)
        onReady?.(false)
      }
    }

    run()

    return () => {
      alive = false
      cancelAnimationFrame(frameId)
      resizeObserver?.disconnect?.()
      if (model) disposeObject(model)
      renderer?.dispose?.()
      renderer?.domElement?.remove?.()
    }
  }, [assetUrl, onReady])

  return <span ref={mountRef} className={`agent-corgi-model ${ready ? 'agent-corgi-model-ready' : ''}`} />
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
        if (b.type === 'thinking' && (b.thinking || '').trim()) {
          view.push({ kind: 'thinking', text: b.thinking })
        } else if (b.type === 'text' && (b.text || '').trim()) {
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
      if (b.type === 'thinking' && (b.thinking || '').length > 0) {
        view.push({ kind: 'thinking', text: b.thinking, partial: true })
      } else if (b.type === 'text' && (b.text || '').length > 0) {
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
  if (item.kind === 'thinking') {
    return <ThinkingPill text={item.text} accent={accent} partial={item.partial} />
  }
  if (item.kind === 'assistant' || item.kind === 'streaming') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap bg-[#12171a] border border-[#252e33] text-[#f0ebe2]">
          {renderWithCitations(item.text, accent)}
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

function formatToolNumber(value, digits = 2) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : null
}

function buildApplyPreview(result) {
  if (!result || result.error) return null
  if (result._apply_preview) return result._apply_preview
  const rows = []
  const predicted = result.predicted || {}
  const targets = result.targets || {}
  if (predicted.z0_ohm != null) rows.push({ label: 'Z0', value: `${formatToolNumber(predicted.z0_ohm, 1)} Ω`, target: targets.target_z0_ohm != null ? `${targets.target_z0_ohm} Ω` : null })
  if (predicted.vp != null) rows.push({ label: 'VP', value: `${formatToolNumber(Number(predicted.vp) * 100, 1)}%`, target: targets.target_vp != null ? `${formatToolNumber(Number(targets.target_vp) * 100, 1)}%` : null })
  if (predicted.final_od_mm != null) rows.push({ label: 'Dielectric OD', value: `${formatToolNumber(predicted.final_od_mm, 3)} mm`, target: targets.dielectric_od_mm || targets.target_dielectric_od_mm ? `${formatToolNumber(targets.dielectric_od_mm || targets.target_dielectric_od_mm, 3)} mm` : null })
  if (predicted.bragg_notch_1_ghz != null) rows.push({ label: 'First notch', value: `${formatToolNumber(predicted.bragg_notch_1_ghz, 2)} GHz` })
  if (result.final_shield_od_in != null) rows.push({ label: 'Shield OD', value: `${formatToolNumber(result.final_shield_od_in, 4)} in` })
  if (result.shielding_estimate?.se_db != null) rows.push({ label: 'Shielding', value: `${formatToolNumber(result.shielding_estimate.se_db, 1)} dB` })
  const warnings = Array.isArray(result._preflight?.checks)
    ? result._preflight.checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.actual} vs ${check.target}`)
    : []
  return rows.length ? { rows, warnings } : null
}

function ToolGuardrailPanel({ safetyAudit, machineGuard, tolerance, miQa, miRenderQa, measuredTest, calibrationHint, accent }) {
  const blockers = (safetyAudit?.blocks?.length || 0) + (machineGuard?.blocks?.length || 0) + (miQa?.blocks?.length || 0)
  const warnings = (safetyAudit?.warnings?.length || 0) + (machineGuard?.warnings?.length || 0) + (miQa?.warnings?.length || 0)
  const tone = blockers ? '#f87171' : warnings ? '#fbbf24' : '#5eead4'
  const renderPage = miRenderQa?.pages?.[0]
  return (
    <div className="px-2.5 py-1.5 border-t text-[11px]" style={{ borderColor: '#1a2226', background: '#080d0f' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-wider" style={{ color: tone }}>
          {blockers ? 'Safety held' : warnings ? 'Safety review' : 'Safety pass'}
        </span>
        <span className="text-[#6b7479]">{blockers} blockers · {warnings} warnings</span>
      </div>
      {machineGuard?.checks?.length > 0 && (
        <div className="mt-1 grid gap-1">
          {machineGuard.checks.slice(0, 3).map((check) => (
            <div key={`${check.name}-${check.actual}`} className="flex items-center justify-between gap-2 font-mono text-[10px] border px-2 py-1" style={{ borderColor: '#1f2a2f', background: '#070b0c' }}>
              <span style={{ color: check.level === 'block' ? '#f87171' : check.level === 'warn' ? '#fbbf24' : '#5eead4' }}>{check.name}</span>
              <span className="text-[#a7b0b6]">{check.actual ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
      {tolerance?.rows?.length > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          {tolerance.rows.slice(0, 4).map((row) => (
            <div key={row.label} className="border px-2 py-1 font-mono text-[10px]" style={{ borderColor: '#1f2a2f', background: '#070b0c' }}>
              <div className="text-[#6b7479] uppercase tracking-wider">{row.label}</div>
              <div className="text-[#f0ebe2]">{row.min} / {row.nom} / {row.max} {row.unit}</div>
            </div>
          ))}
        </div>
      )}
      {miQa?.checks?.length > 0 && (
        <div className="mt-1 text-[10px] font-mono" style={{ color: accent }}>
          MI QA: {miQa.status} · {miQa.checks.slice(0, 2).map((check) => `${check.name} ${check.actual}`).join(' · ')}
        </div>
      )}
      {renderPage && (
        <div className="mt-1 border p-2 font-mono text-[10px]" style={{ borderColor: '#1f2a2f', background: '#f7f5ef', color: '#111' }}>
          <div className="flex items-center justify-between gap-2 border-b border-[#111] pb-1 text-[12px] font-bold">
            <span>{renderPage.title}</span>
            <span>{renderPage.mi_number || 'MI-ST962-AUTO'}</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {(renderPage.materials || []).slice(0, 3).map((material) => (
              <React.Fragment key={`${material.description}-${material.part_number}`}>
                <span>{material.description}</span>
                <b>{material.part_number || '-'}</b>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-[1fr_42px_54px_42px] border border-[#111]">
            <b className="border-b border-[#111] px-1">Parameter</b>
            <b className="border-b border-l border-[#111] px-1 text-center">Min</b>
            <b className="border-b border-l border-[#111] px-1 text-center">Nom</b>
            <b className="border-b border-l border-[#111] px-1 text-center">Max</b>
            {(renderPage.parameter_rows || []).slice(0, 6).map((row) => (
              <React.Fragment key={row.label}>
                <span className="border-b border-[#999] px-1">{row.label}</span>
                <span className="border-b border-l border-[#999] px-1 text-center">{row.min}</span>
                <b className="border-b border-l border-[#999] px-1 text-center">{row.nom}</b>
                <span className="border-b border-l border-[#999] px-1 text-center">{row.max}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-1 text-[#333]">
            MI Render QA: {miRenderQa.status} · {miRenderQa.message}
          </div>
        </div>
      )}
      {measuredTest && (
        <div className="mt-1 text-[10px] font-mono text-[#a7b0b6]">
          OCR/test import: {measuredTest.fields_detected} fields · Z0 {measuredTest.z0_ohm || '—'} · VP {measuredTest.vp_pct || '—'} · notch {measuredTest.suckout_ghz || '—'}
        </div>
      )}
      {calibrationHint && (
        <div className="mt-1 border px-2 py-1 font-mono text-[10px]" style={{ borderColor: '#1f2a2f', background: '#07110f', color: '#a7b0b6' }}>
          <div className="uppercase tracking-wider" style={{ color: '#5eead4' }}>
            Calibration Memory · {calibrationHint.confidence} · {calibrationHint.matched_count || 0}/{calibrationHint.sample_count || 0} match
          </div>
          <div>
            raw {calibrationHint.raw_prediction?.z0_ohm ?? '—'} Ω → calibrated {calibrationHint.calibrated_prediction?.z0_ohm ?? '—'} Ω · VP {calibrationHint.calibrated_prediction?.vp_pct ?? '—'}%
          </div>
        </div>
      )}
    </div>
  )
}

function ToolPill({ name, input, result, accent, partial, jumpTarget, onJumpToSection }) {
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  const [queued, setQueued] = useState(false)
  const inputSummary = summarizeInput(input)
  let parsedResult = result
  if (typeof result === 'string') {
    try { parsedResult = JSON.parse(result) } catch {}
  }
  const canJump = jumpTarget && onJumpToSection && !partial && !parsedResult?.error
  // Tool result may carry a one-click preset to apply to a tab
  const presetSection = parsedResult?._section
  const presetData = parsedResult?._apply_preset
  const presetLabel = parsedResult?.label
  const downloadSpec = parsedResult?._download
  const preflight = parsedResult?._preflight
  const applyPreview = buildApplyPreview(parsedResult)
  const safetyAudit = parsedResult?._safety_audit
  const machineGuard = parsedResult?._machine_guard
  const tolerance = parsedResult?._tolerance
  const miQa = parsedResult?._mi_qa
  const miRenderQa = parsedResult?._mi_render_qa
  const measuredTest = parsedResult?._measured_test
  const calibrationHint = parsedResult?._calibration_hint
  const applyBlocked = Boolean(parsedResult?._apply_blocked || preflight?.allow_apply === false)
  const canApplyPreset = presetSection && presetData && !applyBlocked && !partial && !parsedResult?.error
  const canDownload = downloadSpec && !partial && !parsedResult?.error
  const applyTargetLabel = presetSection === 'stack-measured' ? 'measured test' : presetSection
  const applyPreset = () => {
    if (onJumpToSection) onJumpToSection(presetSection)
    window.dispatchEvent(new CustomEvent('cable-suite:apply-preset', {
      detail: { section: presetSection, params: presetData, label: presetLabel },
    }))
    setApplied(true)
    setTimeout(() => setApplied(false), 1500)
  }
  const queuePreset = () => {
    if (onJumpToSection) onJumpToSection(presetSection)
    window.dispatchEvent(new CustomEvent('cable-suite:queue-preset', {
      detail: {
        section: presetSection,
        params: presetData,
        label: presetLabel,
        tool: name,
        preview: applyPreview,
        safetyAudit,
        machineGuard,
        tolerance,
        miQa,
        miRenderQa,
        measuredTest,
        calibrationHint,
      },
    }))
    setQueued(true)
    setTimeout(() => setQueued(false), 1500)
  }
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

        {/* Inline chart for tool results that carry plottable data */}
        {!partial && !parsedResult?.error && (
          <ToolChart name={name} result={parsedResult} accent={accent} />
        )}

        {/* Inline diagram for tool results that include _inline_svg */}
        {!partial && !parsedResult?.error && parsedResult?._inline_svg && (
          <ToolDiagram spec={parsedResult._inline_svg} title={parsedResult.title} annotation={parsedResult.annotation} accent={accent} />
        )}

        {/* Inline what-if panel for results that include _whatif_panel */}
        {!partial && !parsedResult?.error && parsedResult?._whatif_panel && (
          <WhatIfPanel spec={parsedResult._whatif_panel} accent={accent} />
        )}

        {!partial && !parsedResult?.error && applyPreview && (
          <div className="px-2.5 py-1.5 border-t text-[11px]" style={{ borderColor: '#1a2226', background: '#090f11' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono uppercase tracking-wider" style={{ color: accent }}>Apply preview</span>
              <span className="text-[#6b7479]">calculator check before the button</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {applyPreview.rows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="border px-2 py-1 font-mono text-[10px]" style={{ borderColor: '#1f2a2f', background: '#070b0c' }}>
                  <div className="text-[#6b7479] uppercase tracking-wider">{row.label}</div>
                  <div className="text-[#f0ebe2]">{row.value}</div>
                  {row.target && <div className="text-[#6b7479]">target {row.target}</div>}
                </div>
              ))}
            </div>
            {Array.isArray(applyPreview.warnings) && applyPreview.warnings.length > 0 && (
              <div className="mt-1 text-[#fbbf24] font-mono text-[10px]">
                {applyPreview.warnings.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
        )}

        {!partial && !parsedResult?.error && preflight && (
          <div className="px-2.5 py-1.5 border-t text-[11px]" style={{ borderColor: '#1a2226', background: preflight.allow_apply ? '#07110f' : '#140c0a' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono uppercase tracking-wider" style={{ color: preflight.allow_apply ? '#5eead4' : '#fbbf24' }}>
                {preflight.allow_apply ? 'Preflight pass' : 'Apply held'}
              </span>
              <span className="text-[#6b7479]">{preflight.message}</span>
            </div>
            {Array.isArray(preflight.checks) && preflight.checks.length > 0 && (
              <div className="mt-1 grid gap-1">
                {preflight.checks.map((check) => (
                  <div key={check.name} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span style={{ color: check.pass ? '#5eead4' : '#f87171' }}>{check.name}</span>
                    <span className="text-[#a7b0b6]">
                      {check.actual} / {check.target}{check.unit && check.unit !== 'VP' ? ` ${check.unit}` : ''}
                      <span className="text-[#6b7479]"> Δ {check.delta}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!partial && !parsedResult?.error && (safetyAudit || machineGuard || tolerance || miQa || miRenderQa || measuredTest || calibrationHint) && (
          <ToolGuardrailPanel
            safetyAudit={safetyAudit}
            machineGuard={machineGuard}
            tolerance={tolerance}
            miQa={miQa}
            miRenderQa={miRenderQa}
            measuredTest={measuredTest}
            calibrationHint={calibrationHint}
            accent={accent}
          />
        )}

        {/* Inline Apply button when the tool result carries a preset */}
        {canDownload && (
          <div className="flex items-center justify-between px-2.5 py-1.5 border-t" style={{ borderColor: '#1a2226', background: '#0a0d0f' }}>
            <div className="text-[11px] text-[#a7b0b6] flex items-center gap-2 min-w-0">
              <Download size={12} style={{ color: accent }} />
              <span className="truncate">{downloadSpec.label || downloadSpec.filename || 'Download file'}</span>
            </div>
            <button
              onClick={() => downloadToolFile(downloadSpec)}
              className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border hover:bg-[#1f1610] transition-colors flex items-center gap-1 shrink-0"
              style={{ color: accent, borderColor: accent + '60', background: 'transparent' }}
            >
              <Download size={11} />
              Download
            </button>
          </div>
        )}
        {canApplyPreset && (
          <div className="flex items-center justify-between px-2.5 py-1.5 border-t" style={{ borderColor: '#1a2226', background: '#0a0d0f' }}>
            <div className="text-[11px] flex items-center gap-2">
              {parsedResult.predicted_K_pct != null && (
                <span style={{ color: parsedResult.verdict === 'Insufficient' ? '#f87171' : '#5eead4' }}>
                  K = {parsedResult.predicted_K_pct}%
                </span>
              )}
              {parsedResult.verdict && (
                <span className="text-[10px] uppercase tracking-wider text-[#6b7479]">{parsedResult.verdict}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={queuePreset}
                disabled={queued}
                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border hover:bg-[#101d1a] transition-colors flex items-center gap-1"
                style={{
                  color: queued ? '#5eead4' : '#5eead4',
                  borderColor: '#5eead460',
                  background: 'transparent',
                }}
              >
                {queued ? '✓ queued' : 'Queue'}
              </button>
              <button
                onClick={applyPreset}
                disabled={applied}
                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border hover:bg-[#1f1610] transition-colors flex items-center gap-1"
                style={{
                  color: applied ? '#5eead4' : accent,
                  borderColor: (applied ? '#5eead4' : accent) + '60',
                  background: 'transparent',
                }}
              >
                {applied ? '✓ applied' : `→ Apply${presetLabel ? ` "${presetLabel}"` : ''} to ${applyTargetLabel}`}
              </button>
            </div>
          </div>
        )}
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
                >{typeof parsedResult === 'object' ? JSON.stringify(redactDownloadPayload(parsedResult), null, 2) : String(parsedResult)}</pre>
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

// Detect tool result shapes that have plottable data and render a small chart.
// Returns null when nothing chart-worthy is found, so the caller can skip the slot.
function ToolChart({ name, result, accent }) {
  if (!result || typeof result !== 'object') return null

  // sensitivity_analysis → result.sweep = [{ <vary>: x, z0_ohm: y }, ...]
  if (Array.isArray(result.sweep) && result.sweep.length > 1) {
    const xKey = Object.keys(result.sweep[0]).find((k) => k !== 'z0_ohm' && k !== 'error')
    const yKey = Object.keys(result.sweep[0]).find((k) => k !== xKey && k !== 'error')
    if (xKey && yKey) {
      const data = result.sweep.filter((p) => p[yKey] != null)
      return (
        <ChartFrame title={`${yKey} vs ${xKey}`}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <XAxis dataKey={xKey} stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `${xKey}=${v}`} />
              {[50, 75, 100].map((t) => <ReferenceLine key={t} y={t} stroke="#384249" strokeDasharray="2 2" />)}
              <Line type="monotone" dataKey={yKey} stroke={accent} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )
    }
  }

  // compare_cables → result.rows = [{ id, name, z0, atten_db, ... }]
  if (Array.isArray(result.rows) && result.rows.length > 0 && result.rows[0].atten_db != null) {
    const data = result.rows.map((r) => ({ name: r.name || r.id, IL: r.atten_db_total ?? r.atten_db, ΔvsBase: r.delta_db || 0 }))
    return (
      <ChartFrame title={`Insertion loss across cables`}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <XAxis dataKey="name" stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} interval={0} angle={-15} textAnchor="end" />
            <YAxis stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} unit=" dB" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="IL" fill={accent} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    )
  }

  // link_budget → result.breakdown = [{ stage, dbm }, ...]
  if (Array.isArray(result.breakdown) && result.breakdown.length > 1 && result.breakdown[0].dbm != null) {
    return (
      <ChartFrame title={`Link budget per stage`}>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={result.breakdown} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <XAxis dataKey="stage" stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} interval={0} />
            <YAxis stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} unit=" dBm" />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="stepAfter" dataKey="dbm" stroke={accent} strokeWidth={1.5} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    )
  }

  // compute_attenuation → result.atten_db_per_100ft as a single value, no chart.
  // But cable lookup with atten table → result.atten_db_per_100ft = { freq: dB }
  const attenTable = result.atten_db_per_100ft || result.cable?.atten_db_per_100ft
  if (attenTable && typeof attenTable === 'object' && Object.keys(attenTable).length >= 2) {
    const data = Object.entries(attenTable)
      .map(([f, db]) => ({ f: parseFloat(f), db: parseFloat(db) }))
      .filter((p) => !isNaN(p.f) && !isNaN(p.db))
      .sort((a, b) => a.f - b.f)
    if (data.length >= 2) {
      return (
        <ChartFrame title={`Attenuation table (dB/100ft vs MHz)`}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <XAxis dataKey="f" stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} scale="log" domain={['auto', 'auto']} type="number" unit=" MHz" />
              <YAxis stroke="#6b7479" tick={{ fontSize: 9 }} tickLine={false} unit=" dB" />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `${v} MHz`} />
              <Line type="monotone" dataKey="db" stroke={accent} strokeWidth={1.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )
    }
  }

  return null
}

function ChartFrame({ title, children }) {
  return (
    <div className="border-t" style={{ borderColor: '#1a2226', background: '#0a0d0f', padding: '8px 10px' }}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479] mb-1">{title}</div>
      {children}
    </div>
  )
}

const tooltipStyle = {
  background: '#0a0d0f',
  border: '1px solid #252e33',
  borderRadius: 3,
  fontSize: 11,
  fontFamily: 'JetBrains Mono, monospace',
  color: '#f0ebe2',
}

// Collapsible "thinking" block — Claude's extended reasoning chain
function ThinkingPill({ text, accent, partial }) {
  const [open, setOpen] = useState(false)
  const charCount = (text || '').length
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[88%] w-full text-[12px] rounded border bg-[#0d1416]"
        style={{ borderColor: '#252e33' }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#12171a] rounded-t"
        >
          <ChevronRight
            size={11}
            style={{ color: '#a78bfa', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          />
          <span className="font-mono text-[11px]" style={{ color: '#a78bfa' }}>thinking</span>
          <span className="text-[#6b7479] font-mono text-[10px] flex-1">{charCount} chars · click to read</span>
          {partial && <Loader2 size={10} className="animate-spin text-[#6b7479]" />}
        </button>
        {open && (
          <div className="px-3 py-2 border-t text-[11px] leading-relaxed whitespace-pre-wrap text-[#a7b0b6] italic" style={{ borderColor: '#1a2226', background: '#0a0d0f' }}>
            {text}
          </div>
        )}
      </div>
    </div>
  )
}

// Render assistant text with [CITATION] tags styled as small chips and
// inline math blocks ($$ ... $$) rendered in monospace formula style.
const CITATION_INFO = {
  WADELL: { full: 'Wadell — Transmission Line Design Handbook', color: '#5eead4' },
  POZAR: { full: 'Pozar — Microwave Engineering', color: '#5eead4' },
  FRIIS: { full: 'Friis path-loss equation', color: '#fbbf24' },
  SCTE51: { full: 'SCTE 51 — Drop Cable Braid Coverage', color: '#a78bfa' },
  TIA568: { full: 'TIA-568.2-D — Balanced Twisted-Pair Cabling', color: '#a78bfa' },
  IEC61156: { full: 'IEC 61156 — Multicore Symmetric Cables', color: '#a78bfa' },
  IEEE: { full: 'IEEE specification', color: '#a78bfa' },
  ITUR: { full: 'ITU-R recommendations', color: '#a78bfa' },
  MILDTL17: { full: 'MIL-DTL-17 — Cables, Coaxial', color: '#fb923c' },
  USB4: { full: 'USB4 Specification', color: '#7dd3fc' },
  HDMI21: { full: 'HDMI 2.1 Specification', color: '#7dd3fc' },
  SFF8431: { full: 'SFF-8431 — SFP+ DAC', color: '#7dd3fc' },
  ASTM: { full: 'ASTM B3 / B33 / B298 conductor specs', color: '#84cc16' },
  ISO13660: { full: 'ISO 13660 — Cpk capability', color: '#84cc16' },
  knowledge: { full: 'General training knowledge — no primary source', color: '#6b7479' },
}
function citationColor(tag) {
  if (CITATION_INFO[tag]) return CITATION_INFO[tag].color
  if (tag.startsWith('DATASHEET')) return '#e89357'
  return '#a7b0b6'
}
function citationLabel(tag) {
  if (CITATION_INFO[tag]) return CITATION_INFO[tag].full
  if (tag.startsWith('DATASHEET-')) return `Manufacturer datasheet · ${tag.slice(10)}`
  return tag
}
// Render the input text into a flat React array, scanning for in this priority:
//   1. Display math:  $$ ... $$        (block, larger, monospace)
//   2. Inline math:   $ ... $          (small mono chip)
//   3. Code:          ` ... `          (inline mono)
//   4. Citation tags: [SOURCE] / [SOURCE §X.Y]
function renderWithCitations(text, accent) {
  if (!text) return null
  // We tokenise in one pass with a combined regex.
  // Order matters: block math before inline math before code before citation.
  const combined = /(\$\$([^$]+)\$\$)|(\$([^$\n]{1,200})\$)|(`([^`\n]{1,200})`)|\[([A-Z][A-Z0-9-]+(?:\s+(?:p\.|§|ch\.|fig\.)\s*[\w.\-]+)?|knowledge)\]/g
  const out = []
  let lastIndex = 0
  let m
  let key = 0
  while ((m = combined.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index)
    if (before) out.push(<span key={`t${key++}`}>{before}</span>)
    if (m[1]) {
      // Display math
      out.push(
        <div key={`bm${key++}`} className="my-1.5 px-3 py-2 rounded font-mono text-[13px]" style={{ background: '#0a0d0f', border: `1px solid ${accent}30`, color: accent, overflowX: 'auto' }}>
          {m[2].trim()}
        </div>
      )
    } else if (m[3]) {
      // Inline math
      out.push(
        <span key={`im${key++}`} className="font-mono px-1 py-0.5 rounded text-[12px] mx-0.5" style={{ background: '#0a0d0f', border: '1px solid #252e33', color: accent }}>
          {m[4]}
        </span>
      )
    } else if (m[5]) {
      // Inline code
      out.push(
        <code key={`cd${key++}`} className="font-mono px-1 py-0.5 rounded text-[12px]" style={{ background: '#171d20', color: '#fbbf24' }}>
          {m[6]}
        </code>
      )
    } else if (m[7]) {
      // Citation tag
      const inner = m[7]
      const m2 = /^([A-Z][A-Z0-9-]+|knowledge)(\s+.*)?$/.exec(inner)
      const base = m2 ? m2[1] : inner
      const detail = m2 && m2[2] ? m2[2].trim() : ''
      const color = citationColor(base)
      out.push(
        <span
          key={`c${key++}`}
          title={citationLabel(base) + (detail ? ' · ' + detail : '')}
          className="inline-flex items-baseline gap-0.5 align-baseline px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono whitespace-nowrap"
          style={{ color, background: color + '14', border: `1px solid ${color}40`, lineHeight: 1.2 }}
        >
          {base}{detail ? <span className="opacity-70 ml-0.5">{detail}</span> : null}
        </span>
      )
    }
    lastIndex = combined.lastIndex
  }
  const tail = text.slice(lastIndex)
  if (tail) out.push(<span key={`t${key++}`}>{tail}</span>)
  return out
}

// Interactive "what-if" panel — sliders evaluate JS-expression outputs live
function WhatIfPanel({ spec, accent }) {
  const initialValues = useMemo(() => {
    const v = {}
    for (const s of spec.sliders || []) v[s.name] = Number(s.value) || 0
    return v
  }, [spec])
  const [values, setValues] = useState(initialValues)

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: Number(v) }))

  const evaluateOutput = (formula) => {
    try {
      // Build a sandboxed function: only Math + slider variables in scope
      const args = Object.keys(values)
      const fn = new Function(...args, 'Math', `return (${formula})`)
      const result = fn(...args.map((k) => values[k]), Math)
      return Number.isFinite(result) ? result : null
    } catch {
      return null
    }
  }

  return (
    <div className="border-t" style={{ borderColor: '#1a2226', background: '#0a0d0f', padding: '8px 10px' }}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479] mb-2">{spec.title}</div>
      <div className="bg-[#12171a] border border-[#252e33] rounded p-3 space-y-2">
        {spec.sliders.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <label className="font-mono text-[10px] uppercase tracking-wider w-24 shrink-0" style={{ color: '#6b7479' }}>{s.label}</label>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={values[s.name]}
              onChange={(e) => set(s.name, e.target.value)}
              className="flex-1 h-1"
              style={{ accentColor: accent }}
            />
            <input
              type="number"
              min={s.min}
              max={s.max}
              step={s.step}
              value={values[s.name]}
              onChange={(e) => set(s.name, e.target.value)}
              className="w-16 bg-[#0a0d0f] border border-[#252e33] rounded px-1 py-0.5 text-[10px] font-mono text-right"
              style={{ color: '#fbbf24' }}
            />
            {s.unit && <span className="font-mono text-[9px] w-8" style={{ color: '#6b7479' }}>{s.unit}</span>}
          </div>
        ))}
        <div className="border-t pt-2 mt-2 space-y-1" style={{ borderColor: '#252e33' }}>
          {spec.outputs.map((o, i) => {
            const val = evaluateOutput(o.formula)
            const decimals = o.decimals != null ? o.decimals : 3
            return (
              <div key={i} className="flex items-baseline justify-between text-[11px] font-mono">
                <span style={{ color: '#a7b0b6' }}>{o.label}</span>
                <span style={{ color: val == null ? '#f87171' : accent }}>
                  {val == null ? 'err' : val.toFixed(decimals)}
                  {o.unit && <span className="ml-1 opacity-70">{o.unit}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {spec.annotation && <div className="font-mono text-[10px] text-[#a7b0b6] mt-1.5">{spec.annotation}</div>}
    </div>
  )
}

// Render the SVG diagram described by a generate_diagram tool spec
function ToolDiagram({ spec, title, annotation, accent }) {
  const kind = spec?.kind
  const W = 320
  const H = 220

  const renderSvg = () => {
    if (kind === 'smith_chart') {
      // Normalised Smith chart
      const c = W / 2, cy = H / 2, R = Math.min(c, cy) - 8
      const points = Array.isArray(spec.impedances) ? spec.impedances : []
      // Smith mapping: Γ = (Z - 1) / (Z + 1) where Z is normalised
      const gammaOf = (re, im) => {
        const a = re - 1, b = im
        const c2 = re + 1
        const denom = c2 * c2 + b * b
        return [(a * c2 + b * b) / denom, (b * c2 - a * b) / denom]
      }
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <circle cx={c} cy={cy} r={R} fill="none" stroke="#384249" strokeWidth="1" />
          {[0.5, 1, 2].map((rval, i) => {
            // Constant resistance circle r: center (r/(1+r), 0), radius 1/(1+r) (in Γ plane, scaled)
            const cx = c + R * (rval / (1 + rval))
            const cR = R / (1 + rval)
            return <circle key={`r${i}`} cx={cx} cy={cy} r={cR} fill="none" stroke="#384249" strokeOpacity="0.5" strokeWidth="0.6" />
          })}
          {[0.5, 1, 2, -0.5, -1, -2].map((xval, i) => {
            // Constant reactance arc x: center (1, 1/x) on right edge in Γ plane, radius 1/|x|
            const cx = c + R
            const cyArc = cy - R / xval
            const arcR = R / Math.abs(xval)
            return <circle key={`x${i}`} cx={cx} cy={cyArc} r={arcR} fill="none" stroke="#384249" strokeOpacity="0.4" strokeWidth="0.5" />
          })}
          <line x1={c - R} y1={cy} x2={c + R} y2={cy} stroke="#252e33" strokeWidth="0.5" />
          {points.map((pt, i) => {
            const [gr, gi] = gammaOf(pt.real || 0, pt.imag || 0)
            const px = c + R * gr
            const py = cy - R * gi
            return (
              <g key={i}>
                <circle cx={px} cy={py} r={4} fill={accent} />
                {pt.label && <text x={px + 6} y={py - 4} fontSize="9" fill={accent} fontFamily="JetBrains Mono, monospace">{pt.label}</text>}
              </g>
            )
          })}
        </svg>
      )
    }
    if (kind === 'atten_curve') {
      const tbl = spec.atten_table || {}
      const rows = Object.entries(tbl).map(([f, db]) => ({ f: parseFloat(f), db: parseFloat(db) })).filter(p => !isNaN(p.f) && !isNaN(p.db)).sort((a, b) => a.f - b.f)
      if (rows.length < 2) return <text x="10" y="20" fontSize="11" fill="#a7b0b6">need ≥ 2 atten points</text>
      const fMin = Math.log10(Math.max(1, rows[0].f)), fMax = Math.log10(rows[rows.length - 1].f)
      const dbMin = 0, dbMax = Math.max(...rows.map(r => r.db))
      const xOf = (f) => 30 + (W - 50) * (Math.log10(Math.max(1, f)) - fMin) / Math.max(0.01, fMax - fMin)
      const yOf = (db) => H - 26 - (H - 50) * (db - dbMin) / Math.max(0.1, dbMax - dbMin)
      const path = rows.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.f)} ${yOf(p.db)}`).join(' ')
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <line x1="30" y1={H - 26} x2={W - 10} y2={H - 26} stroke="#384249" strokeWidth="0.5" />
          <line x1="30" y1="10" x2="30" y2={H - 26} stroke="#384249" strokeWidth="0.5" />
          {[1, 10, 100, 1000, 10000].filter(f => Math.log10(f) >= fMin && Math.log10(f) <= fMax).map(f => (
            <g key={f}>
              <line x1={xOf(f)} y1={H - 26} x2={xOf(f)} y2={H - 22} stroke="#384249" />
              <text x={xOf(f)} y={H - 12} fontSize="9" fill="#6b7479" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                {f >= 1000 ? `${f / 1000}G` : `${f}M`}
              </text>
            </g>
          ))}
          <path d={path} stroke={accent} strokeWidth="1.5" fill="none" />
          {rows.map((p, i) => <circle key={i} cx={xOf(p.f)} cy={yOf(p.db)} r="2.5" fill={accent} />)}
          <text x="6" y="18" fontSize="9" fill="#6b7479" fontFamily="JetBrains Mono, monospace">dB/100ft</text>
        </svg>
      )
    }
    if (kind === 'cross_section') {
      const layers = Array.isArray(spec.layers) ? spec.layers : []
      const cx = W / 2, cy = H / 2
      const totalT = layers.reduce((s, l) => s + (l.t_mm || 1), 0)
      const innerR = 12
      const maxR = Math.min(cx, cy) - 8
      let r = innerR
      const elems = []
      // Inner conductor
      elems.push(<circle key="cu" cx={cx} cy={cy} r={r} fill="#c97b3f" stroke="#e89357" strokeWidth="0.5" />)
      layers.forEach((l, i) => {
        const next = r + (l.t_mm / Math.max(0.5, totalT)) * (maxR - innerR)
        elems.push(<circle key={`l${i}`} cx={cx} cy={cy} r={next} fill={l.color || '#384249'} fillOpacity="0.55" stroke={l.color || '#384249'} strokeWidth="0.5" />)
        r = next
      })
      // Re-draw inner ones on top so they're visible
      let r2 = innerR
      layers.forEach((l, i) => {
        const next = r2 + (l.t_mm / Math.max(0.5, totalT)) * (maxR - innerR)
        if (i < layers.length) elems.push(<text key={`t${i}`} x={cx + next - 4} y={cy + 4 + i * 12} fontSize="8" fill={l.color || '#a7b0b6'} fontFamily="JetBrains Mono, monospace" textAnchor="end">{l.name}</text>)
        r2 = next
      })
      elems.push(<circle key="ccu" cx={cx} cy={cy} r={innerR} fill="#c97b3f" stroke="#e89357" strokeWidth="0.5" />)
      return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>{elems}</svg>
    }
    if (kind === 'bargraph') {
      const bars = Array.isArray(spec.bars) ? spec.bars : []
      if (bars.length === 0) return null
      const maxV = Math.max(...bars.map(b => b.value || 0))
      const barH = 22, gap = 6
      return (
        <svg width={W} height={Math.max(H, bars.length * (barH + gap) + 40)} viewBox={`0 0 ${W} ${Math.max(H, bars.length * (barH + gap) + 40)}`}>
          {bars.map((b, i) => {
            const w = (W - 110) * (b.value / Math.max(0.001, maxV))
            return (
              <g key={i}>
                <text x="6" y={20 + i * (barH + gap) + 14} fontSize="10" fill="#a7b0b6" fontFamily="JetBrains Mono, monospace">{b.label}</text>
                <rect x="100" y={20 + i * (barH + gap)} width={w} height={barH} fill={b.color || accent} fillOpacity="0.7" rx="2" />
                <text x={100 + w + 6} y={20 + i * (barH + gap) + 14} fontSize="10" fill={b.color || accent} fontFamily="JetBrains Mono, monospace">{b.value}{b.unit ? ` ${b.unit}` : ''}</text>
              </g>
            )
          })}
        </svg>
      )
    }
    if (kind === 'z_step_chart') {
      const trace = Array.isArray(spec.z_trace) ? spec.z_trace : []
      if (trace.length < 2) return <text x="10" y="20" fontSize="11" fill="#a7b0b6">need ≥ 2 z trace points</text>
      const xs = trace.map(p => p.x_m), zs = trace.map(p => p.z_ohm)
      const xMin = Math.min(...xs), xMax = Math.max(...xs)
      const zMin = Math.min(...zs) - 5, zMax = Math.max(...zs) + 5
      const xOf = (x) => 30 + (W - 50) * (x - xMin) / Math.max(0.01, xMax - xMin)
      const yOf = (z) => H - 26 - (H - 50) * (z - zMin) / Math.max(0.1, zMax - zMin)
      const path = trace.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.x_m)} ${yOf(p.z_ohm)}`).join(' ')
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <line x1="30" y1={yOf(50)} x2={W - 10} y2={yOf(50)} stroke="#384249" strokeDasharray="2 3" />
          <text x={W - 14} y={yOf(50) - 3} fontSize="8" fill="#6b7479" textAnchor="end" fontFamily="JetBrains Mono, monospace">50 Ω</text>
          <path d={path} stroke={accent} strokeWidth="1.5" fill="none" />
          <text x="6" y="18" fontSize="9" fill="#6b7479" fontFamily="JetBrains Mono, monospace">Z (Ω)</text>
          <text x={W - 6} y={H - 8} fontSize="9" fill="#6b7479" textAnchor="end" fontFamily="JetBrains Mono, monospace">x (m)</text>
        </svg>
      )
    }
    if (kind === 'eye_diagram') {
      const br = spec.bit_rate_gbps || 5
      const jit = spec.eye_jitter_ps || 15
      const T = 1000 / br
      const traces = []
      for (let t = 0; t < 50; t++) {
        const bits = [Math.random() > 0.5, Math.random() > 0.5, Math.random() > 0.5]
        const points = []
        const tau = 1000 / (2 * Math.PI * (br * 0.6))
        let v = bits[0] ? 1 : -1
        for (let i = 0; i < 100; i++) {
          const tt = (i / 100) * 2 * T
          const target = bits[Math.floor(i / 50) % bits.length] ? 1 : -1
          v += (target - v) * 0.08
          points.push([tt + (Math.random() - 0.5) * jit * 0.6, v])
        }
        traces.push(points)
      }
      const xMax = T * 2
      const xOf = (x) => 30 + (W - 50) * (x / xMax)
      const yOf = (v) => H / 2 - v * (H / 2 - 14)
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {traces.map((pts, i) => (
            <path key={i} d={pts.map((p, j) => `${j === 0 ? 'M' : 'L'} ${xOf(p[0])} ${yOf(p[1])}`).join(' ')} stroke={accent} strokeOpacity="0.18" strokeWidth="1" fill="none" />
          ))}
          <line x1="30" y1={H / 2} x2={W - 10} y2={H / 2} stroke="#384249" strokeWidth="0.5" />
          <text x="6" y="18" fontSize="9" fill="#6b7479" fontFamily="JetBrains Mono, monospace">{br} Gb/s</text>
        </svg>
      )
    }
    return <text x="10" y="20" fontSize="11" fill="#f87171">unknown diagram kind: {String(kind)}</text>
  }

  return (
    <div className="border-t" style={{ borderColor: '#1a2226', background: '#0a0d0f', padding: '8px 10px' }}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#6b7479] mb-1">{title}</div>
      <div className="bg-[#12171a] border border-[#252e33] rounded p-2 flex justify-center">
        {renderSvg()}
      </div>
      {annotation && <div className="font-mono text-[10px] text-[#a7b0b6] mt-1.5">{annotation}</div>}
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

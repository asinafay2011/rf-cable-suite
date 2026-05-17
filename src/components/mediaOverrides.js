import { useEffect, useState } from 'react'

const MEDIA_OVERRIDES_KEY = 'cable-suite-media-overrides-v1'
const MEDIA_CHANGED_EVENT = 'cable-suite:media-overrides-changed'

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(MEDIA_OVERRIDES_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeOverrides(overrides) {
  localStorage.setItem(MEDIA_OVERRIDES_KEY, JSON.stringify(overrides))
  window.dispatchEvent(new CustomEvent(MEDIA_CHANGED_EVENT))
}

export function setMediaOverride(slot, media) {
  if (!slot || !media) return null
  const overrides = readOverrides()
  const next = {
    ...media,
    slot,
    updated_at: new Date().toISOString(),
  }
  overrides[slot] = next
  writeOverrides(overrides)
  return next
}

export function getMediaOverride(slot) {
  if (!slot) return null
  return readOverrides()[slot] || null
}

export function useMediaOverride(slot, fallback) {
  const [media, setMedia] = useState(() => ({ ...fallback, ...(getMediaOverride(slot) || {}) }))

  useEffect(() => {
    const refresh = () => setMedia({ ...fallback, ...(getMediaOverride(slot) || {}) })
    const onApply = (event) => {
      const detail = event.detail || {}
      if (detail.section !== 'media-asset') return
      const params = detail.params || {}
      if (params.slot !== slot) return
      setMediaOverride(slot, params)
      refresh()
    }
    window.addEventListener(MEDIA_CHANGED_EVENT, refresh)
    window.addEventListener('cable-suite:apply-preset', onApply)
    return () => {
      window.removeEventListener(MEDIA_CHANGED_EVENT, refresh)
      window.removeEventListener('cable-suite:apply-preset', onApply)
    }
  }, [fallback, slot])

  return media
}

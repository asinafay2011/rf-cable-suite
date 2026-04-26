import { useEffect, useState } from 'react'

// Returns true when the viewport width is at or below the breakpoint (default 768 px / md).
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [breakpoint])
  return isMobile
}

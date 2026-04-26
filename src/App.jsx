import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import AppSwitcher from './components/AppSwitcher.jsx'

// Hide AppSwitcher on landing page (/) and About — they have their own nav
function ConditionalAppSwitcher() {
  const { pathname } = useLocation()
  if (pathname === '/' || pathname === '/about') return null
  return <AppSwitcher />
}

const RFApp = lazy(() => import('./pages/RFApp.jsx'))
const CableApp = lazy(() => import('./pages/CableApp.jsx'))
const AboutPage = lazy(() => import('./pages/AboutPage.jsx'))
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'))

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050302',
        color: '#a7b0b6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ opacity: 0.6 }}>◆ Loading…</span>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ConditionalAppSwitcher />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/rf" element={<RFApp />} />
          <Route path="/highspeed" element={<CableApp />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RFApp from './pages/RFApp.jsx'
import CableApp from './pages/CableApp.jsx'
import AppSwitcher from './components/AppSwitcher.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <AppSwitcher />
      <Routes>
        <Route path="/" element={<RFApp />} />
        <Route path="/highspeed" element={<CableApp />} />
      </Routes>
    </BrowserRouter>
  )
}

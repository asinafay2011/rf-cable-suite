import { NavLink } from 'react-router-dom'
import { Radio, Cable, BookOpen } from 'lucide-react'

const baseTab =
  'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium tracking-wide uppercase rounded-sm border transition-colors'

const cls = ({ isActive }) =>
  isActive
    ? `${baseTab} text-[#fbbf24] bg-[#3d2a1c] border-[#c97b3f]`
    : `${baseTab} text-[#a7b0b6] bg-transparent border-transparent hover:bg-[#1f1610]`

export default function AppSwitcher() {
  return (
    <div
      className="fixed top-3 right-3 z-[100] flex gap-1 p-1 rounded-md bg-[#0a0d0f]/90 backdrop-blur-md border border-[#1f1610] shadow-lg"
      style={{ fontFamily: '"Bricolage Grotesque", system-ui, sans-serif' }}
    >
      <NavLink to="/" end className={cls}>
        <Radio size={13} strokeWidth={2} />
        <span>RF</span>
      </NavLink>
      <NavLink to="/highspeed" className={cls}>
        <Cable size={13} strokeWidth={2} />
        <span>Highspeed</span>
      </NavLink>
      <NavLink to="/about" className={cls} title="Methodology & references">
        <BookOpen size={13} strokeWidth={2} />
      </NavLink>
    </div>
  )
}

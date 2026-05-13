import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FlaskConical, ChevronDown, ChevronRight,
  ShieldCheck, FolderKanban, GitBranch, Ticket, Zap,
} from 'lucide-react'
import styles from './Sidebar.module.css'

const modules = [
  { key: 'auth', label: 'Auth', icon: ShieldCheck },
  { key: 'project', label: 'Project', icon: FolderKanban },
]

export function Sidebar() {
  const location = useLocation()
  const [testsOpen, setTestsOpen] = useState(location.pathname.startsWith('/tests'))

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}><Zap size={18} /></div>
        <div>
          <div className={styles.brandName}>Happilee QA</div>
          <div className={styles.brandSub}>Test Dashboard</div>
        </div>
      </div>

      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>

        <div>
          <button
            className={`${styles.navItem} ${styles.navGroup} ${location.pathname.startsWith('/tests') ? styles.active : ''}`}
            onClick={() => setTestsOpen(o => !o)}
          >
            <FlaskConical size={16} />
            <span>Tests</span>
            <span className={styles.chevron}>
              {testsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>

          {testsOpen && (
            <div className={styles.subMenu}>
              {modules.map(m => (
                <NavLink
                  key={m.key}
                  to={`/tests/${m.key}`}
                  className={({ isActive }) => `${styles.subItem} ${isActive ? styles.subActive : ''}`}
                >
                  <m.icon size={13} />
                  <span>{m.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className={styles.divider} />

        <NavLink to="/integrations/jira" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <Ticket size={16} />
          <span>Jira</span>
        </NavLink>

        <NavLink to="/integrations/github" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <GitBranch size={16} />
          <span>GitHub</span>
        </NavLink>
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.footerDot} />
        <span>Stage Environment</span>
      </div>
    </aside>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts'
import {
  CheckCircle2, XCircle, FlaskConical, TrendingUp,
  AlertTriangle, Clock, Ticket, GitBranch, Brain,
  ChevronRight, ChevronDown, ShieldCheck, FolderKanban,
} from 'lucide-react'

import { useRunHistory } from '../hooks/useRunHistory'
import { useModuleReport } from '../hooks/useModuleReport'
import { useModuleRunSummaries } from '../hooks/useModuleRunSummaries'
import { useFailures } from '../hooks/useFailures'
import { StatCard } from '../components/ui/StatCard'
import { Badge } from '../components/ui/Badge'
import { passRate, formatDate, relativeTime } from '../utils/format'
import type { ModuleName } from '../types'
import styles from './DashboardPage.module.css'

const modules: { key: ModuleName; label: string; icon: typeof ShieldCheck; desc: string }[] = [
  { key: 'auth', label: 'Auth', icon: ShieldCheck, desc: 'Login · OTP · Session' },
  { key: 'project', label: 'Project', icon: FolderKanban, desc: 'Create · List · Refresh' },
]

export function DashboardPage() {
  const [selectedModule, setSelectedModule] = useState<ModuleName>('auth')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: runs, loading: runsLoading } = useRunHistory()
  const { data: failures, loading: failuresLoading } = useFailures()
  const latestRunId = runs[0]?.id ?? null
  useModuleReport(latestRunId, selectedModule) // preload for module switch

  // Module-specific per-run summaries (loads in background)
  const modSummaries = useModuleRunSummaries(runs, selectedModule)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // All-time aggregates — module-specific, from loaded summaries
  const loadedSummaries = Array.from(modSummaries.values()).filter(s => s.loaded && s.total > 0)
  const totalRuns       = runs.length
  const modAllPassed    = loadedSummaries.reduce((a, s) => a + s.passed, 0)
  const modAllFailed    = loadedSummaries.reduce((a, s) => a + s.failed, 0)
  const modAllTotal     = loadedSummaries.reduce((a, s) => a + s.total, 0)
  const modAllRate      = passRate(modAllPassed, modAllTotal)

  // Chart data — module-specific last 15 runs (use loaded summaries, fall back to combined)
  const chartData = [...runs].slice(0, 15).reverse().map(r => {
    const s = modSummaries.get(r.id)
    return {
      time: new Date(r.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      passed: s?.loaded ? s.passed : null,
      failed: s?.loaded ? s.failed : null,
      rate:   s?.loaded && s.total > 0 ? passRate(s.passed, s.total) : null,
    }
  })

  const selectedMod = modules.find(m => m.key === selectedModule)!
  const latest = runs[0]

  if (runsLoading) {
    return <div className={styles.loading}><div className={styles.spinner} /><span>Loading dashboard...</span></div>
  }

  return (
    <div className={styles.page}>

      {/* Header + Module Filter */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            {latest ? `Last run ${relativeTime(latest.timestamp)} · ${formatDate(latest.timestamp)}` : 'No runs yet'}
          </p>
        </div>

        <div className={styles.headerRight}>
          <span className={styles.filterLabel}>Viewing:</span>
          <div className={styles.dropWrap} ref={dropRef}>
            <button className={styles.moduleBtn} onClick={() => setDropOpen(o => !o)}>
              <selectedMod.icon size={14} />
              <span>{selectedMod.label}</span>
              <ChevronDown size={13} className={`${styles.chevron} ${dropOpen ? styles.open : ''}`} />
            </button>
            {dropOpen && (
              <div className={styles.dropdown}>
                {modules.map(m => (
                  <button
                    key={m.key}
                    className={`${styles.dropItem} ${selectedModule === m.key ? styles.dropActive : ''}`}
                    onClick={() => { setSelectedModule(m.key); setDropOpen(false) }}
                  >
                    <m.icon size={14} />
                    <div>
                      <div className={styles.dropLabel}>{m.label}</div>
                      <div className={styles.dropDesc}>{m.desc}</div>
                    </div>
                    {selectedModule === m.key && <CheckCircle2 size={13} style={{ marginLeft: 'auto', color: 'var(--pass)' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Stat Cards — driven by selected module */}
      <section className={styles.statsGrid}>
        <StatCard
          label="Total Runs"
          value={totalRuns}
          sub={`${selectedMod.label} · all time`}
          icon={<FlaskConical size={18} />}
          accent="blue"
        />
        <StatCard
          label={`${selectedMod.label} Pass Rate`}
          value={modAllTotal > 0 ? `${modAllRate}%` : '—'}
          sub={`${modAllPassed} passed of ${modAllTotal}`}
          icon={<TrendingUp size={18} />}
          accent="green"
        />
        <StatCard
          label={`${selectedMod.label} Failures`}
          value={modAllTotal > 0 ? modAllFailed : '—'}
          sub="All time · all runs"
          icon={<XCircle size={18} />}
          accent="red"
        />
        <StatCard
          label={`${selectedMod.label} Total`}
          value={modAllTotal > 0 ? modAllTotal : '—'}
          sub={`Across ${loadedSummaries.length} runs`}
          icon={<CheckCircle2 size={18} />}
          accent="purple"
        />
      </section>

      {/* Chart + Pass Rate Trend */}
      <section className={styles.chartRow}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Run History</h2>
              <p className={styles.cardSub}>Last 15 runs · all modules · passed vs failed</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} barSize={14} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="passed" name="Passed" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill="#25D366" />)}
              </Bar>
              <Bar dataKey="failed" name="Failed" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill="#ef4444" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.trendCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Pass Rate Trend</h2>
              <p className={styles.cardSub}>Last 15 runs · all modules · %</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(v: unknown) => [`${v}%`, 'Pass Rate']}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>


      {/* Latest Failures */}
      {!failuresLoading && failures && failures.failures.length > 0 && (
        <section className={styles.failuresSection}>
          <div className={styles.cardHeader}>
            <div className={styles.failTitle}>
              <AlertTriangle size={15} style={{ color: '#ef4444' }} />
              <h2 className={styles.cardTitle}>Latest Failures</h2>
              <span className={styles.failBadge}>{failures.failures.length}</span>
            </div>
            <span className={styles.cardSub}>From last run · AI analysis included</span>
          </div>
          <div className={styles.failureGrid}>
            {failures.failures.map((f, i) => (
              <div key={i} className={styles.failureCard}>
                <div className={styles.failureTop}>
                  <Badge status="failed" size="sm" />
                  <span className={styles.failureTime}><Clock size={11} /> {relativeTime(f.failedAt)}</span>
                </div>
                <div className={styles.failureName}>{f.scenarioName}</div>
                <div className={styles.failureStep}>Failed at: <em>{f.failedStepText}</em></div>
                {f.exactApiFailure && (
                  <div className={styles.apiFailure}>
                    <span className={`${styles.method} ${styles[f.exactApiFailure.method.toLowerCase()]}`}>{f.exactApiFailure.method}</span>
                    <span className={styles.apiStatus}>{f.exactApiFailure.status}</span>
                    <span className={styles.apiUrl}>{new URL(f.exactApiFailure.url).pathname}</span>
                  </div>
                )}
                {f.aiAnalysis && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiLabel}><Brain size={11} /> AI Analysis</div>
                    <p className={styles.aiText}>{f.aiAnalysis.rootCause}</p>
                  </div>
                )}
                <div className={styles.stepBar}>
                  {f.stepTimeline.map((s, si) => (
                    <div key={si} className={`${styles.stepDot} ${styles[`step_${s.status}`]}`} title={s.text} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Integrations */}
      <section className={styles.integrations}>
        <div className={styles.integCard} onClick={() => navigate('/integrations/jira')}>
          <div className={styles.integIcon} style={{ background: '#e8f0fe' }}>
            <Ticket size={20} style={{ color: '#1a73e8' }} />
          </div>
          <div className={styles.integBody}>
            <div className={styles.integName}>Jira</div>
            <div className={styles.integSub}>{modAllFailed} failures tracked</div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
        </div>
        <div className={styles.integCard} onClick={() => navigate('/integrations/github')}>
          <div className={styles.integIcon} style={{ background: '#f3f4f6' }}>
            <GitBranch size={20} style={{ color: '#1f2937' }} />
          </div>
          <div className={styles.integBody}>
            <div className={styles.integName}>GitHub Issues</div>
            <div className={styles.integSub}>{modAllFailed} issues opened</div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
        </div>
      </section>
    </div>
  )
}

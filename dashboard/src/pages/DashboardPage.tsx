import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts'
import {
  CheckCircle2, XCircle, FlaskConical, TrendingUp,
  AlertTriangle, Brain,
  ChevronRight, ChevronDown, ShieldCheck, FolderKanban,
  Ticket, GitBranch,
} from 'lucide-react'
import { useRunHistory } from '../hooks/useRunHistory'
import { useModuleReport } from '../hooks/useModuleReport'
import { useModuleRunSummaries } from '../hooks/useModuleRunSummaries'
import { useAllTickets } from '../hooks/useAllTickets'
import { StatCard } from '../components/ui/StatCard'
import { Badge } from '../components/ui/Badge'
import { passRate, formatDate, relativeTime } from '../utils/format'
import type { ModuleName, RichAIAnalysis, RunSummary } from '../types'
import styles from './DashboardPage.module.css'

const modules: { key: ModuleName; label: string; icon: typeof ShieldCheck; desc: string }[] = [
  { key: 'auth', label: 'Auth', icon: ShieldCheck, desc: 'Login · OTP · Session' },
  { key: 'project', label: 'Project', icon: FolderKanban, desc: 'Create · List · Refresh' },
]

// Circled digit suffixes for duplicate date labels
const CIRCLED = ['', ' ②', ' ③', ' ④', ' ⑤', ' ⑥', ' ⑦', ' ⑧', ' ⑨', ' ⑩']

function buildDateLabel(timestamp: string, seen: Map<string, number>): string {
  const base = new Date(timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  const count = (seen.get(base) ?? 0) + 1
  seen.set(base, count)
  return count === 1 ? base : `${base}${CIRCLED[Math.min(count - 1, CIRCLED.length - 1)]}`
}

export function DashboardPage() {
  const [selectedModule, setSelectedModule] = useState<ModuleName>('auth')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: allRuns, loading: runsLoading } = useRunHistory()

  // Filter runs to only those relevant to the selected module — same logic as TestsPage
  const runs = useMemo(() =>
    allRuns.filter((r: RunSummary) => {
      if (!r.module || typeof r.id === 'number') return true
      return r.module === selectedModule || r.module === 'full'
    }),
    [allRuns, selectedModule]
  )

  const latestRunId = runs[0]?.id ?? null

  // Module report for the latest run — used for latest failures section
  const { data: scenarios, raw } = useModuleReport(latestRunId, selectedModule)

  // Module-specific per-run summaries (loads in background)
  const modSummaries = useModuleRunSummaries(runs, selectedModule)

  // Tickets for integration counts
  const { data: allTickets } = useAllTickets()

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

  // Latest run stat card values
  const latestSummary  = runs[0] ? modSummaries.get(runs[0].id) : undefined
  const latestPassed   = latestSummary?.loaded ? latestSummary.passed : null
  const latestTotal    = latestSummary?.loaded ? latestSummary.total : null
  const latestRate     = latestTotal && latestTotal > 0 ? passRate(latestPassed ?? 0, latestTotal) : null
  const latestRunLabel = runs[0] ? String(runs[0].id).slice(-8) : null

  // Chart data — module-specific last 15 runs, date-labelled
  const dateCountMap = new Map<string, number>()
  const last15 = [...runs].slice(0, 15).reverse()
  const chartData = last15.map(r => {
    const s = modSummaries.get(r.id)
    const dateLabel = buildDateLabel(r.timestamp, dateCountMap)
    return {
      time:   dateLabel,
      runId:  r.id,
      fullDate: new Date(r.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      passed: s?.loaded ? s.passed : null,
      failed: s?.loaded ? s.failed : null,
      rate:   s?.loaded && s.total > 0 ? passRate(s.passed, s.total) : null,
    }
  })

  // Failed scenarios for latest failures
  const failedScenarios = scenarios.filter(s => s.status === 'failed').slice(0, 3)
  const allElements = raw?.features.flatMap(f => f.elements) ?? []

  const selectedMod = modules.find(m => m.key === selectedModule)!
  const latest = runs[0]

  // Custom tooltip for BarChart
  interface BarTooltipPayload {
    name: string
    value: number
    payload: {
      time: string
      fullDate: string
      runId: string | number
      passed: number | null
      failed: number | null
      rate: number | null
    }
  }

  function BarTooltipContent({ active, payload, label }: {
    active?: boolean
    payload?: BarTooltipPayload[]
    label?: string
  }) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: '#0f172a', border: 'none', borderRadius: 8, fontSize: 12, padding: '10px 14px', color: '#e2e8f0' }}>
        <div style={{ color: '#94a3b8', marginBottom: 4 }}>{d.fullDate || label}</div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>Run #{String(d.runId).slice(-8)}</div>
        <div style={{ color: '#25D366' }}>Passed: {d.passed ?? '—'}</div>
        <div style={{ color: '#ef4444' }}>Failed: {d.failed ?? '—'}</div>
        {d.rate !== null && <div style={{ color: '#6366f1', marginTop: 4 }}>Pass rate: {d.rate}%</div>}
      </div>
    )
  }

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

      {/* Stat Cards */}
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
          label="Latest Run"
          value={latestRate !== null ? `${latestRate}%` : '—'}
          sub={latestRunLabel && latestPassed !== null
            ? `Run #${latestRunLabel} · ${latestPassed} passed`
            : 'Loading…'}
          icon={<CheckCircle2 size={18} />}
          accent="purple"
        />
      </section>

      {/* Charts */}
      <section className={styles.chartRow}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Run History</h2>
              <p className={styles.cardSub}>Last 15 runs · {selectedMod.label} · passed vs failed</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart
              data={chartData}
              barSize={14}
              barGap={3}
              onClick={(e: any) => {
                if (e?.activePayload?.[0]?.payload?.runId) {
                  navigate(`/tests/${selectedModule}/run/${e.activePayload[0].payload.runId}`)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<BarTooltipContent />} />
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
              <p className={styles.cardSub}>Last 15 runs · {selectedMod.label} · %</p>
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

      {/* Latest Failures — from module report AI analysis */}
      {failedScenarios.length > 0 && (
        <section className={styles.failuresSection}>
          <div className={styles.cardHeader}>
            <div className={styles.failTitle}>
              <AlertTriangle size={15} style={{ color: '#ef4444' }} />
              <h2 className={styles.cardTitle}>Latest Failures</h2>
              <span className={styles.failBadge}>{failedScenarios.length}</span>
            </div>
            <span className={styles.cardSub}>From last run · AI analysis included</span>
          </div>
          <div className={styles.failureGrid}>
            {failedScenarios.map((s, i) => {
              const el = allElements.find(e => e.id === s.id)
              const ai = el?.aiAnalysis as RichAIAnalysis | undefined
              const failedStep = el?.steps.find(st => st.result.status === 'failed')
              const severity = ai?.severity?.toLowerCase() ?? null

              return (
                <div key={i} className={styles.failureCard}>
                  <div className={styles.failureTop}>
                    <Badge status="failed" size="sm" />
                    {severity && (
                      <span className={`${styles.severityBadge} ${styles[`sev_${severity}`]}`}>
                        {severity}
                      </span>
                    )}
                  </div>
                  <div className={styles.failureName}>{s.name}</div>
                  {failedStep && (
                    <div className={styles.failureStep}>
                      Failed at: <em>{failedStep.keyword}{failedStep.name}</em>
                    </div>
                  )}
                  {ai && (
                    <div className={styles.aiSection}>
                      <div className={styles.aiLabel}><Brain size={11} /> AI Analysis</div>
                      <p className={styles.aiText}>{ai.headline ?? ai.whatHappened ?? ai.rootCause ?? ''}</p>
                    </div>
                  )}
                  <div className={styles.failureActions}>
                    <button
                      className={styles.viewDetailsBtn}
                      onClick={() =>
                        navigate(`/tests/${selectedModule}/run/${latestRunId}/scenario/${encodeURIComponent(s.id)}`)
                      }
                    >
                      View details <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
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
            <div className={styles.integSub}>{allTickets.filter(t => t.jira).length} tickets tracked</div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
        </div>
        <div className={styles.integCard} onClick={() => navigate('/integrations/github')}>
          <div className={styles.integIcon} style={{ background: '#f3f4f6' }}>
            <GitBranch size={20} style={{ color: '#1f2937' }} />
          </div>
          <div className={styles.integBody}>
            <div className={styles.integName}>GitHub Issues</div>
            <div className={styles.integSub}>{allTickets.filter(t => t.github).length} issues opened</div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
        </div>
      </section>
    </div>
  )
}

import { useParams, useNavigate } from 'react-router-dom'
import { useRunHistory } from '../hooks/useRunHistory'
import { useModuleRunSummaries } from '../hooks/useModuleRunSummaries'
import { passRate, formatDate, relativeTime } from '../utils/format'
import { CheckCircle2, XCircle, Clock, ChevronRight, FlaskConical } from 'lucide-react'
import type { ModuleName } from '../types'
import styles from './TestsPage.module.css'

const moduleInfo: Record<ModuleName, { label: string; color: string }> = {
  auth:    { label: 'Auth',    color: '#6366f1' },
  project: { label: 'Project', color: '#0ea5e9' },
}

export function TestsPage() {
  const { module } = useParams<{ module: string }>()
  const mod = (module as ModuleName) || 'auth'
  const navigate = useNavigate()
  const { data: allRuns, loading: runsLoading } = useRunHistory()
  // Only show runs that belong to this module (or 'full' runs which include all modules)
  // Old timestamp-based runs (numbers) are shown on both pages for backwards compat
  const runs = allRuns.filter(r => {
    if (!r.module || typeof r.id === 'number') return true
    return r.module === mod || r.module === 'full'
  })
  const summaries = useModuleRunSummaries(runs, mod)
  const info = moduleInfo[mod] ?? moduleInfo.auth

  if (runsLoading) {
    return <div className={styles.loading}><div className={styles.spinner} /><span>Loading runs...</span></div>
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.moduleTag} style={{ background: `${info.color}15`, color: info.color }}>
          <FlaskConical size={13} /> {info.label}
        </div>
        <h1 className={styles.title}>{info.label} — Run History</h1>
        <p className={styles.subtitle}>
          {info.label}-specific results · {runs.length} run{runs.length !== 1 ? 's' : ''} · click any run to view full report
        </p>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Run ID</th>
              <th>Date & Time</th>
              <th>Passed</th>
              <th>Failed</th>
              <th>Total</th>
              <th>Pass Rate</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const s = summaries.get(r.id)
              const loaded = s?.loaded ?? false
              const passed = s?.passed ?? 0
              const failed = s?.failed ?? 0
              const total  = s?.total ?? 0
              const rate   = passRate(passed, total)
              const allPass = loaded && failed === 0

              return (
                <tr
                  key={r.id}
                  className={`${styles.row} ${loaded && !allPass ? styles.failRow : ''}`}
                  onClick={() => navigate(`/tests/${mod}/run/${r.id}`)}
                >
                  <td className={styles.num}>{i + 1}</td>
                  <td className={styles.runId}>
                    <span className={styles.runIdBadge}>#{String(r.id)}</span>
                  </td>
                  <td className={styles.dateCell}>
                    <div className={styles.dateMain}>{formatDate(r.timestamp)}</div>
                    <div className={styles.dateRel}><Clock size={10} /> {relativeTime(r.timestamp)}</div>
                  </td>
                  <td className={styles.passCell}>
                    {loaded
                      ? <span className={styles.passNum}><CheckCircle2 size={12} /> {passed}</span>
                      : <span className={styles.skeleton} />}
                  </td>
                  <td className={styles.failCell}>
                    {loaded
                      ? failed > 0
                        ? <span className={styles.failNum}><XCircle size={12} /> {failed}</span>
                        : <span className={styles.zeroNum}>—</span>
                      : <span className={styles.skeleton} />}
                  </td>
                  <td className={styles.totalCell}>
                    {loaded ? total : <span className={styles.skeleton} />}
                  </td>
                  <td className={styles.rateCell}>
                    {loaded ? (
                      <div className={styles.rateRow}>
                        <div className={styles.track}>
                          <div
                            className={styles.fill}
                            style={{
                              width: `${rate}%`,
                              background: rate === 100 ? 'var(--pass)' : rate >= 60 ? 'var(--skip)' : 'var(--fail)',
                            }}
                          />
                        </div>
                        <span className={styles.rateNum} style={{
                          color: rate === 100 ? 'var(--pass)' : rate >= 60 ? 'var(--skip)' : 'var(--fail)',
                        }}>{rate}%</span>
                      </div>
                    ) : <span className={styles.skeleton} style={{ width: 80 }} />}
                  </td>
                  <td>
                    {loaded
                      ? <span className={`${styles.statusBadge} ${allPass ? styles.badgePass : styles.badgeFail}`}>
                          {allPass ? '✓ Passed' : '✗ Failed'}
                        </span>
                      : <span className={styles.loadingDot} />}
                  </td>
                  <td>
                    <div className={styles.viewBtn}>
                      View <ChevronRight size={13} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Ticket, GitBranch, ExternalLink, AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { useAllTickets, type TicketEntry } from '../hooks/useAllTickets'
import { relativeTime } from '../utils/format'
import styles from './IntegrationsPage.module.css'

function statusColor(status: string) {
  const s = status.toLowerCase()
  if (s === 'done' || s === 'closed' || s === 'resolved') return 'var(--pass)'
  if (s === 'in progress' || s === 'in_progress') return 'var(--skip)'
  return 'var(--fail)'
}

function priorityColor(priority: string) {
  const p = priority.toLowerCase()
  if (p === 'highest' || p === 'critical') return '#dc2626'
  if (p === 'high') return '#c2410c'
  if (p === 'medium') return '#a16207'
  return '#16a34a'
}

function LiveStatus({ jiraKey }: { jiraKey: string }) {
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/jira/issue/${jiraKey}?fields=status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.fields?.status?.name) setStatus(d.fields.status.name) })
      .catch(() => {})
  }, [jiraKey])

  if (!status) return null
  return (
    <span className={styles.liveStatus} style={{ color: statusColor(status) }}>
      {status}
    </span>
  )
}

export function IntegrationsPage() {
  const { type } = useParams<{ type: string }>()
  const isJira = type === 'jira'
  const { data: allTickets, loading } = useAllTickets()
  const [refreshKey, setRefreshKey] = useState(0)

  const tickets = allTickets.filter(t => isJira ? !!t.jira : !!t.github)
  const resolved = tickets.filter(t => {
    const s = (isJira ? t.jira?.status : t.github?.status) ?? ''
    return ['done', 'closed', 'resolved'].includes(s.toLowerCase())
  })
  const inProgress = tickets.filter(t => {
    const s = (isJira ? t.jira?.status : t.github?.status) ?? ''
    return s.toLowerCase().includes('progress')
  })

  // Deduplicate by ticket key so same ticket linked to multiple scenarios shows once
  const seen = new Set<string>()
  const uniqueTickets: TicketEntry[] = []
  for (const t of tickets) {
    const key = isJira ? t.jira?.key : String(t.github?.number)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    uniqueTickets.push(t)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.iconWrap} style={{ background: isJira ? '#e8f0fe' : '#f3f4f6' }}>
          {isJira
            ? <Ticket size={22} style={{ color: '#1a73e8' }} />
            : <GitBranch size={22} style={{ color: '#1f2937' }} />}
        </div>
        <div>
          <h1 className={styles.title}>{isJira ? 'Jira' : 'GitHub'} Integration</h1>
          <p className={styles.subtitle}>
            {isJira ? 'Tickets created from test failures' : 'Issues opened from test failures'}
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => setRefreshKey(k => k + 1)}
          title="Refresh status from Jira/GitHub"
        >
          <RefreshCw size={14} /> Sync Status
        </button>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{allTickets.length}</div>
          <div className={styles.statLabel}>Failures Tracked</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--fail)' }}>{uniqueTickets.length}</div>
          <div className={styles.statLabel}>{isJira ? 'Tickets Created' : 'Issues Opened'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--skip)' }}>{inProgress.length}</div>
          <div className={styles.statLabel}>In Progress</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--pass)' }}>{resolved.length}</div>
          <div className={styles.statLabel}>Resolved</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            {isJira ? 'Jira Tickets' : 'GitHub Issues'}
          </h2>
        </div>

        {loading ? (
          <div className={styles.empty}><div className={styles.spinner} /></div>
        ) : uniqueTickets.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={32} style={{ color: 'var(--pass)', marginBottom: 10 }} />
            <div>No {isJira ? 'Jira tickets' : 'GitHub issues'} found.</div>
          </div>
        ) : (
          <table key={refreshKey} className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Scenario</th>
                <th>Error</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {uniqueTickets.map((t, i) => {
                const ticket = isJira ? t.jira : t.github
                const key    = isJira ? t.jira?.key : `#${t.github?.number}`
                const url    = isJira ? t.jira?.url : t.github?.url
                const status = isJira ? t.jira?.status : t.github?.status
                const priority = isJira ? t.jira?.priority : null

                return (
                  <tr key={i} className={styles.row}>
                    <td className={styles.num}>
                      <a href={url} target="_blank" rel="noreferrer" className={styles.ticketKey}>
                        {key}
                      </a>
                    </td>
                    <td className={styles.nameCell}>
                      <div className={styles.scenarioName}>{t.scenarioName}</div>
                      <div className={styles.scenarioMeta}>{t.mlrTag} · {t.module}</div>
                    </td>
                    <td className={styles.errorCell} title={t.errorSummary}>
                      {t.errorSummary.substring(0, 60)}…
                    </td>
                    <td>
                      {priority && (
                        <span className={styles.priorityBadge} style={{ color: priorityColor(priority) }}>
                          {priority}
                        </span>
                      )}
                    </td>
                    <td>
                      {isJira && t.jira ? (
                        <span className={styles.statusWrap}>
                          <span className={styles.statusBadge} style={{ color: statusColor(t.jira.status) }}>
                            <AlertCircle size={11} /> {t.jira.status}
                          </span>
                          <LiveStatus key={refreshKey} jiraKey={t.jira.key} />
                        </span>
                      ) : (
                        <span className={styles.statusBadge} style={{ color: statusColor(status ?? '') }}>
                          <AlertCircle size={11} /> {status}
                        </span>
                      )}
                    </td>
                    <td className={styles.timeCell}>
                      <Clock size={11} /> {relativeTime(ticket?.createdAt ?? t.failedAt)}
                    </td>
                    <td>
                      <a href={url} target="_blank" rel="noreferrer" className={styles.linkBtn}>
                        <ExternalLink size={12} /> View
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

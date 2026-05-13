import { useParams } from 'react-router-dom'
import { Ticket, GitBranch, ExternalLink, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useFailures } from '../hooks/useFailures'
import { relativeTime } from '../utils/format'
import styles from './IntegrationsPage.module.css'

export function IntegrationsPage() {
  const { type } = useParams<{ type: string }>()
  const { data: failures } = useFailures()
  const isJira = type === 'jira'

  const failureCount = failures?.failures.length ?? 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.iconWrap} style={{ background: isJira ? '#e8f0fe' : '#f3f4f6' }}>
          {isJira ? <Ticket size={22} style={{ color: '#1a73e8' }} /> : <GitBranch size={22} style={{ color: '#1f2937' }} />}
        </div>
        <div>
          <h1 className={styles.title}>{isJira ? 'Jira' : 'GitHub'} Integration</h1>
          <p className={styles.subtitle}>
            {isJira ? 'Tickets created from test failures' : 'Issues opened from test failures'}
          </p>
        </div>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{failureCount}</div>
          <div className={styles.statLabel}>Failures Tracked</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--fail)' }}>{failureCount}</div>
          <div className={styles.statLabel}>{isJira ? 'Tickets Created' : 'Issues Opened'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--skip)' }}>0</div>
          <div className={styles.statLabel}>In Progress</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--pass)' }}>0</div>
          <div className={styles.statLabel}>Resolved</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            {isJira ? 'Jira Tickets' : 'GitHub Issues'}
          </h2>
        </div>

        {failures?.failures.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Scenario</th>
                <th>Error</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {failures.failures.map((f, i) => (
                <tr key={i} className={styles.row}>
                  <td className={styles.num}>{isJira ? `MLR-${200 + i}` : `#${i + 1}`}</td>
                  <td className={styles.nameCell}>{f.scenarioName}</td>
                  <td className={styles.errorCell}>{f.error.message.substring(0, 60)}...</td>
                  <td>
                    <span className={styles.statusBadge}>
                      <AlertCircle size={11} /> Open
                    </span>
                  </td>
                  <td className={styles.timeCell}>
                    <Clock size={11} /> {relativeTime(f.failedAt)}
                  </td>
                  <td>
                    <button className={styles.linkBtn}>
                      <ExternalLink size={12} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            <CheckCircle2 size={32} style={{ color: 'var(--pass)', marginBottom: 10 }} />
            <div>No failures tracked — all tests passing!</div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useParams, useNavigate } from 'react-router-dom'
import { useModuleReport } from '../hooks/useModuleReport'
import { Badge } from '../components/ui/Badge'
import { formatDate, formatDuration, passRate, relativeTime } from '../utils/format'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, ChevronRight, FlaskConical,
} from 'lucide-react'
import type { ModuleName } from '../types'
import styles from './RunDetailPage.module.css'

const moduleInfo: Record<ModuleName, { label: string; color: string }> = {
  auth:    { label: 'Auth',    color: '#6366f1' },
  project: { label: 'Project', color: '#0ea5e9' },
}

export function RunDetailPage() {
  const { module, runId } = useParams<{ module: string; runId: string }>()
  const mod = (module as ModuleName) || 'auth'
  const navigate = useNavigate()
  const info = moduleInfo[mod] ?? moduleInfo.auth

  const { data: scenarios, raw, loading } = useModuleReport(
    runId ?? null,
    mod,
  )

  const passed  = scenarios.filter(s => s.status === 'passed').length
  const failed  = scenarios.filter(s => s.status === 'failed').length
  const total   = scenarios.length
  const rate    = passRate(passed, total)
  const generatedAt = raw?._meta.generatedAt

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /><span>Loading run data...</span></div>
  }

  return (
    <div className={styles.page}>

      {/* Back + breadcrumb */}
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate(`/tests/${mod}`)}>
          <ArrowLeft size={14} /> {info.label} Runs
        </button>
        <div className={styles.breadcrumb}>
          <span className={styles.breadLink} onClick={() => navigate('/')}>Dashboard</span>
          <ChevronRight size={12} />
          <span className={styles.breadLink} onClick={() => navigate(`/tests/${mod}`)}>{info.label}</span>
          <ChevronRight size={12} />
          <span>Run #{runId}</span>
        </div>
      </div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.moduleTag} style={{ background: `${info.color}15`, color: info.color }}>
          <FlaskConical size={13} /> {info.label}
        </div>
        <h1 className={styles.title}>Run #{runId}</h1>
        {generatedAt && (
          <p className={styles.subtitle}>
            {formatDate(generatedAt)} · {relativeTime(generatedAt)}
          </p>
        )}
      </header>

      {/* Summary cards */}
      <div className={styles.summaryRow}>
        <div className={styles.sumCard}>
          <div className={styles.sumIcon} style={{ background: '#dcfce7' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--pass)' }} />
          </div>
          <div>
            <div className={styles.sumVal} style={{ color: 'var(--pass)' }}>{passed}</div>
            <div className={styles.sumLabel}>Passed</div>
          </div>
        </div>
        <div className={styles.sumCard}>
          <div className={styles.sumIcon} style={{ background: '#fee2e2' }}>
            <XCircle size={18} style={{ color: 'var(--fail)' }} />
          </div>
          <div>
            <div className={styles.sumVal} style={{ color: 'var(--fail)' }}>{failed}</div>
            <div className={styles.sumLabel}>Failed</div>
          </div>
        </div>
        <div className={styles.sumCard}>
          <div className={styles.sumIcon} style={{ background: '#f0f4ff' }}>
            <FlaskConical size={18} style={{ color: 'var(--blue)' }} />
          </div>
          <div>
            <div className={styles.sumVal}>{total}</div>
            <div className={styles.sumLabel}>Total</div>
          </div>
        </div>
        <div className={styles.sumCard}>
          <div className={styles.sumIcon} style={{ background: '#f5f3ff' }}>
            <Clock size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <div className={styles.sumVal} style={{ color: rate > 80 ? 'var(--pass)' : rate > 50 ? 'var(--skip)' : 'var(--fail)' }}>
              {rate}%
            </div>
            <div className={styles.sumLabel}>Pass Rate</div>
          </div>
        </div>
        <div className={styles.rateBarWrap}>
          <div className={styles.rateTrack}>
            <div
              className={styles.rateFill}
              style={{
                width: `${rate}%`,
                background: rate > 80 ? 'var(--pass)' : rate > 50 ? 'var(--skip)' : 'var(--fail)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Scenarios table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Scenario</th>
              <th>Feature</th>
              <th>Status</th>
              <th>Steps</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr
                key={s.id}
                className={`${styles.row} ${s.status === 'failed' ? styles.failRow : ''}`}
                onClick={() => navigate(`/tests/${mod}/run/${runId}/scenario/${encodeURIComponent(s.id)}`)}
              >
                <td className={styles.num}>{i + 1}</td>
                <td className={styles.nameCell}><div className={styles.scenarioName}>{s.name}</div></td>
                <td className={styles.featureCell}>{s.feature.split(';')[0]}</td>
                <td><Badge status={s.status} size="sm" /></td>
                <td className={styles.steps}>
                  <span className={styles.stepPass}>{s.stepsPassed}</span>
                  {s.stepsFailed > 0 && <><span className={styles.stepSep}>/</span><span className={styles.stepFail}>{s.stepsFailed}</span></>}
                  <span className={styles.stepTotal}>/{s.stepsTotal}</span>
                </td>
                <td className={styles.duration}>{formatDuration(s.durationMs)}</td>
                <td><ChevronRight size={13} style={{ color: 'var(--text3)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {scenarios.length === 0 && (
          <div className={styles.empty}>No scenario data found for this run.</div>
        )}
      </div>
    </div>
  )
}

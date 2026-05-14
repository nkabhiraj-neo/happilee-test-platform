import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRunHistory } from '../hooks/useRunHistory'
import { useModuleReport } from '../hooks/useModuleReport'
import { useFailures } from '../hooks/useFailures'
import { useRunTickets } from '../hooks/useRunTickets'
import { Badge } from '../components/ui/Badge'
import { formatDuration } from '../utils/format'
import type { ModuleName, RichAIAnalysis } from '../types'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Brain,
  Terminal, Image, ChevronRight, AlertCircle, Ticket,
  GitBranch, MapPin, Wrench, ShieldAlert, Lightbulb,
  Code2, ShieldCheck, Video, Coins, ExternalLink,
} from 'lucide-react'
import styles from './TestDetailPage.module.css'

function splitNumberedText(text: string): string[] {
  return text.split(/\n/).map(s => s.trim()).filter(Boolean)
}

function typeBadgeClass(type?: string) {
  if (type === 'ENVIRONMENT_ISSUE') return styles.typeEnv
  if (type === 'TEST_ISSUE') return styles.typeTest
  return styles.typeRealBug
}

function typeLabel(type?: string) {
  if (type === 'ENVIRONMENT_ISSUE') return 'ENVIRONMENT ISSUE'
  if (type === 'TEST_ISSUE') return 'TEST ISSUE'
  return 'REAL BUG'
}

export function TestDetailPage() {
  const { module, runId, scenarioId } = useParams<{ module: string; runId: string; scenarioId: string }>()
  const mod = (module as ModuleName) || 'auth'
  const navigate = useNavigate()
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null)
  const [tokenBreakdown, setTokenBreakdown] = useState<{ scenarios: Array<{ tag: string; inputTokens: number; outputTokens: number; totalTokens: number }>; total: { inputTokens: number; outputTokens: number; totalTokens: number } } | null>(null)
  const [yopmailVideoOk, setYopmailVideoOk] = useState(true)
  const [liveJiraStatus, setLiveJiraStatus] = useState<string | null>(null)

  const { data: runs } = useRunHistory()
  const resolvedRunId = runId ?? (runs[0]?.id ?? null)
  const { data: scenarios, raw, loading } = useModuleReport(resolvedRunId, mod)
  const { data: failures } = useFailures()
  const { getTickets } = useRunTickets(resolvedRunId)

  const decodedId = decodeURIComponent(scenarioId || '')
  const scenario = scenarios.find(s => s.id === decodedId)

  const rawScenario = raw?.features
    .flatMap(f => f.elements)
    .find(el => el.id === decodedId)

  // Rich AI analysis from Cucumber JSON (injected by post-run-sync.mjs)
  const richAI = rawScenario?.aiAnalysis as RichAIAnalysis | undefined

  // Legacy failure data — used for exactApiFailure banner + expected/actual
  const failure = failures?.failures.find(f => f.scenarioName === scenario?.name)

  // MLR tag for this scenario
  const mlrTag = (rawScenario?.tags ?? [])
    .map((t: { name: string }) => t.name.replace('@', ''))
    .find((t: string) => t.startsWith('MLR-'))

  // Reset yopmail availability when scenario changes
  useEffect(() => { setYopmailVideoOk(true) }, [mlrTag, resolvedRunId])

  // Load token breakdown for this run
  useEffect(() => {
    if (!resolvedRunId) return
    fetch(`/reports/runs/${resolvedRunId}/token-breakdown.json`)
      .then(r => r.json())
      .then(setTokenBreakdown)
      .catch(() => {})
  }, [resolvedRunId])

  // Construct video filenames directly from runId + module + tag (pattern: {runId}-{mod}-{tag}-app.webm)
  const scenarioVideos = (mlrTag && resolvedRunId) ? {
    app: `${resolvedRunId}-${mod}-${mlrTag}-app.webm`,
    yopmail: `${resolvedRunId}-${mod}-${mlrTag}-yopmail.webm`,
  } : null
  const scenarioTokens = mlrTag
    ? tokenBreakdown?.scenarios.find(s => s.tag === mlrTag)
    : null

  // Linked tickets from tickets.json + live Jira status via proxy
  const linkedTickets = getTickets(mlrTag)
  useEffect(() => {
    if (!linkedTickets?.jira?.key) return
    fetch(`/api/jira/issue/${linkedTickets.jira.key}?fields=status,priority,assignee`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.fields?.status?.name) setLiveJiraStatus(d.fields.status.name) })
      .catch(() => {})
  }, [linkedTickets?.jira?.key])

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /><span>Loading scenario...</span></div>
  }

  if (!scenario || !rawScenario) {
    return (
      <div className={styles.page}>
        <button className={styles.back} onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className={styles.notFound}>Scenario not found.</div>
      </div>
    )
  }

  const visibleSteps = rawScenario.steps.filter(s => !s.hidden)
  const isFailed = scenario.status === 'failed'
  const sevLower = (richAI?.severity ?? 'high').toLowerCase()

  return (
    <div className={styles.page}>

      {/* Screenshot Modal */}
      {screenshotModal && (
        <div className={styles.modal} onClick={() => setScreenshotModal(null)}>
          <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setScreenshotModal(null)}>✕</button>
            <img src={screenshotModal} alt="Step screenshot" className={styles.modalImg} />
          </div>
        </div>
      )}

      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate(runId ? `/tests/${mod}/run/${runId}` : `/tests/${mod}`)}>
          <ArrowLeft size={14} /> Back to Run
        </button>
        <div className={styles.breadcrumb}>
          <span onClick={() => navigate('/')} className={styles.breadLink}>Dashboard</span>
          <ChevronRight size={12} />
          <span onClick={() => navigate(`/tests/${mod}`)} className={styles.breadLink}>{mod === 'auth' ? 'Auth' : 'Project'}</span>
          <ChevronRight size={12} />
          <span>{scenario.name}</span>
        </div>
      </div>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Badge status={scenario.status} />
          <span className={styles.runId}>Run #{String(scenario.runId)}</span>
          {richAI?.app_component && (
            <span className={styles.componentTag}>{richAI.app_component}</span>
          )}
        </div>
        <h1 className={styles.title}>{scenario.name}</h1>
        {richAI?.headline && <p className={styles.headline}>{richAI.headline}</p>}
        <div className={styles.meta}>
          <span><Clock size={12} /> {formatDuration(scenario.durationMs)}</span>
          <span>{scenario.stepsTotal} steps</span>
          <span className={styles.feature}>{scenario.feature.split(';')[0]}</span>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>

          {/* Linked Tickets */}
          {linkedTickets && (linkedTickets.jira || linkedTickets.github) && (
            <section className={styles.ticketsSection}>
              <h2 className={styles.sectionTitle}><Ticket size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Linked Tickets</h2>
              <div className={styles.ticketCards}>

                {linkedTickets.jira && (
                  <div className={styles.ticketCard}>
                    <div className={styles.ticketCardHeader}>
                      <span className={styles.ticketSource}>Jira</span>
                      <span className={`${styles.ticketStatus} ${styles[`jiraStatus_${(liveJiraStatus ?? linkedTickets.jira.status).replace(/\s+/g, '_').toLowerCase()}`] || styles.jiraStatusDefault}`}>
                        {liveJiraStatus ?? linkedTickets.jira.status}
                      </span>
                      {linkedTickets.jira.priority && (
                        <span className={styles.ticketPriority} data-priority={linkedTickets.jira.priority.toLowerCase()}>
                          {linkedTickets.jira.priority}
                        </span>
                      )}
                    </div>
                    <div className={styles.ticketKey}>{linkedTickets.jira.key}</div>
                    <div className={styles.ticketTitle}>{linkedTickets.jira.title}</div>
                    <div className={styles.ticketMeta}>
                      {linkedTickets.jira.assignee && <span>Assignee: {linkedTickets.jira.assignee}</span>}
                      <span>{linkedTickets.jira.type}</span>
                    </div>
                    <a href={linkedTickets.jira.url} target="_blank" rel="noreferrer" className={styles.ticketLink}>
                      Open in Jira <ExternalLink size={11} />
                    </a>
                  </div>
                )}

                {linkedTickets.github && (
                  <div className={styles.ticketCard}>
                    <div className={styles.ticketCardHeader}>
                      <span className={styles.ticketSource}>GitHub</span>
                      <span className={`${styles.ticketStatus} ${linkedTickets.github.status === 'open' ? styles.ghOpen : styles.ghClosed}`}>
                        {linkedTickets.github.status}
                      </span>
                    </div>
                    <div className={styles.ticketKey}>#{linkedTickets.github.number}</div>
                    <div className={styles.ticketTitle}>{linkedTickets.github.title}</div>
                    {linkedTickets.github.assignee && (
                      <div className={styles.ticketMeta}><span>Assignee: {linkedTickets.github.assignee}</span></div>
                    )}
                    <a href={linkedTickets.github.url} target="_blank" rel="noreferrer" className={styles.ticketLink}>
                      Open in GitHub <ExternalLink size={11} />
                    </a>
                  </div>
                )}

              </div>
            </section>
          )}

          {/* Step Timeline */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Step Timeline</h2>
            <div className={styles.stepList}>
              {visibleSteps.map((step, i) => {
                const status = step.result.status as 'passed' | 'failed' | 'skipped' | 'pending'
                const durationMs = Math.round((step.result.duration || 0) / 1_000_000)
                const imgEmbeddings = (step.embeddings ?? []).filter(e => e.mime_type?.startsWith('image/'))
                return (
                  <div key={i} className={`${styles.stepItem} ${styles[`step_${status}`]}`}>
                    <div className={styles.stepIcon}>
                      {status === 'passed' && <CheckCircle2 size={14} />}
                      {status === 'failed' && <XCircle size={14} />}
                      {(status === 'skipped' || status === 'pending') && <Clock size={14} />}
                    </div>
                    <div className={styles.stepBody}>
                      <div className={styles.stepRow}>
                        <div className={styles.stepContent}>
                          <div className={styles.stepText}>
                            <span className={styles.stepKeyword}>{step.keyword}</span>
                            {step.name}
                          </div>
                          <div className={styles.stepDuration}>{formatDuration(durationMs)}</div>
                        </div>
                        {imgEmbeddings.length > 0 && (
                          <button
                            className={`${styles.stepScreenshot} ${status === 'failed' ? styles.stepScreenshotFail : ''}`}
                            onClick={() => setScreenshotModal(`data:${imgEmbeddings[0].mime_type};base64,${imgEmbeddings[0].data}`)}
                          >
                            <Image size={12} /> screenshot
                          </button>
                        )}
                      </div>
                      {status === 'failed' && step.result.error_message && (
                        <pre className={styles.stepError}>{step.result.error_message.substring(0, 400)}</pre>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Test Recording */}
          {scenarioVideos?.app && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><Video size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Test Recording</h2>
              <div className={styles.videoWrap}>
                <div className={styles.videoBlock}>
                  <div className={styles.videoLabel}>App</div>
                  <video
                    className={styles.videoPlayer}
                    src={`/reports/runs/${resolvedRunId}/videos/${scenarioVideos.app}`}
                    controls
                    preload="metadata"
                  />
                </div>
                {scenarioVideos.yopmail && yopmailVideoOk && (
                  <div className={styles.videoBlock}>
                    <div className={styles.videoLabel}>Yopmail</div>
                    <video
                      className={styles.videoPlayer}
                      src={`/reports/runs/${resolvedRunId}/videos/${scenarioVideos.yopmail}`}
                      controls
                      preload="metadata"
                      onError={() => setYopmailVideoOk(false)}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Token Usage */}
          {scenarioTokens && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><Coins size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />AI Token Usage</h2>
              <div className={styles.tokenRow}>
                <div className={styles.tokenCard}>
                  <div className={styles.tokenVal}>{scenarioTokens.inputTokens.toLocaleString()}</div>
                  <div className={styles.tokenLabel}>Input tokens</div>
                </div>
                <div className={styles.tokenCard}>
                  <div className={styles.tokenVal}>{scenarioTokens.outputTokens.toLocaleString()}</div>
                  <div className={styles.tokenLabel}>Output tokens</div>
                </div>
                <div className={`${styles.tokenCard} ${styles.tokenCardTotal}`}>
                  <div className={styles.tokenVal}>{scenarioTokens.totalTokens.toLocaleString()}</div>
                  <div className={styles.tokenLabel}>Total tokens</div>
                </div>
              </div>
            </section>
          )}

          {/* Developer Suggestions — heuristic-based, from failureCapture.ts */}
          {isFailed && failure?.developerSuggestions && failure.developerSuggestions.length > 0 && (
            <section className={styles.devSugSection}>
              <div className={styles.devSugHeader}>
                <Code2 size={15} style={{ color: '#0ea5e9' }} />
                <span className={styles.devSugTitle}>Developer Suggestions</span>
                <span className={styles.devSugBadge}>Auto-detected from error pattern</span>
              </div>

              {failure.failureExplanation?.whereItFailed && (
                <div className={styles.devSugFile}>
                  <MapPin size={11} />
                  <span>Step location:</span>
                  <code className={styles.fileChip}>{failure.failureExplanation.whereItFailed}</code>
                </div>
              )}

              {failure.failureExplanation?.whyItHappened && (
                <div className={styles.devSugReason}>
                  {failure.failureExplanation.whyItHappened}
                </div>
              )}

              <ol className={styles.devSugList}>
                {failure.developerSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          {/* AI Failure Analysis — only shown for failed scenarios */}
          {isFailed && (richAI || failure) && (
            <section className={styles.aiFailureSection}>

              {/* Header */}
              <div className={styles.aiHeader}>
                <div className={styles.aiHeaderLeft}>
                  <Brain size={16} style={{ color: '#7c3aed' }} />
                  <span className={styles.aiHeaderTitle}>AI Failure Analysis</span>
                </div>
                <div className={styles.aiHeaderBadges}>
                  {richAI?.type && (
                    <span className={`${styles.typeBadge} ${typeBadgeClass(richAI.type)}`}>
                      {typeLabel(richAI.type)}
                    </span>
                  )}
                  {(richAI?.severity || failure?.aiAnalysis?.severity) && (
                    <span className={`${styles.severityPill} ${styles[`sev_${sevLower}`]}`}>
                      {(richAI?.severity ?? failure?.aiAnalysis?.severity ?? 'HIGH').toUpperCase()} severity
                    </span>
                  )}
                  {richAI?.confidence && (
                    <span className={styles.confidencePill}>{richAI.confidence} confidence</span>
                  )}
                </div>
              </div>

              {/* Exact API Failure Banner — from network capture */}
              {failure?.exactApiFailure && (
                <div className={styles.apiFailureBanner}>
                  <div className={styles.apiFailureLabel}>
                    <Terminal size={12} /> EXACT API FAILURE DETECTED
                  </div>
                  <div className={styles.apiFailureRow}>
                    <span className={`${styles.method} ${styles[failure.exactApiFailure.method.toLowerCase()]}`}>
                      {failure.exactApiFailure.method}
                    </span>
                    <span className={styles.apiBannerStatus}>{failure.exactApiFailure.status}</span>
                    <span className={styles.apiBannerUrl}>{failure.exactApiFailure.url}</span>
                  </div>
                  <div className={styles.apiBannerResponse}>
                    Response: {failure.exactApiFailure.responseMessage}
                  </div>
                  <details className={styles.curlDetails}>
                    <summary>View cURL command</summary>
                    <pre className={styles.curlCode}>{failure.exactApiFailure.curlCommand}</pre>
                  </details>
                </div>
              )}

              {/* Analysis Sections */}
              <div className={styles.aiSections}>

                {/* What Happened */}
                {(richAI?.what_happened || richAI?.whatHappened || failure?.aiAnalysis?.whatHappened) && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><AlertCircle size={12} /> WHAT HAPPENED</div>
                    <p className={styles.aiSectionText}>
                      {richAI?.what_happened || richAI?.whatHappened || failure?.aiAnalysis?.whatHappened}
                    </p>
                  </div>
                )}

                {/* Root Cause */}
                {(richAI?.root_cause || richAI?.rootCause || failure?.aiAnalysis?.rootCause) && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><MapPin size={12} /> ROOT CAUSE</div>
                    <p className={styles.aiSectionText}>
                      {richAI?.root_cause || richAI?.rootCause || failure?.aiAnalysis?.rootCause}
                    </p>
                  </div>
                )}

                {/* Where to Look */}
                {richAI?.where_to_look && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><Lightbulb size={12} /> WHERE TO LOOK</div>
                    <p className={styles.aiSectionText}>{richAI.where_to_look}</p>
                  </div>
                )}

                {/* How to Fix */}
                {(richAI?.how_to_fix || (richAI?.developerSuggestions?.length ?? 0) > 0 || (failure?.aiAnalysis?.developerSuggestions?.length ?? 0) > 0) && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><Wrench size={12} /> HOW TO FIX</div>
                    {richAI?.how_to_fix ? (
                      <ol className={styles.aiFixList}>
                        {splitNumberedText(richAI.how_to_fix).map((s, i) => (
                          <li key={i}>{s.replace(/^\d+\.\s*/, '')}</li>
                        ))}
                      </ol>
                    ) : (
                      <ol className={styles.aiFixList}>
                        {(richAI?.developerSuggestions ?? failure?.aiAnalysis?.developerSuggestions ?? []).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {/* Code Hint */}
                {richAI?.code_hint && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><Code2 size={12} /> CODE HINT</div>
                    <p className={styles.aiSectionText}>{richAI.code_hint}</p>
                  </div>
                )}

                {/* Prevention */}
                {richAI?.prevention && (
                  <div className={styles.aiSection}>
                    <div className={styles.aiSectionLabel}><ShieldCheck size={12} /> PREVENTION</div>
                    <ol className={styles.aiFixList}>
                      {splitNumberedText(richAI.prevention).map((s, i) => (
                        <li key={i}>{s.replace(/^\d+\.\s*/, '')}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Expected vs Actual */}
                {(failure?.expectedResult || failure?.actualResult) && (
                  <div className={styles.resultGrid}>
                    <div className={styles.resultBox}>
                      <div className={styles.resultLabel}>Expected</div>
                      <div className={styles.resultText}>{failure.expectedResult}</div>
                    </div>
                    <div className={styles.resultBox}>
                      <div className={styles.resultLabel}>Actual</div>
                      <div className={styles.resultText} style={{ color: 'var(--fail)' }}>{failure.actualResult}</div>
                    </div>
                  </div>
                )}

                {/* Error trace from failed step */}
                {visibleSteps.filter(s => s.result.status === 'failed').map((s, i) =>
                  s.result.error_message ? (
                    <div key={i} className={styles.aiSection}>
                      <div className={styles.aiSectionLabel}><ShieldAlert size={12} /> ERROR TRACE</div>
                      <pre className={styles.errorTrace}>{s.result.error_message}</pre>
                    </div>
                  ) : null
                )}
              </div>

              {/* Suggested Ticket */}
              {(richAI?.ticket_worthy || failure) && (
                <div className={styles.suggestedTicket}>
                  <div className={styles.ticketLabel}><Ticket size={13} /> Suggested Ticket</div>
                  <div className={styles.ticketTitle}>
                    {richAI?.ticket_title
                      || (failure?.exactApiFailure
                          ? `API ${failure.exactApiFailure.status} Error: ${scenario.name} — ${failure.exactApiFailure.responseMessage?.substring(0, 60)}`
                          : `${scenario.name} — ${scenario.feature}`)
                    }
                  </div>
                  <div className={styles.ticketBtns}>
                    <button className={styles.jiraBtn}><Ticket size={13} /> Create Jira Ticket</button>
                    <button className={styles.githubBtn}><GitBranch size={13} /> Create GitHub Issue</button>
                  </div>
                </div>
              )}

              {/* Token usage */}
              {(richAI?.tokenUsage || failure?.aiAnalysis?.tokenUsage) && (
                <div className={styles.aiTokens}>
                  <Brain size={10} />
                  {(() => {
                    const u = richAI?.tokenUsage ?? failure?.aiAnalysis?.tokenUsage
                    return `${u?.inputTokens ?? 0} in · ${u?.outputTokens ?? 0} out · ${u?.totalTokens ?? 0} total tokens`
                  })()}
                </div>
              )}
            </section>
          )}

        </div>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sideCard}>
            <div className={styles.sideTitle}>Run Info</div>
            <div className={styles.sideRow}>
              <span>Run ID</span>
              <span className={styles.mono}>#{String(scenario.runId)}</span>
            </div>
            <div className={styles.sideRow}>
              <span>Module</span>
              <span>{mod === 'auth' ? 'Auth' : 'Project'}</span>
            </div>
            <div className={styles.sideRow}>
              <span>Duration</span>
              <span>{formatDuration(scenario.durationMs)}</span>
            </div>
            <div className={styles.sideRow}>
              <span>Steps</span>
              <span>{scenario.stepsPassed} passed{scenario.stepsFailed > 0 ? `, ${scenario.stepsFailed} failed` : ''}</span>
            </div>
          </div>

          {isFailed && (richAI?.severity || failure?.aiAnalysis?.severity) && (
            <div className={`${styles.sideCard} ${styles.sideCardFail}`}>
              <div className={styles.sideTitle}>Severity</div>
              <div className={styles.severityBadge} data-level={sevLower}>
                {(richAI?.severity ?? failure?.aiAnalysis?.severity ?? 'UNKNOWN').toUpperCase()}
              </div>
              {richAI?.confidence && (
                <div className={styles.sideRow} style={{ marginTop: 10 }}>
                  <span>Confidence</span>
                  <span style={{ fontWeight: 700 }}>{richAI.confidence}</span>
                </div>
              )}
              {richAI?.type && (
                <div className={styles.sideRow}>
                  <span>Type</span>
                  <span style={{ fontWeight: 700, fontSize: 11 }}>{typeLabel(richAI.type)}</span>
                </div>
              )}
            </div>
          )}

          {richAI?.ticket_worthy && (
            <div className={styles.sideCard} style={{ borderLeft: '3px solid var(--pass)' }}>
              <div className={styles.sideTitle}>Ticket</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.4 }}>
                {richAI.ticket_title?.substring(0, 80)}...
              </div>
              <button className={styles.jiraBtn} style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}>
                <Ticket size={12} /> Create Jira
              </button>
              <button className={styles.githubBtn} style={{ width: '100%', justifyContent: 'center' }}>
                <GitBranch size={12} /> GitHub Issue
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

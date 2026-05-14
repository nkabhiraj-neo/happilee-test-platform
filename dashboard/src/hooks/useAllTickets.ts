import { useState, useEffect } from 'react'

export interface TicketEntry {
  mlrTag: string | null
  runId: string | number | null
  scenarioName: string
  module: string
  failedAt: string
  errorSummary: string
  jira: {
    key: string
    url: string
    title: string
    status: string
    priority: string
    type: string
    assignee: string | null
    createdAt: string
  } | null
  github: {
    number: number
    url: string
    title: string
    status: string
    assignee: string | null
    createdAt: string
  } | null
}

export function useAllTickets() {
  const [data, setData] = useState<TicketEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // 1. Load static seed (has scenario/MLR linkage)
      let seed: TicketEntry[] = []
      try {
        const r = await fetch('/reports/all-tickets.json')
        if (r.ok) seed = await r.json()
      } catch {}

      if (!cancelled) setData(seed)

      // 2. Fetch live Jira tickets (POST /api/jira/search/jql)
      let liveJira: Array<{ key: string; status: string; priority: string; title: string; assignee: string | null; createdAt: string }> = []
      try {
        const r = await fetch('/api/jira/search/jql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jql: 'project=BUG ORDER BY created DESC',
            maxResults: 50,
            fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'created'],
          }),
        })
        if (r.ok) {
          const d = await r.json()
          liveJira = (d.issues || []).map((i: any) => ({
            key: i.key,
            title: i.fields?.summary ?? '',
            status: i.fields?.status?.name ?? 'To Do',
            priority: i.fields?.priority?.name ?? 'Medium',
            assignee: i.fields?.assignee?.displayName ?? null,
            createdAt: i.fields?.created ?? new Date().toISOString(),
          }))
        }
      } catch {}

      // 3. Fetch live GitHub issues
      let liveGithub: Array<{ number: number; title: string; status: string; assignee: string | null; createdAt: string }> = []
      try {
        const r = await fetch('/api/github/repos/nkabhiraj-neo/happilee-test-platform/issues?state=all&per_page=50')
        if (r.ok) {
          const d = await r.json()
          liveGithub = (d || []).map((i: any) => ({
            number: i.number,
            title: i.title ?? '',
            status: i.state ?? 'open',
            assignee: i.assignee?.login ?? null,
            createdAt: i.created_at ?? new Date().toISOString(),
          }))
        }
      } catch {}

      if (cancelled) return

      // 4. Merge: update status from live data, add any new tickets not in seed
      const merged = [...seed]

      // Update existing entries with live status
      for (const entry of merged) {
        if (entry.jira) {
          const live = liveJira.find(j => j.key === entry.jira!.key)
          if (live) {
            entry.jira.status = live.status
            entry.jira.priority = live.priority
            entry.jira.assignee = live.assignee
          }
        }
        if (entry.github) {
          const live = liveGithub.find(g => g.number === entry.github!.number)
          if (live) entry.github.status = live.status
        }
      }

      // Add live Jira tickets not already in seed
      for (const live of liveJira) {
        const exists = merged.some(e => e.jira?.key === live.key)
        if (!exists) {
          merged.push({
            mlrTag: null,
            runId: null,
            scenarioName: live.title.replace(/^\[.*?\]\s*/, ''),
            module: 'unknown',
            failedAt: live.createdAt,
            errorSummary: '',
            jira: {
              key: live.key,
              url: `https://neoito-team-abhiraj.atlassian.net/browse/${live.key}`,
              title: live.title,
              status: live.status,
              priority: live.priority,
              type: 'Bug',
              assignee: live.assignee,
              createdAt: live.createdAt,
            },
            github: null,
          })
        }
      }

      // Add live GitHub issues not already in seed
      for (const live of liveGithub) {
        const exists = merged.some(e => e.github?.number === live.number)
        if (!exists) {
          merged.push({
            mlrTag: null,
            runId: null,
            scenarioName: live.title.replace(/^\[.*?\]\s*/, ''),
            module: 'unknown',
            failedAt: live.createdAt,
            errorSummary: '',
            jira: null,
            github: {
              number: live.number,
              url: `https://github.com/nkabhiraj-neo/happilee-test-platform/issues/${live.number}`,
              title: live.title,
              status: live.status,
              assignee: live.assignee,
              createdAt: live.createdAt,
            },
          })
        }
      }

      setData(merged)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}

import { useEffect, useState } from 'react'
import type { ModuleName, RunSummary } from '../types'

export interface ModuleRunSummary {
  runId: string | number
  timestamp: string
  passed: number
  failed: number
  total: number
  loaded: boolean
}

function extractCounts(json: any): { passed: number; failed: number; total: number } {
  let passed = 0, failed = 0, total = 0
  for (const feature of json.features ?? []) {
    for (const el of feature.elements ?? []) {
      const steps = (el.steps ?? []).filter((s: any) => !s.hidden)
      const hasFail = steps.some((s: any) => s.result?.status === 'failed')
      total++
      if (hasFail) failed++; else passed++
    }
  }
  return { passed, failed, total }
}

export function useModuleRunSummaries(runs: RunSummary[], module: ModuleName) {
  const [summaries, setSummaries] = useState<Map<string | number, ModuleRunSummary>>(new Map())

  useEffect(() => {
    if (!runs.length) return
    setSummaries(new Map())

    const fileName = module === 'auth' ? '_hap_fe_auth.json' : '_hap_fe_project.json'

    // load runs in batches of 5 to avoid hammering the server
    const batchSize = 5
    let cancelled = false

    async function loadAll() {
      for (let i = 0; i < runs.length; i += batchSize) {
        if (cancelled) break
        const batch = runs.slice(i, i + batchSize)
        await Promise.all(batch.map(async (r) => {
          try {
            const res = await fetch(`/reports/runs/${r.id}/${fileName}`)
            if (!res.ok) throw new Error('not found')
            const json = await res.json()
            const counts = extractCounts(json)
            if (!cancelled) {
              setSummaries(prev => new Map(prev).set(r.id, {
                runId: r.id,
                timestamp: r.timestamp,
                ...counts,
                loaded: true,
              }))
            }
          } catch {
            if (!cancelled) {
              setSummaries(prev => new Map(prev).set(r.id, {
                runId: r.id,
                timestamp: r.timestamp,
                passed: 0, failed: 0, total: 0,
                loaded: true,
              }))
            }
          }
        }))
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [runs, module])

  return summaries
}

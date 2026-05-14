import { useEffect, useState } from 'react'
import type { ModuleReport, ScenarioRow, ModuleName } from '../types'

function extractScenarios(report: ModuleReport, module: ModuleName): ScenarioRow[] {
  const rows: ScenarioRow[] = []
  for (const feature of report.features) {
    for (const el of feature.elements) {
      const visibleSteps = el.steps.filter(s => !s.hidden)
      const passed = visibleSteps.filter(s => s.result.status === 'passed').length
      const failed = visibleSteps.filter(s => s.result.status === 'failed').length
      const totalDuration = visibleSteps.reduce((acc, s) => acc + (s.result.duration || 0), 0)

      let status: 'passed' | 'failed' | 'skipped' = 'passed'
      if (failed > 0) status = 'failed'
      else if (visibleSteps.every(s => s.result.status === 'skipped')) status = 'skipped'

      const mlrTag = (el.tags ?? [])
        .map((t: { name: string }) => t.name.replace('@', ''))
        .find((t: string) => t.startsWith('MLR-'))

      rows.push({
        id: el.id,
        name: el.name,
        feature: feature.name || feature.description?.split('\n')[0]?.trim() || 'Feature',
        status,
        durationMs: Math.round(totalDuration / 1_000_000),
        stepsTotal: visibleSteps.length,
        stepsPassed: passed,
        stepsFailed: failed,
        module,
        runId: report._meta.runId,
        mlrTag,
      })
    }
  }
  return rows
}

export function useModuleReport(runId: string | number | null, module: ModuleName) {
  const [data, setData] = useState<ScenarioRow[]>([])
  const [raw, setRaw] = useState<ModuleReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (runId === null || runId === undefined) return
    const fileName = module === 'auth' ? '_hap_fe_auth.json' : '_hap_fe_project.json'
    fetch(`/reports/runs/${runId}/${fileName}`)
      .then(r => r.json())
      .then((d: ModuleReport) => {
        setRaw(d)
        setData(extractScenarios(d, module))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [runId, module])

  return { data, raw, loading }
}

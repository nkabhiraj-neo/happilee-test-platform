import { useState, useEffect } from 'react'
import type { RunTickets, ScenarioTickets } from '../types'

export function useRunTickets(runId: string | number | null) {
  const [data, setData] = useState<RunTickets | null>(null)

  useEffect(() => {
    if (!runId) return
    fetch(`/reports/runs/${runId}/tickets.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
  }, [runId])

  function getTickets(mlrTag?: string): ScenarioTickets | null {
    if (!mlrTag || !data) return null
    return data.tickets?.[mlrTag] ?? null
  }

  return { data, getTickets }
}

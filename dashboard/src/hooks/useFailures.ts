import { useEffect, useState } from 'react'
import type { FailureSummary } from '../types'

export function useFailures() {
  const [data, setData] = useState<FailureSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/reports/failures/last-run/summary.json')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}

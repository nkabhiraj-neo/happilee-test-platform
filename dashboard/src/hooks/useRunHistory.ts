import { useEffect, useState } from 'react'
import type { RunSummary } from '../types'

export function useRunHistory() {
  const [data, setData] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}reports/run-history.json`)
      .then(r => r.json())
      .then((d: RunSummary[]) => setData([...d].reverse()))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}

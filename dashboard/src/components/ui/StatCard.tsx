import type { ReactNode } from 'react'
import styles from './StatCard.module.css'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  accent?: 'green' | 'blue' | 'red' | 'amber' | 'purple'
  trend?: { value: number; label: string }
}

const accentMap = {
  green: '#25D366',
  blue: '#6366f1',
  red: '#ef4444',
  amber: '#f59e0b',
  purple: '#8b5cf6',
}

export function StatCard({ label, value, sub, icon, accent = 'blue', trend }: Props) {
  const color = accentMap[accent]
  return (
    <div className={styles.card} style={{ '--accent': color } as React.CSSProperties}>
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={styles.value}>{value}</div>
        {sub && <div className={styles.sub}>{sub}</div>}
      </div>
      {trend && (
        <div className={`${styles.trend} ${trend.value >= 0 ? styles.trendUp : styles.trendDown}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  )
}

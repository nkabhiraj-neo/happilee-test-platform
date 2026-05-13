import styles from './Badge.module.css'

interface Props {
  status: 'passed' | 'failed' | 'skipped' | 'pending'
  size?: 'sm' | 'md'
}

const labels = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' }

export function Badge({ status, size = 'md' }: Props) {
  return (
    <span className={`${styles.badge} ${styles[status]} ${size === 'sm' ? styles.sm : ''}`}>
      <span className={styles.dot} />
      {labels[status]}
    </span>
  )
}

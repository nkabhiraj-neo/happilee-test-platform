import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  const jiraBase = env.JIRA_BASE_URL || 'https://neoito-team-abhiraj.atlassian.net'
  const jiraAuth = Buffer.from(`${env.JIRA_EMAIL || ''}:${env.JIRA_API_TOKEN || ''}`).toString('base64')
  const githubToken = env.GITHUB_TOKEN || ''

  return {
    plugins: [react()],
    server: {
      port: 5200,
      fs: { allow: ['..'] },
      proxy: {
        '/api/jira': {
          target: jiraBase,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/jira/, '/rest/api/3'),
          headers: {
            Authorization: `Basic ${jiraAuth}`,
            Accept: 'application/json',
          },
        },
        '/api/github': {
          target: 'https://api.github.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/github/, ''),
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'happilee-test-platform',
          },
        },
      },
    },
    publicDir: command === 'serve' ? '../docs' : false,
    build: {
      outDir: '../docs',
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})

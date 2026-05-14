import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { TestsPage } from './pages/TestsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { TestDetailPage } from './pages/TestDetailPage'
import { IntegrationsPage } from './pages/IntegrationsPage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tests/:module" element={<TestsPage />} />
          <Route path="tests/:module/run/:runId" element={<RunDetailPage />} />
          <Route path="tests/:module/run/:runId/scenario/:scenarioId" element={<TestDetailPage />} />
          <Route path="integrations/:type" element={<IntegrationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

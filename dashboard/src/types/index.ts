export interface RunSummary {
  id: string | number
  timestamp: string
  label?: string
  totalScenarios: number
  passedScenarios: number
  failedScenarios: number
}

export interface StepResult {
  index: number
  keyword: string
  text: string
  status: 'passed' | 'failed' | 'skipped' | 'pending'
  durationMs: number
  hasScreenshot: boolean
}

export interface AIAnalysis {
  whatHappened: string
  rootCause: string
  developerSuggestions: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

/** Rich AI analysis injected by post-run-sync.mjs directly into Cucumber JSON */
export interface RichAIAnalysis {
  type?: string            // "REAL_BUG" | "ENVIRONMENT_ISSUE" | "TEST_ISSUE"
  confidence?: string      // "HIGH" | "MEDIUM" | "LOW"
  severity?: string        // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  headline?: string
  what_happened?: string
  root_cause?: string
  where_to_look?: string
  how_to_fix?: string
  code_hint?: string | null
  prevention?: string
  ticket_worthy?: boolean
  ticket_title?: string
  ticket_body?: string
  is_app_bug?: boolean
  app_component?: string | null
  // Legacy compat
  whatHappened?: string
  rootCause?: string
  developerSuggestions?: string[]
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export interface ExactApiFailure {
  method: string
  status: number
  url: string
  responseMessage: string
  curlCommand: string
}

export interface FailureRecord {
  scenarioName: string
  uri: string
  failedAt: string
  error: { message: string; fullMessage: string }
  screenshotRelative: string | null
  aiAnalysis: AIAnalysis
  failedStepText: string
  exactApiFailure: ExactApiFailure | null
  expectedResult: string
  actualResult: string
  stepTimeline: StepResult[]
  /** Heuristic analysis from failureCapture.ts — has exact file:line from stack trace */
  failureExplanation?: {
    whatHappened: string
    whyItHappened: string
    whereItFailed: string   // exact file:line extracted from stack trace
  }
  /** Heuristic developer suggestions from failureCapture.ts (before AI enhancement) */
  developerSuggestions?: string[]
}

export interface FailureSummary {
  generatedAt: string
  failures: FailureRecord[]
  aiTokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export interface CucumberStep {
  keyword: string
  name: string
  line: number
  result: { status: string; duration: number; error_message?: string }
  embeddings?: Array<{ data: string; mime_type: string }>
  hidden?: boolean
}

export interface CucumberScenario {
  id: string
  name: string
  keyword: string
  line: number
  description: string
  steps: CucumberStep[]
  tags?: Array<{ name: string }>
  aiAnalysis?: RichAIAnalysis
}

export interface CucumberFeature {
  id?: string
  name?: string
  description: string
  elements: CucumberScenario[]
  tags?: Array<{ name: string }>
}

export interface ModuleReport {
  _meta: { generatedAt: string; runId: string | number; version: string | number; module: string }
  features: CucumberFeature[]
}

export interface SessionUsage {
  runId: string | number
  generatedAt: string
  sessionStartedAt: string
  tokenUsage: {
    pipeline: { inputTokens: number; outputTokens: number; totalTokens: number }
    grandTotal: { inputTokens: number; outputTokens: number; totalTokens: number }
  }
}

export type ModuleName = 'auth' | 'project'

export interface ScenarioRow {
  id: string
  name: string
  feature: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  stepsTotal: number
  stepsPassed: number
  stepsFailed: number
  module: ModuleName
  runId: string | number
}

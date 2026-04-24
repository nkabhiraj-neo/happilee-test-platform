// sync-jira.ts
// Run: npm run sync:jira
// Reads credentials from .env in project root

import * as fs from 'fs';
import * as path from 'path';

// Load .env manually (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No .env file found at', envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://neoito-team-abhiraj.atlassian.net';
const JIRA_EMAIL    = process.env.JIRA_EMAIL    || '';
const JIRA_TOKEN    = process.env.JIRA_API_TOKEN || '';
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'BUG';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'hyremaster/happilee-test-platform';

// Module map — maps ticket text to your actual pages and API areas
const MODULE_MAP: Record<string, { page: string; apiArea: string; testArea: string }> = {
  leads:       { page: 'src/pages/Leads',      apiArea: '/ops/leads/',                testArea: 'leads filters and listing'       },
  clients:     { page: 'src/pages/Clients',     apiArea: '/ops/clients/',              testArea: 'clients filters and listing'     },
  partners:    { page: 'src/pages/Partners',    apiArea: '/ops/partners/',             testArea: 'partners filters and listing'    },
  invoices:    { page: 'src/pages/Invoices',    apiArea: '/ops/invoices/',             testArea: 'invoices filters and listing'    },
  assignments: { page: 'src/pages/Assignments', apiArea: '/ops/leads/',                testArea: 'assignments filters and listing' },
  dashboard:   { page: 'src/pages/Dashboard',   apiArea: '/ops/analytics/',            testArea: 'dashboard analytics'             },
  auth:        { page: 'src/pages/Login',       apiArea: '/api/login/',                testArea: 'authentication flow'             },
  filters:     { page: 'src/pages/Leads',       apiArea: '/ops/leads/filter-options/', testArea: 'filters across all pages'        },
  login:       { page: 'src/pages/Login',       apiArea: '/api/login/',                testArea: 'login and authentication'        },
  signup:      { page: 'src/pages/Signup',      apiArea: '/ops/signup/',               testArea: 'signup flow'                     },
  invoice:     { page: 'src/pages/Invoices',    apiArea: '/ops/invoices/',             testArea: 'invoice management'              },
  user:        { page: 'src/pages/AccessControl', apiArea: '/ops/users/',              testArea: 'user management'                 },
};

async function fetchJiraTickets() {
  const jql = `project = ${JIRA_PROJECT_KEY} AND statusCategory != Done ORDER BY updated DESC`;
  const url  = `${JIRA_BASE_URL}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,description,labels,components,priority,status,assignee`;

  console.log('Connecting to:', JIRA_BASE_URL);

  const res = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64'),
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API error ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  return data.issues;
}

function jiraAuthHeaders(contentTypeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64'),
    'Accept': 'application/json',
  };
  if (contentTypeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function buildAdfFromLines(lines: string[]) {
  return {
    type: 'doc',
    version: 1,
    content: lines
      .filter((line) => String(line).trim().length > 0)
      .map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: String(line).slice(0, 32000) }],
      })),
  };
}

type ReverseOptions = {
  dryRun: boolean;
  attachFiles: boolean;
};

function parseArgs(): { mode: 'pull' | 'reverse'; options: ReverseOptions } {
  const args = new Set(process.argv.slice(2));
  const reverse = args.has('--reverse') || args.has('--mode=reverse') || args.has('--mode') && process.argv.includes('reverse');
  const dryRun = args.has('--dry-run');
  const noAttach = args.has('--no-attach');
  return {
    mode: reverse ? 'reverse' : 'pull',
    options: { dryRun, attachFiles: !noAttach },
  };
}

// Jira description is Atlassian Document Format (ADF) — extract plain text
function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join('');
  }
  return '';
}

function detectModule(labels: string[], components: string[], summary: string, description: string): string {
  const allText = [...labels, ...components, summary, description].join(' ').toLowerCase();
  for (const key of Object.keys(MODULE_MAP)) {
    if (allText.includes(key)) return key;
  }
  return 'general';
}

function writeTicketFile(issue: any) {
  const key         = issue.key;
  const fields      = issue.fields;
  const summary     = fields.summary || '';
  const priority    = fields.priority?.name || 'Medium';
  const status      = fields.status?.name || 'To Do';
  const assignee    = fields.assignee?.displayName || 'Unassigned';
  const labels      = (fields.labels || []) as string[];
  const components  = ((fields.components || []) as any[]).map((c: any) => c.name);
  const description = extractText(fields.description);

  const moduleName = detectModule(labels, components, summary, description);
  const moduleInfo = MODULE_MAP[moduleName] || { page: 'src/pages', apiArea: '/ops/', testArea: 'general' };

  const content = `# ${key} — ${summary}

## Ticket details
- **Jira URL:** ${JIRA_BASE_URL}/browse/${key}
- **Status:** ${status}
- **Priority:** ${priority}
- **Assignee:** ${assignee}
- **Labels:** ${labels.join(', ') || 'none'}
- **Components:** ${components.join(', ') || 'none'}
- **Module detected:** ${moduleName}

## What is broken
${description.trim() || 'No description provided.'}

## Module info for Cursor
- **Page file:** ${moduleInfo.page}
- **API area:** ${moduleInfo.apiArea}
- **Test area:** ${moduleInfo.testArea}

## Instructions for Cursor
1. Read this ticket carefully — understand what is broken
2. Open \`${moduleInfo.page}\` and read the full component
3. Open \`src/api/\` and find the API calls for \`${moduleInfo.apiArea}\`
4. Open \`src/components/\` and find any filter or related UI components
5. Open \`src/stores/\` and check if there is filter/pagination state
6. Open \`e2e/\` and read any existing tests for this area
7. Based on all of the above — write a Cucumber feature file at:
   \`e2e/features/jira/${key}.feature\`
   tagged \`@${key}\`
   with a bug reproduction scenario AND a happy path scenario
8. Run: npm run test:e2e
9. Analyze the result:
   - Which step failed?
   - What was the exact error?
   - Which file/function caused it?
   - What is the fix?
10. Write the analysis to: \`e2e/reports/analysis/${key}.json\`
`;

  // Write to .cursor/tickets/
  const dir = path.join(process.cwd(), '.cursor', 'tickets');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${key}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✓ .cursor/tickets/${key}.md`);
}

function normalizeGitHubRepo(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed);
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch {
      return '';
    }
  }
  return trimmed.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}

function githubHeaders(contentTypeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (contentTypeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function createGitHubIssue(issue: any) {
  if (!GITHUB_TOKEN) {
    console.log(`  - Skipped GitHub mirror for ${issue.key}: missing GITHUB_TOKEN`);
    return;
  }

  const repo = normalizeGitHubRepo(GITHUB_REPO);
  if (!repo.includes('/')) {
    console.log(`  - Skipped GitHub mirror for ${issue.key}: invalid GITHUB_REPO`);
    return;
  }

  const key = issue.key;
  const fields = issue.fields || {};
  const title = String(fields.summary || '').trim();
  const description = extractText(fields.description);
  const body = `Jira: ${JIRA_BASE_URL}/browse/${key}\n\n${description.trim() || 'No description provided.'}`;

  const listUrl = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;
  const listRes = await fetch(listUrl, { headers: githubHeaders(false) });
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`GitHub list issues failed: ${listRes.status} ${text}`);
  }
  const existing = await listRes.json() as any[];
  const duplicate = existing.find((it: any) => !it.pull_request && String(it.title || '').trim() === title);
  if (duplicate) {
    return;
  }

  const createRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(true),
    body: JSON.stringify({
      title,
      body,
      labels: ['e2e-automation', 'jira-sync'],
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`GitHub create issue failed: ${createRes.status} ${text}`);
  }
  const created = await createRes.json() as any;
  console.log(`  ✓ GitHub Issue created: #${created.number} for ${key}`);
}

function listAnalysisFiles(): string[] {
  const analysisDir = path.join(process.cwd(), 'e2e', 'reports', 'analysis');
  if (!fs.existsSync(analysisDir)) return [];
  return fs.readdirSync(analysisDir)
    .filter((f) => /^BUG-\d+\.json$/i.test(f))
    .map((f) => path.join(analysisDir, f));
}

function readJsonSafe(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function candidateAttachments(ticketKey: string): string[] {
  const files: string[] = [];
  const reportsRoot = path.join(process.cwd(), 'e2e', 'reports');
  const screenshotRoot = path.join(reportsRoot, 'screenshots');
  const failureRoot = path.join(reportsRoot, 'failures', 'last-run');

  if (fs.existsSync(screenshotRoot)) {
    for (const f of fs.readdirSync(screenshotRoot)) {
      if (f.toUpperCase().includes(ticketKey.toUpperCase()) && /\.(png|jpg|jpeg|webp)$/i.test(f)) {
        files.push(path.join(screenshotRoot, f));
      }
    }
  }
  if (fs.existsSync(failureRoot)) {
    for (const f of fs.readdirSync(failureRoot)) {
      // Keep failure artifacts scoped to the same ticket key.
      if (f.toUpperCase().includes(ticketKey.toUpperCase()) && /\.(png|jpg|jpeg|webp|webm)$/i.test(f)) {
        files.push(path.join(failureRoot, f));
      }
    }
  }
  return Array.from(new Set(files));
}

async function jiraCommentIssue(issueKey: string, lines: string[], dryRun: boolean) {
  if (dryRun) {
    console.log(`  [dry-run] comment -> ${issueKey}`);
    return;
  }
  const body = { body: buildAdfFromLines(lines) };
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: jiraAuthHeaders(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Comment failed for ${issueKey}: ${res.status} ${text}`);
  }
}

async function jiraAttachFiles(issueKey: string, files: string[], dryRun: boolean) {
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (dryRun) {
      console.log(`  [dry-run] attach -> ${issueKey}: ${fileName}`);
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('file', new Blob([bytes]), fileName);
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: {
        ...jiraAuthHeaders(false),
        'X-Atlassian-Token': 'no-check',
      },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`  ⚠ attachment failed ${issueKey}/${fileName}: ${res.status} ${text.slice(0, 240)}`);
    } else {
      console.log(`  ✓ attached ${fileName}`);
    }
  }
}

async function reverseSyncToJira(options: ReverseOptions) {
  console.log('\n=== Jira Reverse Sync (local -> Jira) ===\n');
  const files = listAnalysisFiles();
  if (!files.length) {
    console.log('No local analysis files found at e2e/reports/analysis/BUG-*.json');
    return;
  }
  console.log(`Found ${files.length} analysis file(s)\n`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const ticketKey = fileName.replace(/\.json$/i, '').toUpperCase();
    const data = readJsonSafe(filePath);
    if (!data) {
      console.warn(`  ⚠ skipping invalid JSON: ${fileName}`);
      continue;
    }

    const status = String(data.status || 'unknown');
    const summary = String(data.ticketSummary || '(no summary)');
    const failedStep = data.failedStep ? String(data.failedStep) : null;
    const errorMessage = data.errorMessage ? String(data.errorMessage) : null;
    const rootCause = data.rootCause ? String(data.rootCause) : null;
    const suggestedFix = data.suggestedFix ? String(data.suggestedFix) : null;
    const failures = Array.isArray(data.failures) ? data.failures : [];
    const scenarioTotals = typeof data.scenarios === 'object' && data.scenarios !== null ? data.scenarios : null;
    const cmd = String(data.command || 'npm run test:e2e');

    console.log(`- ${ticketKey} (${status})`);
    const lines: string[] = [
      `[Automation reverse sync] ${new Date().toISOString()}`,
      `Ticket: ${ticketKey}`,
      `Summary: ${summary}`,
      `Status from test run: ${status}`,
      `Command: ${cmd}`,
    ];
    if (scenarioTotals && typeof scenarioTotals.total === 'number') {
      lines.push(`Scenarios: total=${scenarioTotals.total}, passed=${scenarioTotals.passed ?? 'n/a'}, failed=${scenarioTotals.failed ?? 'n/a'}`);
    }
    if (failedStep) lines.push(`Failed step: ${failedStep}`);
    if (errorMessage) lines.push(`Error: ${errorMessage.slice(0, 1000)}`);
    if (rootCause) lines.push(`Root cause: ${rootCause.slice(0, 1000)}`);
    if (suggestedFix) lines.push(`Suggested fix: ${suggestedFix.slice(0, 1000)}`);
    if (failures.length) {
      lines.push(`Failure count: ${failures.length}`);
      failures.slice(0, 5).forEach((f: any, idx: number) => {
        lines.push(`  ${idx + 1}. ${String(f.scenario || 'scenario')}`);
        if (f.failedStep) lines.push(`     step: ${String(f.failedStep).slice(0, 400)}`);
        if (f.errorMessage) lines.push(`     error: ${String(f.errorMessage).slice(0, 400)}`);
      });
    }

    try {
      await jiraCommentIssue(ticketKey, lines, options.dryRun);
      if (options.attachFiles) {
        const attachments = candidateAttachments(ticketKey);
        if (attachments.length) {
          await jiraAttachFiles(ticketKey, attachments.slice(0, 8), options.dryRun);
        } else {
          console.log('  (no matching local screenshots/videos found)');
        }
      }
      ok++;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes(' 404 ')) {
        console.warn(`  ⚠ skip ${ticketKey}: issue not found or no browse permission`);
        skipped++;
      } else {
        console.warn(`  ✗ failed ${ticketKey}: ${msg}`);
        failed++;
      }
      continue;
    }
  }

  console.log(`\nReverse sync summary: ok=${ok}, skipped=${skipped}, failed=${failed}`);
  console.log('\n=== Reverse Sync Done ===');
}

async function main() {
  const { mode, options } = parseArgs();
  if (mode === 'reverse') {
    if (!JIRA_EMAIL || !JIRA_TOKEN) {
      console.error('ERROR: Missing JIRA_EMAIL or JIRA_API_TOKEN in .env file');
      process.exit(1);
    }
    await reverseSyncToJira(options);
    return;
  }

  console.log('\n=== Jira Ticket Sync (Jira -> local tickets) ===\n');

  if (!JIRA_EMAIL || !JIRA_TOKEN) {
    console.error('ERROR: Missing JIRA_EMAIL or JIRA_API_TOKEN in .env file');
    process.exit(1);
  }

  console.log(`Email:   ${JIRA_EMAIL}`);
  console.log(`Project: ${JIRA_PROJECT_KEY}`);
  console.log('');

  let issues: any[] = [];
  try {
    issues = await fetchJiraTickets();
  } catch (err: any) {
    console.error('Failed to fetch from Jira:', err.message);
    process.exit(1);
    return;
  }

  if (!issues || issues.length === 0) {
    console.log('No open tickets found in project BUG.');
    return;
  }

  console.log(`Found ${issues.length} open ticket(s):\n`);

  for (const issue of issues) {
    console.log(`  ${issue.key}: ${issue.fields.summary}`);
    writeTicketFile(issue);
    try {
      await createGitHubIssue(issue);
    } catch (err: any) {
      console.log(`  - GitHub mirror failed for ${issue.key}: ${String(err?.message || err)}`);
    }
  }

  console.log('\n=== Done ===');
  console.log('Ticket files written to: .cursor/tickets/');
  console.log('\nNext step — open Cursor and type:');
  console.log('  run test for BUG-5\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
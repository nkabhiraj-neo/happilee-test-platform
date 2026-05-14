# E2E failure report

Generated: 2026-04-30T05:43:42.943Z

## Failures (2)

### 1. Create new project positive

- **When:** 2026-04-30T05:33:23.153Z
- **Feature / URI:** tests\bdd\features\project\project-listing-and-creation.feature
- **Screenshot:** `e2e/reports/failures/last-run/1777527202959-Create-new-project-positive.png`

**Error**
```
locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('h3[aria-label="table-title"]').filter({ hasText: /^Project List$/i }).first() to be visible

    at expectProjectListingVisible (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\support\uiUtils.ts:46:15)
    at ProjectPage.expectProjectListingVisible (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\pages\ProjectPage.ts:36:89)
    at AppWorld.<anonymous> (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\steps\project.steps.ts:78:25)
```

**Developer suggestions**
- Check the project module logs and screenshots.

**Last tracked API URLs (from stubs)**
```json
{}
```

### 2. Project listing refresh

- **When:** 2026-04-30T05:35:32.854Z
- **Feature / URI:** tests\bdd\features\project\project-listing-and-creation.feature
- **Screenshot:** `e2e/reports/failures/last-run/1777527332653-Project-listing-refresh.png`

**Error**
```
locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('h3[aria-label="table-title"]').filter({ hasText: /^Project List$/i }).first() to be visible

    at expectProjectListingVisible (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\support\uiUtils.ts:46:15)
    at ProjectPage.expectProjectListingVisible (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\pages\ProjectPage.ts:36:89)
    at AppWorld.<anonymous> (C:\happilee-test-platform\codebase\_hap_fe_project\tests\bdd\steps\project.steps.ts:116:25)
```

**Developer suggestions**
- Check the project module logs and screenshots.

**Last tracked API URLs (from stubs)**
```json
{}
```

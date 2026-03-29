---
name: e2e-debugging
description: Diagnose and fix Playwright and E2E test failures in this repo. Use when the task involves E2E tests, Playwright failures, browser-side debugging, flaky test triage, extension E2E runs, or deciding whether Playwright MCP is actually needed.
---

# E2E Debugging

Use this skill when working on E2E failures in this repository.

## Workflow

1. Verify the test environment before investigating product logic.
   Check `baseURL`, `webServer`, port, mock flags, and whether `reuseExistingServer` could attach the run to an unrelated local process.

2. Read the failing test and the related implementation before opening a browser.
   Start with the failing spec, the page or component under test, and the mock/default-value source.

3. Classify the failure before choosing tools.
   Use one of these buckets:
   - environment or startup issue
   - stale assertion or outdated product expectation
   - async timing issue
   - real implementation bug

4. Reproduce the smallest failing slice first.
   Prefer a single spec or single test. If needed, add a targeted log or a narrow unit test before running a full suite.

5. Use Playwright MCP only to validate a concrete hypothesis.
   Do not use it as the primary discovery tool. Form a suspicion first, then use MCP to inspect DOM, route state, runtime values, or browser storage.

## Heuristics

- If the observed browser behavior looks inconsistent, suspect the test environment first.
- If the UI works but assertions fail, compare the test expectation with the current product contract before changing implementation.
- If a failure depends on visibility, mount order, or hydration, prefer waiting on the stable container or empty state before waiting on the final interactive node.
- If a default route or default model assertion fails, verify whether the product behavior changed and the test simply fell behind.

## Extension E2E

- Because of sandbox limits, extension E2E should be run with escalated permissions.
- MV3 extension tests must use `channel: 'chromium'`, otherwise Playwright's default headless shell may not start the extension service worker correctly.
- After extension E2E passes, run `pnpm --filter extension build`.

## Output Expectation

When reporting progress on E2E work, state:
- the failure category
- the minimal reproduction command used
- whether the root cause is environment, test expectation, timing, or implementation
- what was changed to make the test reliable

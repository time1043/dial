# Testing

Dial uses [vitest 4](https://vitest.dev) with two **projects**, each matched to a
source-coupling tier so nothing is over- or under-tested.

| Project | Environment | Covers |
| ------- | ----------- | ------ |
| `unit` | node | pure logic with no DOM and no `obsidian` runtime |
| `browser` | playwright/chromium | UI controllers that call Obsidian's `HTMLElement` extensions (`createDiv`, `empty`, `addClass`, ...) |

## Run the tests

```bash
pnpm test          # both projects (chromium required for browser)
pnpm test:unit     # node only — fast, no browser needed
pnpm test:browser  # chromium only
pnpm test:watch    # watch mode
pnpm test:ui       # vitest UI
pnpm test:ci       # tsc --noEmit + full run + coverage (the CI gate)
```

### Browser mode prerequisite

The `browser` project needs a chromium build that matches the installed
`playwright` version. Install it once:

```bash
npx playwright install chromium
```

Without it, `pnpm test:browser` fails with
`Executable doesn't exist at .../chromium-XXXX/chrome-win64/chrome.exe`.

## Coverage

`pnpm test:ci` emits a v8 coverage report to `coverage/` (`text`, `lcov`,
`html`). The `lcov.info` is the artifact consumed by CI coverage reporters.

`coverage.include` lists only modules that have committed tests — extend the
list as coverage grows. A threshold on untested files would gate near 0%, so we
gate the **tested surface** instead (85% lines/functions/statements, 75%
branches on the aggregate). Add a source file to `coverage.include` in
`vitest.config.ts` the moment it has a test.

## Add a test

Pick the project by what the code under test touches:

- **No DOM, no `obsidian` import** → `tests/unit/...` (node env). Example:
  `formatTime`, `parseSrt`, `AbLoopManager`.
- **Uses Obsidian `HTMLElement` extensions** (`createDiv`, `createSpan`,
  `empty`, `addClass`, ...) → `tests/browser/...`. The
  `tests/helpers/obsidian-dom-polyfill.ts` setup file (loaded via the browser
  project's `setupFiles`) patches those methods onto `HTMLElement.prototype`
  so controllers render against a real DOM.
- **Imports from `obsidian` at runtime** (commands, `main`, settings tab,
  `sync-orchestrator`, `vault/paths.resolveMediaPaths`) → mock `obsidian` with
  `tests/helpers/mock-obsidian.ts` (`vi.mock('obsidian', () => mockObsidian())`)
  before importing the code under test. The `obsidian` npm package is
  **types-only** (`main: ""`), so any transitive `import 'obsidian'` explodes
  at runtime without the mock.

Shared sample data lives in `tests/fixtures/` (`sample.srt`, `subtitles.ts`).

## Config notes

- The `@/` alias is declared **per-project** in `vitest.config.ts`: vitest 4
  projects do not inherit root `resolve.alias`. It uses a trailing-slash key
  (`@/`) so it never shadows real scoped packages like `@vitest/...`.
- Browser mode in vitest 4 is enabled with `test.browser.enabled: true` and
  `test.browser.provider: playwright()` (a called factory, not a string — a
  v4 API change).
- Test files are part of `tsconfig.json` (`include`), so `tsc --noEmit`
  type-checks them too. `eslint` lints them via the same project service; the
  `import/no-nodejs-modules` rule (from `eslint-plugin-obsidianmd`, enforcing
  mobile compatibility) is relaxed for `tests/**` and `vitest.config.ts` since
  those run in Node.

## Sandbox caveat

In WorkBuddy's sandboxed shell, `fs.rm` is intercepted by a safe-delete guard.
After a `--coverage` run, vitest's v8 provider cleans its `coverage/.tmp`
staging dir via `fs.rm`, which the guard blocks — you'll see an
`Unhandled Error` referencing `genie-safe-delete`. It is **benign**: the test
run exits 0 and the coverage report is fully written. The cleanup succeeds in
any normal terminal (external PowerShell/cmd) and in CI.

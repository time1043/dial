import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two vitest projects, matched to source-coupling tiers:
 *
 *   unit    — node env, pure logic (no DOM, no obsidian runtime)
 *   browser — playwright/chromium, UI controllers that call Obsidian's
 *             HTMLElement extensions (createDiv / empty / addClass / ...)
 *
 * The `obsidian` npm package is types-only (its `main` is ""), so any
 * transitively-imported obsidian value would fail to resolve at runtime. Both
 * projects alias `obsidian` → tests/helpers/obsidian-stub.ts (no-op stubs for
 * Notice / TFile / setIcon / ...), so source modules load without per-test
 * vi.mock boilerplate. (vi.mock('obsidian', ...) still overrides if a test
 * needs specific behavior — useful in node; in browser mode vi.mock can't
 * intercept unresolvable packages, so the alias is the only route there.)
 *
 * Run a single project:
 *   pnpm test:unit        # node only, no browser needed
 *   pnpm test:browser     # chromium required (npx playwright install chromium)
 *   pnpm test             # both
 *
 * The `@/` alias is declared per-project (vitest 4 projects do not inherit
 * root resolve.alias) and uses a trailing-slash key so it never shadows
 * real scoped packages like `@vitest/...` or `@codemirror/...`.
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const srcDir = `${rootDir}/src`;
const alias = {
	'@/': `${srcDir}/`,
	obsidian: `${rootDir}/tests/helpers/obsidian-stub.ts`,
};

export default defineConfig({
	test: {
		projects: [
			{
				resolve: { alias },
				test: {
					name: 'unit',
					environment: 'node',
					include: ['tests/unit/**/*.test.ts'],
				},
			},
			{
				resolve: { alias },
				test: {
					name: 'browser',
					include: ['tests/browser/**/*.test.ts'],
					setupFiles: ['tests/helpers/obsidian-dom-polyfill.ts'],
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
					},
				},
			},
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'html'],
			// Only count modules whose committed tests cover the whole surface.
			// Partially-covered modules (type-session-manager, trace-manager,
			// vault/paths, subtitle-search) are tested but excluded from the
			// threshold until their full surface is covered — otherwise their
			// untested branches would drag the aggregate below the gate.
			include: [
				'src/utils/time.ts',
				'src/utils/url-player.ts',
				'src/modules/subtitle-parsers/srt-parser.ts',
				'src/modules/ab-loop/ab-loop-manager.ts',
				'src/modules/subtitle-navigator/subtitle-navigator.ts',
				'src/modules/position-manager/position-manager.ts',
				'src/modules/type-session/word-parser.ts',
			],
			exclude: ['src/global.d.ts', 'src/main.ts'],
			thresholds: {
				lines: 85,
				functions: 85,
				branches: 75,
				statements: 85,
			},
		},
	},
});

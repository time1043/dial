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
 * The `obsidian` npm package is types-only (its `main` is ""), so anything
 * that transitively imports from `obsidian` must be mocked. Pure-logic tests
 * import only modules with type-only obsidian dependencies, keeping the node
 * project dependency-free at runtime.
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
const srcDir = path
	.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src')
	.replace(/\\/g, '/');
const alias = { '@/': `${srcDir}/` };

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
			// Only count modules that have committed tests — extend this list
			// as coverage grows. A threshold on untested files would gate at
			// ~0%, so we gate the tested surface instead.
			include: [
				'src/utils/time.ts',
				'src/modules/subtitle-parsers/srt-parser.ts',
				'src/modules/ab-loop/ab-loop-manager.ts',
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

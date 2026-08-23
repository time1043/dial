import obsidianmd from 'eslint-plugin-obsidianmd';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	// Test files and the vitest config run in Node, not the Obsidian
	// renderer, so the obsidianmd "no Node builtins" rule does not apply.
	{
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		rules: {
			'import/no-nodejs-modules': 'off',
		},
	},
	globalIgnores([
		'node_modules',
		'dist',
		'coverage',
		'lcov.info',
		'dial',
		'dial.zip',
		'esbuild.config.mjs',
		'eslint.config.js',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		// Standalone Node CLI tooling (not bundled into the plugin).
		'scripts/*.mjs',
	]),
);

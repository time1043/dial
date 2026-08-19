#!/usr/bin/env node
/* global process */
/**
 * Package the Dial plugin release bundle.
 *
 * Refreshes the `dial/` folder (main.js, manifest.json, styles.css) from the
 * project root and rebuilds `dial.zip` so the archive contains the `dial/`
 * folder itself (extracting yields dial/main.js, dial/manifest.json, ...).
 *
 * Cross-platform: Windows (git bash or cmd) and macOS/Linux. Uses Node `fs`
 * for delete/copy, and shells out to the platform-native zipper for the
 * archive step (PowerShell Compress-Archive on Windows, `zip` on macOS/Linux).
 *
 * Run via: pnpm run package   (builds first, then packages)
 * or:      node scripts/package-release.mjs   (package only, build must be fresh)
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This script lives in <root>/scripts, so the project root is one level up.
const ROOT = resolve(__dirname, '..');
const FILES = ['main.js', 'manifest.json', 'styles.css'];
const DIST_DIR = join(ROOT, 'dial');
const ZIP_PATH = join(ROOT, 'dial.zip');

function log(msg) {
	console.log(`[dial-package] ${msg}`);
}

// 1. Recreate the dial/ folder from scratch so stale files never linger.
if (existsSync(DIST_DIR)) {
	rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });
log(`Recreated dial/`);

// 2. Copy the three release files from the project root into dial/.
for (const f of FILES) {
	const src = join(ROOT, f);
	if (!existsSync(src)) {
		console.error(
			`[dial-package] Missing ${src}. Run "pnpm run build" first to generate main.js.`,
		);
		process.exit(1);
	}
	copyFileSync(src, join(DIST_DIR, f));
	log(`Copied ${f}`);
}

// 3. Remove any stale zip before rebuilding.
if (existsSync(ZIP_PATH)) {
	rmSync(ZIP_PATH, { force: true });
	log('Removed old dial.zip');
}

// 4. Compress the dial/ folder into dial.zip. The archive contains the
//    `dial/` folder itself (so extracting yields dial/main.js etc.),
//    not the loose files at the zip root.
const plat = platform();
if (plat === 'win32') {
	// PowerShell Compress-Archive: -Path dial (cwd = project root) zips the
	// folder, producing dial\main.js etc. inside the archive.
	execSync(
		`powershell.exe -NoProfile -Command "Compress-Archive -Path dial -DestinationPath dial.zip -Force"`,
		{ cwd: ROOT, stdio: 'inherit' },
	);
} else {
	// macOS/Linux: `zip -r` recurses and keeps the dial/ prefix in the archive.
	execSync(`zip -r dial.zip dial`, { cwd: ROOT, stdio: 'inherit' });
}
log(`Created dial.zip`);

// 5. Summary of what was produced.
console.log('\n[dial-package] Done. Release bundle:');
console.log(`  dial/`);
for (const f of readdirSync(DIST_DIR)) {
	const s = statSync(join(DIST_DIR, f));
	console.log(`    ${f}  (${s.size} bytes)`);
}
console.log(`  dial.zip  (${statSync(ZIP_PATH).size} bytes)`);

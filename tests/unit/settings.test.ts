import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, trimTrailingSlash } from '@/settings';

/**
 * `trimTrailingSlash` normalises vault-relative library paths entered in the
 * settings tab so stored paths never end with a slash (unix or windows).
 *
 * `settings.ts` pulls in obsidian values (PluginSettingTab / Setting / ...),
 * which the `unit` project resolves via the obsidian alias stub.
 */
describe('trimTrailingSlash', () => {
	it('strips a single trailing unix slash', () => {
		expect(trimTrailingSlash('_lib/videos/')).toBe('_lib/videos');
	});

	it('strips multiple trailing unix slashes', () => {
		expect(trimTrailingSlash('_lib/videos///')).toBe('_lib/videos');
	});

	it('strips trailing windows backslashes', () => {
		expect(trimTrailingSlash('_lib\\videos\\\\')).toBe('_lib\\videos');
	});

	it('leaves a path without a trailing slash unchanged', () => {
		expect(trimTrailingSlash('_lib/videos')).toBe('_lib/videos');
	});

	it('returns an empty string unchanged', () => {
		expect(trimTrailingSlash('')).toBe('');
	});
});

describe('DEFAULT_SETTINGS', () => {
	it('uses the expected library paths and full volume', () => {
		expect(DEFAULT_SETTINGS).toEqual({
			allFilesOrderMode: 'tree',
			allFilesRoot: 'note/',
			videoLibraryPath: '_lib/videos',
			subtitleLibraryPath: '_lib/subtitles',
			defaultVolume: 1,
			loopMode: 'folder',
			folderOrderMode: 'tree',
			folderLoopDepth: 1,
			autoPlay: true,
		});
	});
});

import { describe, expect, it } from 'vitest';

// `obsidian` is aliased to tests/helpers/obsidian-stub.ts in vitest.config.ts,
// so paths.ts's `import { Notice, TFile } from 'obsidian'` resolves to no-op
// stubs. getFileExtension doesn't touch them.
import { getFileExtension } from '@/vault/paths';

describe('getFileExtension', () => {
	it('returns the extension for a normal filename', () => {
		expect(getFileExtension('video.mp4', '.mp4')).toBe('.mp4');
		expect(getFileExtension('subtitle.srt', '.srt')).toBe('.srt');
	});

	it('uses the last extension for multi-dotted filenames', () => {
		expect(getFileExtension('a.b.c.mp4', '.mp4')).toBe('.mp4');
		expect(getFileExtension('note.tar.gz', '.zip')).toBe('.gz');
	});

	it('falls back when the filename has no dot', () => {
		expect(getFileExtension('noext', '.mp4')).toBe('.mp4');
	});

	it('falls back for a leading-dot file (the dot is at index 0)', () => {
		expect(getFileExtension('.gitignore', '.srt')).toBe('.srt');
	});

	it('falls back for a trailing dot (no characters after the dot)', () => {
		expect(getFileExtension('file.', '.srt')).toBe('.srt');
	});

	it('returns the fallback verbatim for extensionless names (no normalization)', () => {
		expect(getFileExtension('noext', '.MP4')).toBe('.MP4');
		expect(getFileExtension('noext', 'mp4')).toBe('mp4');
	});
});

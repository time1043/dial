import { describe, expect, it } from 'vitest';

import { toEmbedUrl } from '@/utils/url-player';

describe('toEmbedUrl', () => {
	it('returns empty string for empty/whitespace input', () => {
		expect(toEmbedUrl('')).toBe('');
		expect(toEmbedUrl('   ')).toBe('');
	});

	it('returns the trimmed input when it is not a valid URL', () => {
		expect(toEmbedUrl('not a url')).toBe('not a url');
		expect(toEmbedUrl('  also-not-a-url ')).toBe('also-not-a-url');
	});

	it('converts a Bilibili BV watch URL to the embed player', () => {
		const out = toEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD');
		expect(out).toContain('player.bilibili.com/player.html');
		expect(out).toContain('bvid=BV1xx411c7mD');
		expect(out).toContain('autoplay=0');
		expect(out).toContain('danmaku=1');
	});

	it('converts a Bilibili AV watch URL to the embed player using aid', () => {
		const out = toEmbedUrl('https://www.bilibili.com/video/av170001');
		expect(out).toContain('aid=170001');
		expect(out).not.toContain('bvid=');
	});

	it('returns the input unchanged for a Bilibili host with no video path', () => {
		const url = 'https://www.bilibili.com/some/other/path';
		expect(toEmbedUrl(url)).toBe(url);
	});

	it('converts a YouTube watch URL to /embed/', () => {
		expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
			'https://www.youtube.com/embed/dQw4w9WgXcQ',
		);
	});

	it('returns the input unchanged for a YouTube URL without a v parameter', () => {
		const url = 'https://www.youtube.com/feed/trending';
		expect(toEmbedUrl(url)).toBe(url);
	});

	it('converts a youtu.be short URL to /embed/', () => {
		expect(toEmbedUrl('https://youtu.be/abc123XYZ')).toBe(
			'https://www.youtube.com/embed/abc123XYZ',
		);
		expect(toEmbedUrl('https://youtu.be/')).toBe('https://youtu.be/');
	});

	it('returns the input unchanged for unsupported hosts', () => {
		const url = 'https://vimeo.com/12345';
		expect(toEmbedUrl(url)).toBe(url);
	});

	it('matches hosts by suffix (subdomains of supported hosts)', () => {
		const out = toEmbedUrl('https://m.bilibili.com/video/BV1xx411c7mD');
		expect(out).toContain('bvid=BV1xx411c7mD');
	});
});

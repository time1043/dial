import { describe, expect, it } from 'vitest';

import { parseSubtitle } from '@/modules/subtitle-parsers';

/**
 * `subtitle-parsers` decodes raw buffers (BOM detection for UTF-8 / UTF-16LE /
 * UTF-16BE) and dispatches to a format-specific parser by file extension.
 *
 * These are pure (TextDecoder / ArrayBuffer), so they live in the `unit`
 * project (node env) — no DOM, no obsidian runtime.
 */

const SAMPLE_SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello world\n';

function utf8Buffer(s: string): ArrayBuffer {
	return new TextEncoder().encode(s).buffer;
}

function utf8BomBuffer(s: string): ArrayBuffer {
	const body = new TextEncoder().encode(s);
	const out = new Uint8Array(body.length + 3);
	out[0] = 0xef;
	out[1] = 0xbb;
	out[2] = 0xbf;
	out.set(body, 3);
	return out.buffer;
}

function utf16leBuffer(s: string): ArrayBuffer {
	const out = new Uint8Array(s.length * 2 + 2);
	out[0] = 0xff;
	out[1] = 0xfe;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		out[2 + i * 2] = c & 0xff;
		out[3 + i * 2] = (c >> 8) & 0xff;
	}
	return out.buffer;
}

function utf16beBuffer(s: string): ArrayBuffer {
	const out = new Uint8Array(s.length * 2 + 2);
	out[0] = 0xfe;
	out[1] = 0xff;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		out[2 + i * 2] = (c >> 8) & 0xff;
		out[3 + i * 2] = c & 0xff;
	}
	return out.buffer;
}

describe('parseSubtitle — buffer decoding', () => {
	it('decodes a UTF-8 buffer without BOM', () => {
		const subs = parseSubtitle(utf8Buffer(SAMPLE_SRT), 'sub.srt');
		expect(subs).toHaveLength(1);
		expect(subs[0]!.text).toBe('Hello world');
	});

	it('decodes a UTF-8 buffer with BOM', () => {
		const subs = parseSubtitle(utf8BomBuffer(SAMPLE_SRT), 'sub.srt');
		expect(subs).toHaveLength(1);
		expect(subs[0]!.text).toBe('Hello world');
	});

	it('decodes a UTF-16LE buffer (FF FE BOM)', () => {
		const subs = parseSubtitle(utf16leBuffer(SAMPLE_SRT), 'sub.srt');
		expect(subs).toHaveLength(1);
		expect(subs[0]!.text).toBe('Hello world');
	});

	it('decodes a UTF-16BE buffer (FE FF BOM)', () => {
		const subs = parseSubtitle(utf16beBuffer(SAMPLE_SRT), 'sub.srt');
		expect(subs).toHaveLength(1);
		expect(subs[0]!.text).toBe('Hello world');
	});
});

describe('parseSubtitle — extension dispatch', () => {
	it('throws on an unsupported extension', () => {
		const buf = utf8Buffer(SAMPLE_SRT);
		expect(() => parseSubtitle(buf, 'sub.ass')).toThrow(/Unsupported subtitle format: \.ass/);
	});

	it('throws when no parser matches the extension', () => {
		const buf = utf8Buffer(SAMPLE_SRT);
		expect(() => parseSubtitle(buf, 'caption')).toThrow(
			/Unsupported subtitle format: \.caption/,
		);
	});
});

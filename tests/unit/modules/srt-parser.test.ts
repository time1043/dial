import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseSrt } from '@/modules/subtitle-parsers/srt-parser';

import { SAMPLE_SUBTITLES } from '../../fixtures/subtitles';

const sampleSrt = `1
00:00:01,000 --> 00:00:03,230
Hello world

2
00:00:04,000 --> 00:00:06,500
<i>Italic</i> and <b>bold</b>

3
00:00:07,000 --> 00:00:09,000
Line one
Line two

4
00:00:10,000 --> 00:00:11,000

5
00:00:12,000 --> 00:00:14,000
Final cue
`;

describe('parseSrt', () => {
	it('parses all blocks with text, skipping empty cues', () => {
		const subs = parseSrt(sampleSrt);
		expect(subs).toHaveLength(4); // block 4 has no text → skipped
		expect(subs).toEqual(SAMPLE_SUBTITLES);
	});

	it('parses time ranges into seconds with millisecond precision', () => {
		const subs = parseSrt(sampleSrt);
		expect(subs[0]?.start).toBe(1);
		expect(subs[0]?.end).toBeCloseTo(3.23, 5);
		expect(subs[1]?.start).toBe(4);
		expect(subs[1]?.end).toBeCloseTo(6.5, 5);
	});

	it('strips HTML tags from cue text', () => {
		const subs = parseSrt(sampleSrt);
		expect(subs[1]?.text).toBe('Italic and bold');
	});

	it('preserves multi-line cue text as a single string with newline', () => {
		const subs = parseSrt(sampleSrt);
		expect(subs[2]?.text).toBe('Line one\nLine two');
	});

	it('assigns sequential ids starting at 0', () => {
		const subs = parseSrt(sampleSrt);
		expect(subs.map((s) => s.id)).toEqual([0, 1, 2, 3]);
	});

	it('returns an empty array for empty input', () => {
		expect(parseSrt('')).toEqual([]);
	});

	it('parses the on-disk fixture file', () => {
		const fixturePath = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			'..',
			'..',
			'fixtures',
			'sample.srt',
		);
		const content = readFileSync(fixturePath, 'utf-8');
		expect(parseSrt(content)).toEqual(SAMPLE_SUBTITLES);
	});
});

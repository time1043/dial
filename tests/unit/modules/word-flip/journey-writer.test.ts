import { describe, expect, it } from 'vitest';

import type { WordEntry } from '@/modules/word-flip/book-parser';

import {
	buildJourneyAppend,
	buildResumeUrl,
	countEpochs,
	journeyFilePath,
	type JourneySessionRecord,
} from '@/modules/word-flip/journey-writer';

function entry(word: string, meaning = ''): WordEntry {
	return { word, ipa: '', meaning, forms: '' };
}

function record(overrides: Partial<JourneySessionRecord> = {}): JourneySessionRecord {
	return {
		bookPath: '_lib/vocabulary-bucket/cet4.md',
		startIdx: 99,
		minIdx: 99,
		maxIdx: 101,
		startTime: new Date('2026-08-22T10:00:00'),
		endTime: new Date('2026-08-22T10:30:00'),
		words: [
			{ entry: entry('abandon', 'v. 放弃'), marked: true },
			{ entry: entry('benefit'), marked: false },
			{ entry: entry('curious'), marked: false },
		],
		...overrides,
	};
}

describe('journeyFilePath', () => {
	it('maps a book path into the journey folder by file name', () => {
		expect(journeyFilePath('_lib/vocabulary-bucket/cet4.md')).toBe(
			'_lib/vocabulary-journey/cet4.md',
		);
	});
});

describe('buildResumeUrl', () => {
	it('encodes the book path and uses a 1-based index', () => {
		expect(buildResumeUrl('_lib/vocabulary-bucket/cet4.md', 117)).toBe(
			'obsidian://dial?type=word-flip&book=_lib%2Fvocabulary-bucket%2Fcet4.md&index=118',
		);
	});
});

describe('countEpochs', () => {
	it('returns 0 for empty content and finds the highest epoch number', () => {
		expect(countEpochs('')).toBe(0);
		expect(countEpochs('# Epoch 1\n\n## x\n\n# Epoch 3')).toBe(3);
	});
});

describe('buildJourneyAppend', () => {
	it('creates a new file with Epoch 1, session trail and table', () => {
		const content = buildJourneyAppend('', record());
		expect(content).toContain('# Epoch 1');
		expect(content).toContain('## 2026-08-22 10:00 → 10:30 (30min)');
		expect(content).toContain('- ▶ Resume word flip');
		expect(content).toContain(
			`- [Start word: 100](obsidian://dial?type=word-flip` +
				`&book=_lib%2Fvocabulary-bucket%2Fcet4.md&index=100)`,
		);
		expect(content).toContain(
			`- [End word: 102](obsidian://dial?type=word-flip` +
				`&book=_lib%2Fvocabulary-bucket%2Fcet4.md&index=102)`,
		);
		expect(content).toContain('| # | word | ipa | meaning | forms | marked |');
		expect(content).toContain('| 100 | abandon |  | v. 放弃 |  | ★ |');
		expect(content).toContain('| 101 | benefit |  |  |  |  |');
		// No file-level link anymore — every session carries its own.
		expect(content.startsWith('[▶')).toBe(false);
	});

	it('appends a mid-book session under the latest epoch without a new heading', () => {
		const existing = '# Epoch 1\n\n## old session\n\nold table';
		const content = buildJourneyAppend(existing, record());
		expect(content.startsWith(existing.trimEnd())).toBe(true);
		expect(content).not.toContain('# Epoch 2');
		expect(content).toContain('## 2026-08-22 10:00 → 10:30');
	});

	it('records consecutive sessions as separate sections in one file', () => {
		let content = buildJourneyAppend('', record());
		content = buildJourneyAppend(
			content,
			record({
				startIdx: 102,
				minIdx: 102,
				maxIdx: 104,
				startTime: new Date('2026-08-22T11:00:00'),
				endTime: new Date('2026-08-22T11:10:00'),
			}),
		);
		expect(content.match(/^## /gm)).toHaveLength(2);
		expect(content).toContain('## 2026-08-22 10:00 → 10:30 (30min)');
		expect(content).toContain('## 2026-08-22 11:00 → 11:10 (10min)');
		expect(content).toContain('[Start word: 100](');
		expect(content).toContain('[Start word: 103](');
	});

	it('opens Epoch 2 when the session starts at the first word', () => {
		const existing = '# Epoch 1\n\n## old';
		const content = buildJourneyAppend(existing, record({ startIdx: 0, minIdx: 0, maxIdx: 2 }));
		expect(content).toContain('# Epoch 2');
		expect(content).toContain('[Start word: 1](');
		expect(content).toContain('[End word: 3](');
	});

	it('creates Epoch 1 for a mid-book session when the file is new', () => {
		const content = buildJourneyAppend('', record());
		expect(content).toContain('# Epoch 1');
	});

	it('escapes pipes inside cells and formats sub-minute durations as 1min', () => {
		const content = buildJourneyAppend('', {
			...record(),
			endTime: new Date('2026-08-22T10:00:20'),
			words: [{ entry: entry('either', 'conj. 或者 | 或'), marked: false }],
			minIdx: 49,
			maxIdx: 49,
		});
		expect(content).toContain('| 50 | either |  | conj. 或者 \\| 或 |  |  |');
		expect(content).toContain('(1min)');
	});
});

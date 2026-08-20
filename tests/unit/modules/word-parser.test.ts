import { describe, expect, it } from 'vitest';

// `obsidian` is aliased to a no-op stub (see vitest.config.ts); word-parser's
// transitive import of TFile (via type-session-manager) resolves through it.
import type { ParsedWord } from '@/modules/type-session/word-parser';

import { mergePunctuation, parseWords } from '@/modules/type-session/word-parser';

const w = (leading: string, word: string, trailing: string): ParsedWord => ({
	leading,
	word,
	trailing,
});

describe('mergePunctuation', () => {
	it('leaves normal word tokens unchanged', () => {
		const tokens = [w('', 'hello', ','), w('', 'world', '')];
		expect(mergePunctuation(tokens)).toEqual(tokens);
	});

	it('merges a leading all-punctuation token into the following word', () => {
		const tokens = [w('--', '', ''), w('', 'hello', '')];
		expect(mergePunctuation(tokens)).toEqual([w('--', 'hello', '')]);
	});

	it('merges a trailing all-punctuation token into the previous word', () => {
		const tokens = [w('', 'hello', ''), w('...', '', '')];
		expect(mergePunctuation(tokens)).toEqual([w('', 'hello', '...')]);
	});

	it('accumulates consecutive leading punctuation tokens', () => {
		const tokens = [w('--', '', ''), w('..', '', ''), w('', 'hello', '')];
		expect(mergePunctuation(tokens)).toEqual([w('--..', 'hello', '')]);
	});

	it('drops a stray leading-punctuation token with no following word', () => {
		// pendingLeading is set but never attached — the trailing-stray branch
		// only attaches when merged is non-empty, which it is here.
		const tokens = [w('', 'hello', ''), w('!!', '', '')];
		expect(mergePunctuation(tokens)).toEqual([w('', 'hello', '!!')]);
	});
});

describe('parseWords', () => {
	it('parses words with surrounding punctuation', () => {
		expect(parseWords('Hello, world!')).toEqual([w('', 'Hello', ','), w('', 'world', '!')]);
	});

	it('merges leading punctuation onto the first word', () => {
		expect(parseWords('-- hello')).toEqual([w('--', 'hello', '')]);
	});

	it('merges trailing punctuation onto the last word', () => {
		expect(parseWords('hello ...')).toEqual([w('', 'hello', '...')]);
	});

	it('handles contractions and hyphenated words', () => {
		expect(parseWords("don't stop")).toEqual([w('', "don't", ''), w('', 'stop', '')]);
	});

	it('returns an empty array for empty or whitespace-only input', () => {
		expect(parseWords('')).toEqual([]);
		expect(parseWords('   ')).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';

// `obsidian` is aliased to a no-op stub (see vitest.config.ts), so the module's
// `import { TFile } from 'obsidian'` resolves. tokenize/extractPunctuation
// don't touch TFile.
import { extractPunctuation, tokenize } from '@/modules/type-session/type-session-manager';

describe('tokenize', () => {
	it('splits on whitespace and strips surrounding punctuation', () => {
		expect(tokenize('Hello, world!')).toEqual(['Hello', 'world']);
	});

	it('preserves internal hyphens and apostrophes', () => {
		expect(tokenize("don't stop")).toEqual(["don't", 'stop']);
		expect(tokenize('well-known term')).toEqual(['well-known', 'term']);
	});

	it('drops tokens that become empty after stripping', () => {
		expect(tokenize('hello ... world')).toEqual(['hello', 'world']);
	});

	it('returns an empty array for empty or whitespace-only input', () => {
		expect(tokenize('')).toEqual([]);
		expect(tokenize('   ')).toEqual([]);
	});
});

describe('extractPunctuation', () => {
	it('splits a leading-punctuation word', () => {
		expect(extractPunctuation(',hello')).toEqual({ leading: ',', word: 'hello', trailing: '' });
	});

	it('splits a trailing-punctuation word', () => {
		expect(extractPunctuation('hello,')).toEqual({ leading: '', word: 'hello', trailing: ',' });
	});

	it('splits both leading and trailing punctuation', () => {
		expect(extractPunctuation('...hello!')).toEqual({
			leading: '...',
			word: 'hello',
			trailing: '!',
		});
	});

	it('keeps internal apostrophes and hyphens as part of the word', () => {
		expect(extractPunctuation("don't")).toEqual({ leading: '', word: "don't", trailing: '' });
		expect(extractPunctuation('well-known')).toEqual({
			leading: '',
			word: 'well-known',
			trailing: '',
		});
	});

	it('treats an all-punctuation token as having an empty word', () => {
		expect(extractPunctuation('...')).toEqual({ leading: '...', word: '', trailing: '' });
		expect(extractPunctuation('--')).toEqual({ leading: '--', word: '', trailing: '' });
	});
});

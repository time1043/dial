import { describe, expect, it } from 'vitest';

import type { ParsedWordBook } from '@/modules/word-flip/book-parser';

import {
	DEFAULT_VOCABULARY_BUCKET,
	isWordBookPath,
	normalizeBucketPath,
} from '@/modules/word-flip/book-finder';
import { bookDisplayName } from '@/modules/word-flip/book-finder';

describe('normalizeBucketPath', () => {
	it('falls back to the default when empty or slash-only', () => {
		expect(normalizeBucketPath('')).toBe(DEFAULT_VOCABULARY_BUCKET);
		expect(normalizeBucketPath('/')).toBe(DEFAULT_VOCABULARY_BUCKET);
	});

	it('trims whitespace and trailing slashes', () => {
		expect(normalizeBucketPath('  _lib/vocab/  ')).toBe('_lib/vocab');
	});
});

describe('isWordBookPath', () => {
	it('accepts files inside the bucket and rejects others', () => {
		expect(isWordBookPath('_lib/vocabulary-bucket', '_lib/vocabulary-bucket/cet4.md')).toBe(
			true,
		);
		expect(isWordBookPath('_lib/vocabulary-bucket', '_lib/vocabulary-bucket/sub/cet6.md')).toBe(
			true,
		);
		expect(isWordBookPath('_lib/vocabulary-bucket', '_lib/other/cet4.md')).toBe(false);
		// Prefix-only match must not count (the folder itself is not a book).
		expect(isWordBookPath('_lib/vocabulary-bucket', '_lib/vocabulary-bucket-backup/a.md')).toBe(
			false,
		);
	});
});

describe('bookDisplayName', () => {
	it('prefers the frontmatter title and falls back to the file name', () => {
		const withTitle = { title: '四级高频词' } as ParsedWordBook;
		const withoutTitle = { title: null } as ParsedWordBook;
		expect(bookDisplayName('my-book.md', withTitle)).toBe('四级高频词');
		expect(bookDisplayName('my-book.md', withoutTitle)).toBe('my-book');
	});
});

import { describe, expect, it } from 'vitest';

import {
	parseWordBook,
	splitCellLines,
	WORD_ROW_FORMAT_HINT,
} from '@/modules/word-flip/book-parser';

const CANONICAL_BOOK = `---
title: 四级高频词
lang: en-US
---

Some intro prose that must be ignored.

| # | word | ipa | meaning | forms |
| - | ---- | --- | ------- | ----- |
| 1 | abandon | /əˈbændən/ | v. 放弃；抛弃<br>n. 放纵 | 过去式 abandoned<br>过去分词 abandoned |
| 2 | benefit | /ˈbenɪfɪt/ | n. 好处<br>v. 使受益 | 复数 benefits |
| 3 | independent | | adj. 独立的；自主的 | 副词 independently |
`;

describe('parseWordBook', () => {
	it('parses frontmatter title and lang', () => {
		const book = parseWordBook(CANONICAL_BOOK);
		expect(book.title).toBe('四级高频词');
		expect(book.lang).toBe('en-US');
	});

	it('parses rows in file order with positional columns', () => {
		const book = parseWordBook(CANONICAL_BOOK);
		expect(book.words).toHaveLength(3);
		expect(book.words[0]).toEqual({
			word: 'abandon',
			ipa: '/əˈbændən/',
			meaning: 'v. 放弃；抛弃<br>n. 放纵',
			forms: '过去式 abandoned<br>过去分词 abandoned',
		});
		expect(book.words[2]!.word).toBe('independent');
		expect(book.words[2]!.ipa).toBe('');
	});

	it('skips invalid rows with line numbers and keeps valid ones', () => {
		const content = [
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 1 | abandon | | v. 放弃 | |',
			'| 2 |  |  | broken row | |',
			'| 3 | benefit | | n. 好处 | |',
			'',
		].join('\n');
		const book = parseWordBook(content);
		expect(book.words.map((w) => w.word)).toEqual(['abandon', 'benefit']);
		expect(book.invalidRows).toEqual([{ line: 4, reason: 'missing word' }]);
	});

	it('counts # column disagreements with the actual row order', () => {
		const content = [
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 1 | a | | 1 | |',
			'| 3 | b | | 2 | |',
			'| x | c | | 3 | |',
			'| 4 | d | | 4 | |',
		].join('\n');
		const book = parseWordBook(content);
		expect(book.words).toHaveLength(4);
		// "3" (expected 2), "x" (not a number), "4" (expected 4 is fine).
		expect(book.indexColumnMismatches).toBe(2);
	});

	it('tolerates missing trailing cells and escaped pipes', () => {
		const content = [
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 1 | ability | | n. 能力 \\| 技能 | |',
			'| 2 | zoo | | n. 动物园 |',
		].join('\n');
		const book = parseWordBook(content);
		expect(book.words[0]!.meaning).toBe('n. 能力 | 技能');
		expect(book.words[1]!.word).toBe('zoo');
		expect(book.words[1]!.forms).toBe('');
	});

	it('works without frontmatter and merges multiple tables', () => {
		const content = [
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 1 | a | | 1 | |',
			'',
			'prose between tables',
			'',
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 2 | b | | 2 | |',
		].join('\n');
		const book = parseWordBook(content);
		expect(book.title).toBeNull();
		expect(book.lang).toBeNull();
		expect(book.words.map((w) => w.word)).toEqual(['a', 'b']);
	});

	it('handles CRLF line endings', () => {
		const content = [
			'---',
			'title: CR Book',
			'---',
			'',
			'| # | word | ipa | meaning | forms |',
			'| - | ---- | --- | ------- | ----- |',
			'| 1 | a | | 1 | |',
		].join('\r\n');
		const book = parseWordBook(content);
		expect(book.title).toBe('CR Book');
		expect(book.words).toHaveLength(1);
	});

	it('exposes a short format hint for toasts', () => {
		expect(WORD_ROW_FORMAT_HINT).toContain('word');
	});
});

describe('splitCellLines', () => {
	it('splits on <br> variants and drops empties', () => {
		expect(splitCellLines('v. 放弃<br>n. 放纵')).toEqual(['v. 放弃', 'n. 放纵']);
		expect(splitCellLines('a<br/>b<br />c')).toEqual(['a', 'b', 'c']);
		expect(splitCellLines('<br>a<br>')).toEqual(['a']);
	});

	it('returns a single line for plain cells', () => {
		expect(splitCellLines('n. 动物园')).toEqual(['n. 动物园']);
	});
});

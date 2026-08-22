import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WordFlipStore } from '@/modules/word-flip/flip-store';

describe('WordFlipStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts empty and ignores malformed persisted data', () => {
		const store = new WordFlipStore();
		expect(store.getLastBook()).toBeNull();
		store.load('garbage');
		expect(store.getLastBook()).toBeNull();
		store.load({ books: { 'a.md': { lastIndex: 'x', marked: 'nope' } } });
		expect(store.getLastIndex('a.md')).toBe(0);
	});

	it('round-trips last book, position and marks through serialize/load', () => {
		const first = new WordFlipStore();
		first.setLastBook('_lib/vocabulary-bucket/cet4.md');
		first.recordIndex('_lib/vocabulary-bucket/cet4.md', 41);
		first.toggleMark('_lib/vocabulary-bucket/cet4.md', 'abandon');

		const second = new WordFlipStore();
		second.load(first.serialize());
		expect(second.getLastBook()).toBe('_lib/vocabulary-bucket/cet4.md');
		expect(second.getLastIndex('_lib/vocabulary-bucket/cet4.md')).toBe(41);
		expect(second.isMarked('_lib/vocabulary-bucket/cet4.md', 'abandon')).toBe(true);
		expect(second.getMarkedWords('_lib/vocabulary-bucket/cet4.md')).toEqual(['abandon']);
	});

	it('toggles marks on and off', () => {
		const store = new WordFlipStore();
		const path = 'book.md';
		expect(store.toggleMark(path, 'zoo')).toBe(true);
		expect(store.isMarked(path, 'zoo')).toBe(true);
		expect(store.toggleMark(path, 'zoo')).toBe(false);
		expect(store.isMarked(path, 'zoo')).toBe(false);
		expect(store.getMarkedWords(path)).toEqual([]);
	});

	it('debounces persist calls and flush() forces them', () => {
		const persist = vi.fn();
		const store = new WordFlipStore();
		store.setPersistCallback(persist);

		store.recordIndex('book.md', 1);
		store.recordIndex('book.md', 2);
		store.toggleMark('book.md', 'a');
		expect(persist).not.toHaveBeenCalled();

		vi.advanceTimersByTime(600);
		expect(persist).toHaveBeenCalledTimes(1);

		store.recordIndex('book.md', 3);
		store.flush();
		expect(persist).toHaveBeenCalledTimes(2);
	});
});

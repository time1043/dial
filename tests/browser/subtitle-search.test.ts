import { beforeEach, describe, expect, it } from 'vitest';

// `obsidian` is aliased to a no-op stub (see vitest.config.ts), so
// subtitle-search's `import { setIcon } from 'obsidian'` resolves. (vi.mock
// can't intercept the unresolvable types-only package in browser mode — the
// alias is the route that works for both projects.) The obsidian-dom-polyfill
// setup file supplies createDiv / createEl / createSpan / toggleClass / hasClass.
import type { Subtitle } from '@/types';

import { SubtitleSearchController } from '@/ui/subtitle-search';

const SUBS: Subtitle[] = [
	{ id: 0, start: 0, end: 1, text: 'apple pie' },
	{ id: 1, start: 2, end: 3, text: 'banana split' },
	{ id: 2, start: 4, end: 5, text: 'apple and cherry' },
];

describe('SubtitleSearchController.applyFilter', () => {
	let parent: HTMLElement;
	let input: HTMLInputElement;
	let subtitleEls: Map<number, HTMLElement>;
	let controller: SubtitleSearchController;

	beforeEach(() => {
		document.body.innerHTML = '';
		parent = document.createElement('div');
		document.body.appendChild(parent);
		subtitleEls = new Map();
		for (const s of SUBS) {
			const el = document.createElement('div');
			el.textContent = s.text;
			parent.appendChild(el);
			subtitleEls.set(s.id, el);
		}
		controller = new SubtitleSearchController({
			panelEl: parent,
			parent,
			deps: {
				getSubtitles: () => SUBS,
				getSubtitleEls: () => subtitleEls,
			},
		});
		input = parent.querySelector('.dial-subtitle-search-input') as HTMLInputElement;
	});

	const countEl = () => parent.querySelector('.dial-subtitle-search-count') as HTMLElement;
	const clearBtn = () => parent.querySelector('.dial-subtitle-search-clear') as HTMLElement;
	const emptyEl = () => parent.querySelector('.dial-subtitle-empty') as HTMLElement;

	const visibleCount = () =>
		[...subtitleEls.values()].filter((e) => !e.classList.contains('dial-subtitle-hidden'))
			.length;

	it('shows all subtitles and no counter when the query is empty', () => {
		controller.applyFilter();
		expect(visibleCount()).toBe(3);
		expect(countEl().textContent).toBe('');
		expect(clearBtn().classList.contains('dial-subtitle-hidden')).toBe(true);
		expect(emptyEl().classList.contains('dial-subtitle-hidden')).toBe(true);
	});

	it('filters to matching subtitles and reports the match count', () => {
		input.value = 'apple';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		expect(visibleCount()).toBe(2); // sub0 + sub2
		expect(countEl().textContent).toBe('2/3');
		expect(clearBtn().classList.contains('dial-subtitle-hidden')).toBe(false);
		expect(emptyEl().classList.contains('dial-subtitle-hidden')).toBe(true);
	});

	it('shows the empty state when nothing matches', () => {
		input.value = 'zzz';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		expect(visibleCount()).toBe(0);
		expect(countEl().textContent).toBe('0/3');
		expect(emptyEl().textContent).toBe('No matching subtitles');
		expect(emptyEl().classList.contains('dial-subtitle-hidden')).toBe(false);
	});

	it('clear() restores the full list and re-hides the clear button + empty state', () => {
		input.value = 'apple';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		controller.clear();

		expect(visibleCount()).toBe(3);
		expect(countEl().textContent).toBe('');
		expect(clearBtn().classList.contains('dial-subtitle-hidden')).toBe(true);
		expect(emptyEl().classList.contains('dial-subtitle-hidden')).toBe(true);
		expect(input.value).toBe('');
	});
});

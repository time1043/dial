import { beforeEach, describe, expect, it } from 'vitest';

import type { ParsedWord } from '@/modules/type-session/word-parser';

import { TypeAnswerRenderer } from '@/ui/type-answer-renderer';

// The browser project loads tests/helpers/obsidian-dom-polyfill.ts via
// setupFiles, which patches HTMLElement.prototype with Obsidian's
// createDiv / createSpan / empty / addClass / removeClass helpers.

const WORDS: ParsedWord[] = [
	{ leading: '', word: 'hello', trailing: '' },
	{ leading: '', word: 'world', trailing: ',' },
];

describe('TypeAnswerRenderer', () => {
	let host: HTMLElement;
	let renderer: TypeAnswerRenderer;

	beforeEach(() => {
		document.body.innerHTML = '';
		host = document.createElement('div');
		document.body.appendChild(host);
		renderer = new TypeAnswerRenderer(host);
	});

	it('appends a dial-type-answer container to the host', () => {
		expect(host.children.length).toBe(1);
		expect(renderer.el.classList.contains('dial-type-answer')).toBe(true);
	});

	it('show() marks the container visible and renders user + correct lines', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', 'wrld'] });

		expect(renderer.el.classList.contains('dial-type-answer-visible')).toBe(true);
		const lines = renderer.el.querySelectorAll('.dial-type-answer-line');
		expect(lines.length).toBe(2);
	});

	it('colors correct user words and wrong user words distinctly', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', 'wrld'] });

		expect(
			renderer.el.querySelectorAll('.dial-type-answer-line .dial-type-answer-correct').length,
		).toBe(1);
		expect(
			renderer.el.querySelectorAll('.dial-type-answer-line .dial-type-answer-wrong').length,
		).toBe(1);
	});

	it('renders a missing placeholder for empty user input', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', ''] });

		const missing = renderer.el.querySelectorAll('.dial-type-answer-missing');
		expect(missing.length).toBe(1);
		expect(missing[0]?.textContent).toBe('___');
	});

	it('emits leading/trailing punctuation spans around words', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', 'world'] });

		const punct = renderer.el.querySelectorAll('.dial-type-answer-punct');
		// trailing comma on word 2 appears in both the user line and the
		// correct line → 2 punct spans total
		expect(punct.length).toBe(2);
		expect(punct[0]?.textContent).toBe(',');
	});

	it('hide() removes the visible class', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', 'world'] });
		renderer.hide();
		expect(renderer.el.classList.contains('dial-type-answer-visible')).toBe(false);
	});

	it('show() replaces previous content on re-render', () => {
		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['hello', 'world'] });
		const firstCount = renderer.el.querySelectorAll('.dial-type-answer-line').length;

		renderer.show({ words: WORDS, correct: ['hello', 'world'], userInput: ['wrld', 'wrld'] });
		const secondCount = renderer.el.querySelectorAll('.dial-type-answer-line').length;

		expect(firstCount).toBe(2);
		expect(secondCount).toBe(2);
		// Two wrong words now
		expect(
			renderer.el.querySelectorAll('.dial-type-answer-line .dial-type-answer-wrong').length,
		).toBe(2);
	});
});

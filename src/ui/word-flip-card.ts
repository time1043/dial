import type { WordFlipRevealMode } from '@/types';

import { splitCellLines, type WordEntry } from '@/modules/word-flip/book-parser';

/** Everything the card needs to render one word. */
export interface WordFlipCardState {
	entry: WordEntry;
	/** 0-based position within the book. */
	index: number;
	total: number;
	/** Whether the answer block is currently revealed (hidden mode only). */
	revealed: boolean;
	marked: boolean;
	revealMode: WordFlipRevealMode;
}

/**
 * Single word card for the flip view: position, the word in large type, and
 * the answer block (phonetics, meaning lines, word form lines). In
 * "hidden" reveal mode the answer block keeps its space but stays
 * invisible until the card is tapped, so revealing never shifts layout.
 */
export class WordFlipCard {
	readonly rootEl: HTMLElement;

	private readonly indexEl: HTMLElement;
	private readonly badgeEl: HTMLElement;
	private readonly wordEl: HTMLElement;
	private readonly answerEl: HTMLElement;
	private readonly ipaEl: HTMLElement;
	private readonly meaningEl: HTMLElement;
	private readonly formsEl: HTMLElement;

	constructor(parent: HTMLElement, onToggleReveal: () => void, onPronounce?: () => void) {
		this.rootEl = parent.createDiv({ cls: 'dial-word-flip-card' });
		this.rootEl.addEventListener('click', () => onToggleReveal());

		this.indexEl = this.rootEl.createDiv({ cls: 'dial-word-flip-card-index' });
		this.badgeEl = this.indexEl.createSpan({
			cls: 'dial-word-flip-card-mark-badge',
			text: '★',
		});
		this.wordEl = this.rootEl.createDiv({ cls: 'dial-word-flip-card-word' });
		// Tapping the word pronounces it — stop propagation so the card's
		// reveal-toggle click does not also fire (event bubbling).
		this.wordEl.addClass('is-pronounce-target');
		this.wordEl.setAttr('title', 'Pronounce');
		this.wordEl.addEventListener('click', (evt) => {
			evt.stopPropagation();
			onPronounce?.();
		});

		this.answerEl = this.rootEl.createDiv({ cls: 'dial-word-flip-card-answer' });
		this.ipaEl = this.answerEl.createDiv({ cls: 'dial-word-flip-card-ipa' });
		this.meaningEl = this.answerEl.createDiv({ cls: 'dial-word-flip-card-meaning' });
		this.formsEl = this.answerEl.createDiv({ cls: 'dial-word-flip-card-forms' });
	}

	update(state: WordFlipCardState): void {
		this.indexEl.textContent = `${state.index + 1} / ${state.total}`;
		this.badgeEl.toggleClass('is-marked', state.marked);
		this.wordEl.textContent = state.entry.word;

		const showAnswer = state.revealMode === 'always' || state.revealed;
		this.answerEl.toggleClass('is-hidden', !showAnswer);

		this.renderLines(
			this.ipaEl,
			'dial-word-flip-card-ipa-line',
			state.entry.ipa ? [state.entry.ipa] : [],
		);
		this.renderLines(
			this.meaningEl,
			'dial-word-flip-card-meaning-line',
			splitCellLines(state.entry.meaning),
		);
		this.renderLines(
			this.formsEl,
			'dial-word-flip-card-forms-line',
			splitCellLines(state.entry.forms),
		);
	}

	/** Replace an element's children with one div per non-empty line. */
	private renderLines(el: HTMLElement, lineCls: string, lines: string[]): void {
		el.empty();
		el.toggleClass('is-empty', lines.length === 0);
		for (const line of lines) {
			el.createDiv({ cls: lineCls, text: line });
		}
	}
}

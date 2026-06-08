import type { Subtitle, TypeSessionData } from '@/types';

import { extractPunctuation } from '@/modules/type-session/type-session-manager';

export interface TypePanelCallbacks {
	onSave: (session: TypeSessionData) => void;
}

interface SentenceState {
	subtileId: number;
	/** Each word with its trailing punctuation. */
	words: { word: string; trailing: string }[];
	/** Lowercase correct answers. */
	correct: string[];
	userInput: string[];
	completedAt: string | null;
}

export class TypePanel {
	readonly containerEl: HTMLElement;

	private sentences: SentenceState[] = [];
	private currentIndex = 0;
	private session: TypeSessionData | null = null;

	private contextEl: HTMLElement | null = null;
	private currentEl: HTMLElement | null = null;
	private answerEl: HTMLElement | null = null;

	private wordEls: HTMLElement[] = [];
	private inputEls: HTMLInputElement[] = [];
	private activeWordIndex = 0;

	private callbacks: TypePanelCallbacks | null = null;

	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({ cls: 'dial-type-panel' });
		this.buildUI();
		this.containerEl.setAttribute('tabindex', '-1');
	}

	// ── Public API ───────────────────────────────────────────────

	load(subtitles: Subtitle[], session: TypeSessionData): void {
		this.session = session;
		this.sentences = subtitles.map((sub, i) => {
			const record = session.sentences[i];
			const rawWords = sub.text.split(/\s+/).filter((w) => w.length > 0);
			const words = rawWords.map((w) => extractPunctuation(w));
			const correct = words.map((w) => w.word.toLowerCase());

			return {
				subtileId: sub.id,
				words,
				correct,
				userInput: record?.userInput ?? [],
				completedAt: record?.completedAt ?? null,
			};
		});

		this.currentIndex = session.currentIndex;
		this.activeWordIndex = 0;
		this.render();
	}

	goToSentence(index: number): void {
		if (index < 0 || index >= this.sentences.length) return;
		this.currentIndex = index;
		this.activeWordIndex = 0;
		this.render();
	}

	focus(): void {
		this.containerEl.focus();
	}

	setCallbacks(cb: TypePanelCallbacks): void {
		this.callbacks = cb;
	}

	// ── UI construction ──────────────────────────────────────────

	private buildUI(): void {
		this.contextEl = this.containerEl.createDiv({ cls: 'dial-type-context' });
		this.currentEl = this.containerEl.createDiv({ cls: 'dial-type-current' });
		this.answerEl = this.containerEl.createDiv({ cls: 'dial-type-answer' });
	}

	// ── Rendering ────────────────────────────────────────────────

	private render(): void {
		this.renderContext();
		this.renderCurrent();
		this.answerEl?.empty();
		this.focusWord(this.activeWordIndex);
	}

	/** Render up to 2 completed sentences above the current one. */
	private renderContext(): void {
		if (!this.contextEl) return;
		this.contextEl.empty();

		const start = Math.max(0, this.currentIndex - 2);
		for (let i = start; i < this.currentIndex; i++) {
			const s = this.sentences[i];
			if (!s) continue;

			const line = this.contextEl.createDiv({ cls: 'dial-type-context-line' });
			for (let j = 0; j < s.words.length; j++) {
				const wordInfo = s.words[j]!;
				const userWord = s.userInput[j] ?? '';
				const isCorrect = userWord.toLowerCase() === s.correct[j];

				line.createSpan({
					cls: `dial-type-context-word${isCorrect ? ' dial-type-correct' : ''}`,
					text: userWord || wordInfo.word,
				});

				if (wordInfo.trailing) {
					line.createSpan({ cls: 'dial-type-context-punct', text: wordInfo.trailing });
				}
				line.createSpan({ text: ' ' });
			}
		}
	}

	/** Render the current sentence: per-word inputs + punctuation. */
	private renderCurrent(): void {
		if (!this.currentEl) return;
		this.currentEl.empty();
		this.wordEls = [];
		this.inputEls = [];

		const s = this.sentences[this.currentIndex];
		if (!s) return;

		for (let i = 0; i < s.words.length; i++) {
			const wordInfo = s.words[i]!;
			const wrapper = this.currentEl.createDiv({ cls: 'dial-type-word' });
			this.wordEls.push(wrapper);

			const input = wrapper.createEl('input', {
				cls: 'dial-type-input',
				type: 'text',
				attr: {
					autocomplete: 'off',
					autocorrect: 'off',
					autocapitalize: 'off',
					spellcheck: 'false',
					size: String(wordInfo.word.length + 2),
				},
			});
			this.inputEls.push(input);

			// Restore existing input
			if (s.userInput[i]) {
				input.value = s.userInput[i]!;
			}

			// Apply visual state
			if (s.userInput[i]) {
				const isCorrect = s.userInput[i]!.toLowerCase() === s.correct[i];
				wrapper.toggleClass('dial-type-correct', isCorrect);
				wrapper.toggleClass('dial-type-wrong', !isCorrect);
			}

			// Trailing punctuation
			if (wordInfo.trailing) {
				wrapper.createSpan({ cls: 'dial-type-punct', text: wordInfo.trailing });
			}

			const idx = i;
			input.addEventListener('focus', () => {
				this.activeWordIndex = idx;
			});
		}
	}

	private focusWord(index: number): void {
		if (index < 0 || index >= this.inputEls.length) return;
		this.activeWordIndex = index;
		this.inputEls[index]?.focus();
	}
}

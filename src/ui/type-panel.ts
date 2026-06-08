import { Platform } from 'obsidian';

import type { Subtitle, TypeSessionData } from '@/types';

import { extractPunctuation } from '@/modules/type-session/type-session-manager';

export interface TypePanelCallbacks {
	onSave: (session: TypeSessionData) => void;
	onReplaySentence: (start: number, end: number) => void;
	onSentenceChange: (subtitleId: number) => void;
}

interface SentenceState {
	subtileId: number;
	start: number;
	end: number;
	words: { leading: string; word: string; trailing: string }[];
	correct: string[];
	userInput: string[];
	completedAt: string | null;
}

type ParsedWord = { leading: string; word: string; trailing: string };

/** Merge all-punctuation tokens (word === '') into adjacent word tokens. */
function mergePunctuation(tokens: ParsedWord[]): ParsedWord[] {
	const merged: ParsedWord[] = [];
	let pendingLeading = '';

	for (const t of tokens) {
		if (t.word === '') {
			// All-punctuation token — attach as punctuation of adjacent words
			const punct = t.leading;
			if (merged.length > 0) {
				merged[merged.length - 1]!.trailing += punct;
			} else {
				pendingLeading += punct;
			}
		} else {
			merged.push({
				leading: pendingLeading + t.leading,
				word: t.word,
				trailing: t.trailing,
			});
			pendingLeading = '';
		}
	}

	// Stray punctuation at the very end
	if (pendingLeading && merged.length > 0) {
		merged[merged.length - 1]!.trailing += pendingLeading;
	}

	return merged;
}

export class TypePanel {
	readonly containerEl: HTMLElement;

	private sentences: SentenceState[] = [];
	private currentIndex = 0;
	private session: TypeSessionData | null = null;

	private contextEl: HTMLElement | null = null;
	private currentEl: HTMLElement | null = null;
	private toolbarEl: HTMLElement | null = null;
	private answerEl: HTMLElement | null = null;
	private answerVisible = false;

	private wordEls: HTMLElement[] = [];
	private inputEls: HTMLInputElement[] = [];
	private activeWordIndex = 0;

	private callbacks: TypePanelCallbacks | null = null;

	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({ cls: 'dial-type-panel' });
		this.buildUI();
		this.containerEl.setAttribute('tabindex', '-1');
		this.bindKeys();
	}

	// ── Public API ───────────────────────────────────────────────

	load(subtitles: Subtitle[], session: TypeSessionData): void {
		this.session = session;
		this.sentences = subtitles.map((sub, i) => {
			const record = session.sentences[i];
			const rawWords = sub.text.split(/\s+/).filter((w) => w.length > 0);
			const words = mergePunctuation(rawWords.map((w) => extractPunctuation(w)));
			const correct = words.map((w) => w.word.toLowerCase());

			return {
				subtileId: sub.id,
				start: sub.start,
				end: sub.end,
				words,
				correct,
				userInput: record?.userInput ?? [],
				completedAt: record?.completedAt ?? null,
			};
		});

		this.currentIndex = session.currentIndex;
		this.activeWordIndex = 0;
		this.render();
		this.renderToolbar();
	}

	goToSentence(index: number): void {
		if (index < 0 || index >= this.sentences.length) return;
		this.persistSession();
		this.currentIndex = index;
		this.activeWordIndex = 0;
		this.answerVisible = false;
		this.hideAnswer();
		this.render();
		this.renderToolbar();
		const s = this.sentences[this.currentIndex];
		if (s) this.callbacks?.onSentenceChange(s.subtileId);
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
		this.toolbarEl = this.containerEl.createDiv({ cls: 'dial-type-toolbar' });
		this.answerEl = this.containerEl.createDiv({ cls: 'dial-type-answer' });
		this.renderToolbar();
	}

	// ── Toolbar ───────────────────────────────────────────────────

	private renderToolbar(): void {
		if (!this.toolbarEl) return;
		this.toolbarEl.empty();

		const s = this.sentences[this.currentIndex];
		const mod = Platform.isMacOS ? '⌘⇧' : 'Ctrl+Shift+';
		const enter = Platform.isMacOS ? '↵' : 'Enter';
		const backspace = Platform.isMacOS ? '⌫' : 'Backspace';

		const showAnswerBtn = this.toolbarEl.createEl('button', {
			cls: 'dial-type-toolbar-btn',
			text: this.answerVisible
				? `Hide answer (${mod}${enter})`
				: `Show answer (${mod}${enter})`,
		});
		showAnswerBtn.addEventListener('click', () => {
			this.toggleAnswer();
		});

		const clearBtn = this.toolbarEl.createEl('button', {
			cls: 'dial-type-toolbar-btn',
			text: `Clear (${mod}${backspace})`,
		});
		clearBtn.addEventListener('click', () => {
			this.clearSentence();
		});

		const replayBtn = this.toolbarEl.createEl('button', {
			cls: 'dial-type-toolbar-btn',
			text: `Replay (${mod}C)`,
		});
		replayBtn.addEventListener('click', () => {
			if (s) this.callbacks?.onReplaySentence(s.start, s.end);
		});
	}

	private toggleAnswer(): void {
		this.answerVisible = !this.answerVisible;
		if (this.answerVisible) {
			this.showAnswer();
		} else {
			this.hideAnswer();
		}
		this.renderToolbar();
	}

	// ── Show answer ───────────────────────────────────────────────

	private showAnswer(): void {
		const s = this.sentences[this.currentIndex];
		if (!s || !this.answerEl) return;

		this.answerEl.empty();
		this.answerEl.addClass('dial-type-answer-visible');

		// User input line
		const userLine = this.answerEl.createDiv({ cls: 'dial-type-answer-line' });
		userLine.createSpan({ cls: 'dial-type-answer-label', text: 'You typed: ' });
		for (let i = 0; i < s.words.length; i++) {
			const wordInfo = s.words[i]!;
			const userWord = s.userInput[i] ?? '';
			const isCorrect = userWord.toLowerCase() === s.correct[i];
			const cls = userWord
				? isCorrect
					? 'dial-type-answer-correct'
					: 'dial-type-answer-wrong'
				: 'dial-type-answer-missing';

			if (wordInfo.leading) {
				userLine.createSpan({ cls: 'dial-type-answer-punct', text: wordInfo.leading });
			}
			userLine.createSpan({ cls, text: userWord || '___' });
			if (wordInfo.trailing) {
				userLine.createSpan({ cls: 'dial-type-answer-punct', text: wordInfo.trailing });
			}
			userLine.createSpan({ text: ' ' });
		}

		// Correct answer line
		const correctLine = this.answerEl.createDiv({ cls: 'dial-type-answer-line' });
		correctLine.createSpan({ cls: 'dial-type-answer-label', text: 'Correct:   ' });
		for (let i = 0; i < s.words.length; i++) {
			const wordInfo = s.words[i]!;
			const userWord = s.userInput[i] ?? '';
			const isCorrect = userWord.toLowerCase() === s.correct[i];
			const cls = userWord && !isCorrect ? 'dial-type-answer-correct-word' : '';

			if (wordInfo.leading) {
				correctLine.createSpan({ cls: 'dial-type-answer-punct', text: wordInfo.leading });
			}
			correctLine.createSpan({ cls, text: wordInfo.word });
			if (wordInfo.trailing) {
				correctLine.createSpan({ cls: 'dial-type-answer-punct', text: wordInfo.trailing });
			}
			correctLine.createSpan({ text: ' ' });
		}
	}

	private hideAnswer(): void {
		this.answerVisible = false;
		this.answerEl?.empty();
		this.answerEl?.removeClass('dial-type-answer-visible');
	}

	// ── Clear sentence ────────────────────────────────────────────

	private clearSentence(): void {
		const s = this.sentences[this.currentIndex];
		if (!s) return;

		s.userInput = [];
		s.completedAt = null;
		this.answerVisible = false;
		this.hideAnswer();
		this.renderCurrent();
		this.renderToolbar();
		this.focusWord(0);
	}

	// ── Keyboard ─────────────────────────────────────────────────

	private bindKeys(): void {
		this.containerEl.addEventListener('keydown', (e) => {
			const mod = e.ctrlKey || e.metaKey;

			// ── Modifier shortcuts ────────────────────────────
			if (mod && e.shiftKey && e.code === 'KeyC') {
				e.preventDefault();
				const s = this.sentences[this.currentIndex];
				if (s) this.callbacks?.onReplaySentence(s.start, s.end);
				return;
			}
			if (mod && e.shiftKey && e.code === 'Enter') {
				e.preventDefault();
				this.toggleAnswer();
				return;
			}
			if (mod && e.shiftKey && e.code === 'Backspace') {
				e.preventDefault();
				this.clearSentence();
				return;
			}

			// ── Navigation shortcuts ─────────────────────────
			if (e.code === 'Space') {
				e.preventDefault();
				this.onSpace();
			} else if (e.code === 'Backspace') {
				this.onBackspace(e);
			} else if (e.code === 'ArrowRight') {
				e.preventDefault();
				this.onArrow(1);
			} else if (e.code === 'ArrowLeft') {
				e.preventDefault();
				this.onArrow(-1);
			} else if (e.code === 'ArrowUp') {
				e.preventDefault();
				this.goToSentence(this.currentIndex - 1);
			} else if (e.code === 'ArrowDown') {
				e.preventDefault();
				this.goToSentence(this.currentIndex + 1);
			}
		});
	}

	private onSpace(): void {
		const input = this.inputEls[this.activeWordIndex];
		if (!input) return;

		this.commitWord(this.activeWordIndex);

		if (this.activeWordIndex < this.inputEls.length - 1) {
			this.focusWord(this.activeWordIndex + 1);
		} else {
			this.tryAutoAdvance();
		}
	}

	private onBackspace(e: KeyboardEvent): void {
		const input = this.inputEls[this.activeWordIndex];
		if (!input) return;
		// Has text — let browser delete the character
		if (input.value.length > 0) return;
		// Empty — jump to previous word
		e.preventDefault();
		if (this.activeWordIndex <= 0) return;
		this.focusWord(this.activeWordIndex - 1);
	}

	private onArrow(delta: number): void {
		const next = this.activeWordIndex + delta;
		if (next >= 0 && next < this.inputEls.length) {
			this.commitWord(this.activeWordIndex);
			this.focusWord(next);
		}
	}

	// ── Word state ───────────────────────────────────────────────

	private commitWord(index: number): void {
		const s = this.sentences[this.currentIndex];
		if (!s) return;
		const input = this.inputEls[index];
		if (!input) return;

		const value = input.value.trim();
		s.userInput[index] = value;
		this.updateWordVisual(index);
	}

	private updateWordVisual(index: number): void {
		const s = this.sentences[this.currentIndex];
		if (!s) return;
		const wrapper = this.wordEls[index];
		if (!wrapper) return;

		const input = s.userInput[index];
		if (!input) {
			wrapper.removeClass('dial-type-correct');
			wrapper.removeClass('dial-type-wrong');
			return;
		}

		const isCorrect = input.toLowerCase() === s.correct[index];
		wrapper.toggleClass('dial-type-correct', isCorrect);
		wrapper.toggleClass('dial-type-wrong', !isCorrect);
	}

	// ── Auto-advance ─────────────────────────────────────────────

	private tryAutoAdvance(): void {
		const s = this.sentences[this.currentIndex];
		if (!s) return;

		const allCorrect = s.correct.every(
			(correct, i) => s.userInput[i]?.toLowerCase() === correct,
		);

		if (!allCorrect) return;

		s.completedAt = new Date().toISOString();
		this.persistSession();

		if (this.currentIndex < this.sentences.length - 1) {
			this.currentIndex++;
			this.activeWordIndex = 0;
			this.answerVisible = false;
			this.hideAnswer();
			this.render();
			this.renderToolbar();
			const next = this.sentences[this.currentIndex];
			if (next) this.callbacks?.onSentenceChange(next.subtileId);
		}
	}

	// ── Rendering ────────────────────────────────────────────────

	private render(): void {
		this.renderContext();
		this.renderCurrent();
		if (!this.answerVisible) {
			this.answerEl?.empty();
		}
		this.focusWord(this.activeWordIndex);
	}

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

				if (wordInfo.leading) {
					line.createSpan({ cls: 'dial-type-context-punct', text: wordInfo.leading });
				}

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

			if (wordInfo.leading) {
				wrapper.createSpan({ cls: 'dial-type-punct', text: wordInfo.leading });
			}

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

			if (s.userInput[i]) {
				input.value = s.userInput[i]!;
			}

			if (s.userInput[i]) {
				const isCorrect = s.userInput[i]!.toLowerCase() === s.correct[i];
				wrapper.toggleClass('dial-type-correct', isCorrect);
				wrapper.toggleClass('dial-type-wrong', !isCorrect);
			}

			if (wordInfo.trailing) {
				wrapper.createSpan({ cls: 'dial-type-punct', text: wordInfo.trailing });
			}

			const idx = i;
			input.addEventListener('focus', () => {
				this.activeWordIndex = idx;
			});
			input.addEventListener('input', () => {
				this.onWordInput(idx);
			});
		}
	}

	private focusWord(index: number): void {
		if (index < 0 || index >= this.inputEls.length) return;
		this.activeWordIndex = index;
		this.inputEls[index]?.focus();
	}

	// ── Persistence ──────────────────────────────────────────────

	private saveCurrentInput(): void {
		const s = this.sentences[this.currentIndex];
		if (!s || !this.session) return;

		for (let i = 0; i < this.inputEls.length; i++) {
			const val = this.inputEls[i]?.value.trim();
			if (val) s.userInput[i] = val;
		}

		const record = this.session.sentences[this.currentIndex];
		if (record) {
			record.userInput = [...s.userInput];
			record.completedAt = s.completedAt;
		}
		this.session.currentIndex = this.currentIndex;
	}

	private persistSession(): void {
		if (!this.session) return;
		this.saveCurrentInput();
		this.callbacks?.onSave(this.session);
	}

	private onWordInput(index: number): void {
		const s = this.sentences[this.currentIndex];
		if (!s) return;
		const input = this.inputEls[index];
		if (!input) return;

		const value = input.value.trim();
		s.userInput[index] = value;
		this.updateWordVisual(index);
	}
}

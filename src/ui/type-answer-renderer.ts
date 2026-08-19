import type { ParsedWord } from '@/modules/type-session/word-parser';

/** Data needed to render the answer comparison for a sentence. */
export interface AnswerData {
	words: ParsedWord[];
	correct: string[];
	userInput: string[];
}

/**
 * Renders the "show answer" comparison panel: user input line (with
 * correct/wrong/missing coloring) and correct answer line.
 *
 * Extracted from TypePanel to keep the panel under 500 lines.
 */
export class TypeAnswerRenderer {
	private readonly container: HTMLElement;

	constructor(parent: HTMLElement) {
		this.container = parent.createDiv({ cls: 'dial-type-answer' });
	}

	get el(): HTMLElement {
		return this.container;
	}

	show(data: AnswerData): void {
		this.container.empty();
		this.container.addClass('dial-type-answer-visible');

		// User input line
		const userLine = this.container.createDiv({ cls: 'dial-type-answer-line' });
		userLine.createSpan({ cls: 'dial-type-answer-label', text: 'You typed: ' });
		for (let i = 0; i < data.words.length; i++) {
			const wordInfo = data.words[i]!;
			const userWord = data.userInput[i] ?? '';
			const isCorrect = userWord.toLowerCase() === data.correct[i];
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
		const correctLine = this.container.createDiv({ cls: 'dial-type-answer-line' });
		correctLine.createSpan({ cls: 'dial-type-answer-label', text: 'Correct:   ' });
		for (let i = 0; i < data.words.length; i++) {
			const wordInfo = data.words[i]!;
			const userWord = data.userInput[i] ?? '';
			const isCorrect = userWord.toLowerCase() === data.correct[i];
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

	hide(): void {
		this.container.removeClass('dial-type-answer-visible');
	}
}

import { Notice, Platform, setIcon } from 'obsidian';

import { isSpeechSynthesisAvailable } from '@/utils/speech';

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 200;
const DEFAULT_LANG = 'en-US';

/** Behavior knobs for the word card, sourced from plugin settings. */
export interface WordCardConfig {
	/** BCP 47 language tag used when pronouncing a word. */
	pronunciationLang: string;
	/** Speak the word automatically when the card opens. */
	autoPronounce: boolean;
}

const DEFAULT_CONFIG: WordCardConfig = {
	pronunciationLang: DEFAULT_LANG,
	autoPronounce: true,
};

export interface WordCardOptions {
	/**
	 * Read at card-open and speak time so settings changes apply to open
	 * panels without a rebuild. Absent fields fall back to defaults.
	 */
	getConfig?: () => Partial<WordCardConfig>;
}

/**
 * Floating word card shown when the user hovers (desktop) or taps (mobile)
 * a word inside a subtitle line. Shows the word plus a pronounce button
 * backed by the Web Speech API; translation will be layered on later.
 *
 * On desktop the card stays open while the pointer rests on it, so the
 * user can move from the word onto the card to press the button.
 */
export class WordCard {
	private cardEl: HTMLElement | null = null;
	private activeWordEl: HTMLElement | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private removeDismissListener: (() => void) | null = null;

	constructor(private readonly options: WordCardOptions = {}) {}

	private get config(): WordCardConfig {
		return { ...DEFAULT_CONFIG, ...this.options.getConfig?.() };
	}

	/**
	 * Wire hover/tap behavior onto a `.dial-subtitle-word` span.
	 *
	 * Desktop: hovering the word for a short delay shows the card, leaving
	 * hides it (also after a short delay so quick passes do not flicker);
	 * clicking shows it immediately. Mobile: tapping the word toggles the
	 * card; tapping anywhere else or scrolling dismisses it. Word taps
	 * always stop propagation so they do not trigger the parent subtitle
	 * line's seek-to-time click.
	 */
	bindWordSpan(span: HTMLElement): void {
		if (Platform.isMobile) {
			span.addEventListener('click', (e) => {
				e.stopPropagation();
				if (this.activeWordEl === span) {
					this.hide();
				} else {
					this.show(span);
				}
			});
			return;
		}

		span.addEventListener('mouseenter', () => {
			this.clearTimers();
			this.showTimer = window.setTimeout(() => this.show(span), SHOW_DELAY_MS);
		});
		span.addEventListener('mouseleave', () => {
			if (this.showTimer !== null) {
				window.clearTimeout(this.showTimer);
				this.showTimer = null;
			}
			if (this.activeWordEl !== span) return;
			this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
		});
		span.addEventListener('click', (e) => {
			e.stopPropagation();
			this.show(span);
		});
	}

	/** Hide the card immediately (used on scroll, panel rebuild, etc.). */
	hide(): void {
		this.clearTimers();
		this.removeDismissListener?.();
		this.removeDismissListener = null;
		this.activeWordEl = null;
		this.cardEl?.remove();
		this.cardEl = null;
	}

	/** Release all DOM owned by this card. Safe to call on plugin unload. */
	destroy(): void {
		this.hide();
	}

	private show(span: HTMLElement): void {
		this.clearTimers();
		this.hide();

		this.activeWordEl = span;
		this.cardEl = document.createElement('div');
		this.cardEl.className = 'dial-word-card';

		const word = span.dataset.word ?? span.textContent ?? '';
		const wordEl = this.cardEl.createSpan({ cls: 'dial-word-card-word' });
		wordEl.textContent = word;

		// Hide the speak affordance entirely when the platform has no
		// speech synthesis (Android WebView) — a dead button that only
		// shows an error toast is worse than no button.
		if (isSpeechSynthesisAvailable()) {
			const speakBtnEl = this.cardEl.createEl('button', {
				cls: 'dial-word-card-speak',
				attr: { 'aria-label': 'Pronounce word', title: 'Pronounce word' },
			});
			setIcon(speakBtnEl, 'volume-2');
			speakBtnEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.speak(word);
			});
		}

		if (Platform.isMobile) {
			this.attachDismissHandler();
		} else {
			// Keep the card alive while the pointer is on it so the user can
			// travel from the word to the pronounce button.
			this.cardEl.addEventListener('mouseenter', () => this.clearTimers());
			this.cardEl.addEventListener('mouseleave', () => {
				this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
			});
		}

		document.body.appendChild(this.cardEl);
		this.position(span);

		// Auto-pronounce once on open (if enabled and the platform supports
		// it); the button replays on demand.
		if (this.config.autoPronounce && isSpeechSynthesisAvailable()) {
			this.speak(word, false);
		}
	}

	/**
	 * Dismiss the card on any tap that lands outside the card and outside
	 * the word that opened it (mobile only). The word itself is excluded so
	 * the tap can toggle the card off via bindWordSpan's own handler.
	 */
	private attachDismissHandler(): void {
		const handler = (e: Event) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (this.cardEl?.contains(target)) return;
			if (this.activeWordEl?.contains(target)) return;
			this.hide();
		};
		document.addEventListener('click', handler, true);
		this.removeDismissListener = () => document.removeEventListener('click', handler, true);
	}

	/**
	 * Pronounce the word with the Web Speech API (offline TTS).
	 *
	 * @param notifyIfUnavailable When false (auto-pronounce on card open),
	 *   silently skip if the API is missing so accidental hovers never
	 *   spam the unavailable-notice. Explicit button clicks keep it.
	 */
	private speak(word: string, notifyIfUnavailable = true): void {
		if (!word) return;
		if (!isSpeechSynthesisAvailable()) {
			if (notifyIfUnavailable) {
				new Notice('Speech synthesis is not available in this environment');
			}
			return;
		}
		const utterance = new SpeechSynthesisUtterance(word);
		utterance.lang = this.config.pronunciationLang;
		// Replace any in-flight utterance so rapid taps do not queue up.
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(utterance);
	}

	/**
	 * Place the card above the word when there is room, otherwise below,
	 * and clamp it to the viewport so it never renders off-screen.
	 */
	private position(span: HTMLElement): void {
		if (!this.cardEl) return;

		const rect = span.getBoundingClientRect();
		const cardRect = this.cardEl.getBoundingClientRect();
		const margin = 6;

		let top = rect.top - cardRect.height - margin;
		if (top < margin) {
			top = rect.bottom + margin;
		}
		top = Math.min(top, window.innerHeight - cardRect.height - margin);

		let left = rect.left + rect.width / 2 - cardRect.width / 2;
		left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));

		this.cardEl.style.top = `${top}px`;
		this.cardEl.style.left = `${left}px`;
	}

	private clearTimers(): void {
		if (this.showTimer !== null) {
			window.clearTimeout(this.showTimer);
			this.showTimer = null;
		}
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}
}

/**
 * Split a subtitle line into word spans and plain-text fragments.
 *
 * Latin-script word characters (including accented letters and apostrophes)
 * become `.dial-subtitle-word` spans; everything else (punctuation, CJK,
 * whitespace) is kept as plain text nodes so the line renders identically
 * to before.
 */
export function renderWordSpans(
	parent: HTMLElement,
	text: string,
	onWordSpan?: (span: HTMLElement) => void,
): void {
	const parts = text.split(/([A-Za-z\u00C0-\u024F']+)/);
	for (const part of parts) {
		if (!part) continue;
		if (/^[A-Za-z\u00C0-\u024F']+$/.test(part)) {
			const span = parent.createSpan({ cls: 'dial-subtitle-word' });
			span.textContent = part;
			span.dataset.word = part;
			onWordSpan?.(span);
		} else {
			parent.appendChild(document.createTextNode(part));
		}
	}
}

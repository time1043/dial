import { Notice, Platform, setIcon } from 'obsidian';

import type { SpeechProvider } from '@/modules/speech/speech-provider';

import { isSpeechChain } from '@/modules/speech/speech-chain';
import { systemSpeechProvider } from '@/modules/speech/system-speech-provider';

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
	/**
	 * Pronunciation engine. Defaults to the system Web Speech provider;
	 * callers inject an engine chain to enable cloud fallbacks.
	 */
	speech?: SpeechProvider;
	/**
	 * Translation lookup for the card (cache-first pipeline). Absent =
	 * no translation UI at all; a null result hides the row quietly.
	 */
	getTranslation?: (word: string) => Promise<string | null>;
	/** Notified after every pronunciation attempt, for query logging. */
	onPronounced?: (info: { word: string; engine: string | null }) => void;
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
	/** Desktop scroll dismiss; set when the card opens without mobile handlers. */
	private removeScrollListener: (() => void) | null = null;
	/** Bumped on every hide/show so stale async translations are dropped. */
	private translationToken = 0;

	constructor(private readonly options: WordCardOptions = {}) {}

	private get config(): WordCardConfig {
		return { ...DEFAULT_CONFIG, ...this.options.getConfig?.() };
	}

	private get speech(): SpeechProvider {
		return this.options.speech ?? systemSpeechProvider;
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
		this.removeScrollListener?.();
		this.removeScrollListener = null;
		this.activeWordEl = null;
		this.cardEl?.remove();
		this.cardEl = null;
		this.translationToken++;
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
		const mainEl = this.cardEl.createDiv({ cls: 'dial-word-card-main' });
		const wordEl = mainEl.createSpan({ cls: 'dial-word-card-word' });
		wordEl.textContent = word;

		// Hide the speak affordance entirely when no engine is available
		// (Android WebView without cloud engines) — a dead button that only
		// shows an error toast is worse than no button.
		if (this.speech.isAvailable()) {
			const speakBtnEl = this.cardEl.createEl('button', {
				cls: 'dial-word-card-speak',
				attr: { 'aria-label': 'Pronounce word', title: 'Pronounce word' },
			});
			setIcon(speakBtnEl, 'volume-2');
			speakBtnEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.pronounce(word);
			});
		}

		// Copy-to-clipboard button. Always rendered (clipboard is
		// browser-native and does not depend on any engine) so the
		// user can grab a word even when speech is unavailable.
		const copyBtnEl = this.cardEl.createEl('button', {
			cls: 'dial-word-card-copy',
			attr: { 'aria-label': 'Copy word', title: 'Copy word' },
		});
		setIcon(copyBtnEl, 'copy');
		copyBtnEl.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.copyToClipboard(word);
		});

		if (Platform.isMobile) {
			this.attachDismissHandler();
		} else {
			// Keep the card alive while the pointer is on it so the user can
			// travel from the word to the pronounce button.
			this.cardEl.addEventListener('mouseenter', () => this.clearTimers());
			this.cardEl.addEventListener('mouseleave', () => {
				this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
			});
			// On desktop, scrolling the page also counts as leaving the
			// card (the word travels away from under it). Listen on the
			// document with capture so we catch scrolls that fire on any
			// nested container — the subtitle list, the panel viewport,
			// or the surrounding leaf — without having to know which
			// one is actually scrolling. (Scroll events don't bubble,
			// but capture-phase on document sees them on the way down.)
			document.addEventListener('scroll', this.handleDocumentScroll, true);
			this.removeScrollListener = () =>
				document.removeEventListener('scroll', this.handleDocumentScroll, true);
		}

		document.body.appendChild(this.cardEl);
		this.position(span);

		// Translation row: '…' while the cache/engine pipeline runs. The
		// token drops results that arrive after the card changed or hid.
		if (this.options.getTranslation) {
			const token = ++this.translationToken;
			const translationEl = mainEl.createSpan({ cls: 'dial-word-card-translation' });
			translationEl.textContent = '…';
			this.options
				.getTranslation(word)
				.then((text) => {
					if (token !== this.translationToken || !this.cardEl) return;
					if (text) {
						translationEl.textContent = text;
						// The card grew — re-clamp it against the viewport.
						this.position(span);
					} else {
						translationEl.remove();
					}
				})
				.catch(() => {
					if (token !== this.translationToken || !this.cardEl) return;
					translationEl.remove();
				});
		}

		// Auto-pronounce once on open (if enabled and an engine is
		// available); the button replays on demand.
		if (this.config.autoPronounce && this.speech.isAvailable()) {
			this.pronounce(word, false);
		}
	}

	/**
	 * Dismiss the card on:
	 *  - any tap that lands outside the card and the word (mobile);
	 *  - any document scroll that takes the word out from under the card
	 *    (both mobile and desktop). Capture phase lets us catch scrolls
	 *    fired on any nested container — including the subtitle list,
	 *    the panel viewport, and the surrounding leaf — without having
	 *    to know which one is actually scrolling;
	 *  - any touchmove outside the card (mobile swipe gesture); clicks
	 *    inside the card already stop propagation.
	 *
	 * The word itself is excluded so a tap on the word can toggle the
	 * card off via bindWordSpan's own handler.
	 */
	private attachDismissHandler(): void {
		const handler = (e: Event) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (this.cardEl?.contains(target)) return;
			if (this.activeWordEl?.contains(target)) return;
			this.hide();
		};
		// Click-outside for taps. Scroll (capture on document) catches
		// touchpad/wheel drags and programmatic scrolls (e.g.
		// setCurrentSubtitle's scrollIntoView). touchmove covers mobile
		// swipes that don't always fire scroll on the first touchmove —
		// dismissing on first finger move feels immediate.
		document.addEventListener('click', handler, true);
		document.addEventListener('scroll', handler, true);
		document.addEventListener('touchmove', handler, true);
		this.removeDismissListener = () => {
			document.removeEventListener('click', handler, true);
			document.removeEventListener('scroll', handler, true);
			document.removeEventListener('touchmove', handler, true);
		};
	}

	/** Bound reference kept so removeScrollListener can detach it later. */
	private readonly handleDocumentScroll = (e: Event) => {
		const target = e.target as Node | null;
		if (!target) return;
		if (this.cardEl?.contains(target)) return;
		if (this.activeWordEl?.contains(target)) return;
		this.hide();
	};

	/**
	 * Pronounce the word through the configured speech engine.
	 *
	 * @param notifyOnError When false (auto-pronounce on card open),
	 *   failures are silent so accidental hovers never spam the notice.
	 *   Explicit button clicks keep it.
	 */
	private pronounce(word: string, notifyOnError = true): void {
		if (!word) return;
		this.reportPronounce(word)
			.then((engine) => {
				this.options.onPronounced?.({ word, engine });
				if (engine === null && notifyOnError) {
					new Notice('Pronunciation failed');
				}
			})
			.catch(() => {
				this.options.onPronounced?.({ word, engine: null });
				if (notifyOnError) {
					new Notice('Pronunciation failed');
				}
			});
	}

	/** Speak and resolve with the engine id that spoke (null = none did). */
	private async reportPronounce(word: string): Promise<string | null> {
		const request = { word, lang: this.config.pronunciationLang };
		if (isSpeechChain(this.speech)) {
			const engine = await this.speech.speakAndReport(request);
			return engine?.id ?? null;
		}
		await this.speech.speak(request);
		return this.speech.id;
	}

	/**
	 * Copy the word to the system clipboard. Clipboard is browser-native,
	 * so this works whether or not a speech engine is available. Failures
	 * (insecure context, denied permission) are logged to the console so
	 * the user still sees feedback from the click without a noisy toast.
	 */
	private async copyToClipboard(word: string): Promise<void> {
		if (!word) return;
		try {
			await navigator.clipboard.writeText(word);
			new Notice(`Copied "${word}"`);
		} catch (err) {
			console.error('[word-card] clipboard write failed:', err);
			new Notice('Copy failed — clipboard access denied');
		}
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

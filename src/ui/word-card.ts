import { Platform } from 'obsidian';

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 200;

/**
 * Floating word card shown when the user hovers (desktop) or taps (mobile)
 * a word inside a subtitle line. For now the card only displays the word;
 * pronunciation and translation will be layered on in later iterations.
 *
 * The card is non-interactive (pointer-events: none) so it never steals
 * hover focus from the word that spawned it.
 */
export class WordCard {
	private cardEl: HTMLElement | null = null;
	private wordEl: HTMLElement | null = null;
	private activeWordEl: HTMLElement | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;

	/**
	 * Wire hover/tap behavior onto a `.dial-subtitle-word` span.
	 *
	 * Desktop: hovering the word for a short delay shows the card, leaving
	 * hides it (also after a short delay so quick passes do not flicker);
	 * clicking shows it immediately. Mobile: tapping the word toggles the
	 * card; clicking anywhere else or scrolling dismisses it. Word taps
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
		this.activeWordEl = null;
		this.cardEl?.remove();
		this.cardEl = null;
		this.wordEl = null;
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
		this.wordEl = this.cardEl.createSpan({ cls: 'dial-word-card-word' });

		const word = span.dataset.word ?? span.textContent ?? '';
		this.wordEl.textContent = word;

		document.body.appendChild(this.cardEl);
		this.position(span);
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

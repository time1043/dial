import { ItemView, Notice, TFile, type WorkspaceLeaf } from 'obsidian';

import type DialPlugin from '@/main';

import { bookDisplayName, readWordBook } from '@/modules/word-flip/book-finder';
import { WORD_ROW_FORMAT_HINT, type ParsedWordBook } from '@/modules/word-flip/book-parser';
import { WordFlipCard } from '@/ui/word-flip-card';

export const WORD_FLIP_VIEW_TYPE = 'dial-word-flip';

/** One wheel notch = one card; smaller deltas (trackpad drift) are ignored. */
const WHEEL_COOLDOWN_MS = 150;
const WHEEL_MIN_DELTA = 16;
/** Card switch transition duration — ghosts are removed after it. */
const SWITCH_ANIMATION_MS = 260;

/**
 * Short-video-style word flipping view: one card fills the view, navigated
 * by keyboard, mouse wheel or vertical swipe.
 */
export class WordFlipView extends ItemView {
	private card: WordFlipCard | null = null;
	private cardAreaEl: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;

	private bookFile: TFile | null = null;
	private parsed: ParsedWordBook | null = null;
	/** 0-based index of the current word. */
	private index = 0;
	private revealed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DialPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return WORD_FLIP_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Word flip';
	}

	getIcon(): string {
		return 'book-open';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement | undefined;
		if (!container) return;
		container.empty();
		container.addClass('dial-word-flip');

		this.cardAreaEl = container.createDiv({ cls: 'dial-word-flip-area' });
		this.card = new WordFlipCard(this.cardAreaEl, () => this.toggleReveal());
		this.card.rootEl.toggleClass('is-empty-state', true);
		this.renderEmpty('No word book loaded. Open one via a "Flip words" command.');

		// Keyboard: ↓/Space = next, ↑ = previous (scroll semantics, like
		// short-video web apps). Registered on the view's keymap scope so
		// they only fire while this view is the active leaf.
		this.scope?.register([], 'ArrowDown', () => {
			this.next();
			return false;
		});
		this.scope?.register([], 'ArrowUp', () => {
			this.prev();
			return false;
		});
		this.scope?.register([], 'Space', () => {
			this.next();
			return false;
		});

		// Mouse wheel: scroll down = next, scroll up = previous, with a
		// cooldown so one notch is one card.
		let lastWheelAt = 0;
		this.registerDomEvent(
			container,
			'wheel',
			(evt: WheelEvent) => {
				evt.preventDefault();
				const now = Date.now();
				if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
				if (Math.abs(evt.deltaY) < WHEEL_MIN_DELTA) return;
				lastWheelAt = now;
				if (evt.deltaY > 0) this.next();
				else this.prev();
			},
			{ passive: false },
		);
	}

	async onClose(): Promise<void> {
		this.card = null;
		this.cardAreaEl = null;
		this.emptyEl = null;
	}

	/** The vault path of the loaded book, for session/persistence wiring. */
	getBookPath(): string | null {
		return this.bookFile?.path ?? null;
	}

	getCurrentIndex(): number {
		return this.index;
	}

	getWords(): ParsedWordBook['words'] {
		return this.parsed?.words ?? [];
	}

	/**
	 * Load (or switch to) a word book and show the word at `startAt`
	 * (0-based; defaults to the first word).
	 */
	async loadBook(file: TFile, startAt?: number): Promise<void> {
		const parsed = await readWordBook(this.app.vault, file);
		this.bookFile = file;
		this.parsed = parsed;
		this.reportProblems(parsed);
		this.plugin.wordFlip.setLastBook(file.path);

		if (parsed.words.length === 0) {
			this.renderEmpty(
				`"${bookDisplayName(file.name, parsed)}" has no words — check the table format.`,
			);
			return;
		}

		const target = Math.min(Math.max(startAt ?? 0, 0), parsed.words.length - 1);
		this.goToIndex(target);
	}

	/** Jump to a position without a directional animation. */
	goToIndex(index: number): void {
		this.applyIndex(index);
	}

	next(): void {
		const words = this.parsed?.words;
		if (!words || words.length === 0) return;
		if (this.index >= words.length - 1) return;
		this.switchTo(this.index + 1, 1);
	}

	prev(): void {
		if (this.index <= 0) return;
		this.switchTo(this.index - 1, -1);
	}

	private applyIndex(index: number): void {
		const words = this.parsed?.words;
		if (!words || words.length === 0) return;
		this.index = Math.min(Math.max(index, 0), words.length - 1);
		this.revealed = false;
		if (this.bookFile) {
			this.plugin.wordFlip.recordIndex(this.bookFile.path, this.index);
		}
		this.renderCard();
	}

	/**
	 * Directional switch: the outgoing card is cloned as a ghost and slides
	 * out while the real card re-renders and slides in from the opposite
	 * edge — in lockstep, like scrolling a feed.
	 */
	private switchTo(index: number, direction: 1 | -1): void {
		if (!this.card || !this.cardAreaEl) {
			this.applyIndex(index);
			return;
		}

		const ghost = this.card.rootEl.cloneNode(true) as HTMLElement;
		ghost.addClass('dial-word-flip-card-ghost');
		ghost.addClass(direction === 1 ? 'is-leave-next' : 'is-leave-prev');
		this.cardAreaEl.appendChild(ghost);
		window.setTimeout(() => ghost.remove(), SWITCH_ANIMATION_MS + 80);

		this.applyIndex(index);

		const enterCls = direction === 1 ? 'is-enter-next' : 'is-enter-prev';
		this.card.rootEl.addClass(enterCls);
		// Two rAFs so the start transform commits before the transition
		// (defined on the base class) animates the card back into place.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => this.card?.rootEl.removeClass(enterCls)),
		);
	}

	private renderCard(): void {
		if (!this.card || !this.parsed) return;
		const entry = this.parsed.words[this.index];
		if (!entry) return;
		this.emptyEl?.remove();
		this.emptyEl = null;
		this.card.rootEl.toggleClass('is-empty-state', false);
		this.card.update({
			entry,
			index: this.index,
			total: this.parsed.words.length,
			revealed: this.revealed,
			marked:
				this.bookFile !== null &&
				this.plugin.wordFlip.isMarked(this.bookFile.path, entry.word),
			revealMode: this.plugin.settings.wordFlipRevealMode,
		});
	}

	private renderEmpty(message: string): void {
		if (!this.cardAreaEl) return;
		this.emptyEl?.remove();
		this.emptyEl = this.cardAreaEl.createDiv({ cls: 'dial-word-flip-empty' });
		this.emptyEl.textContent = message;
		this.card?.rootEl.toggleClass('is-empty-state', true);
	}

	/** Reveal is only interactive in "hidden" mode; "always" shows all. */
	private toggleReveal(): void {
		if (this.plugin.settings.wordFlipRevealMode !== 'hidden') return;
		if (!this.parsed || this.parsed.words.length === 0) return;
		this.revealed = !this.revealed;
		this.renderCard();
	}

	/** Surface parse problems as concise toasts (skip nothing silently). */
	private reportProblems(parsed: ParsedWordBook): void {
		if (!this.bookFile) return;
		const name = bookDisplayName(this.bookFile.name, parsed);

		if (parsed.words.length === 0) {
			new Notice(`Word book "${name}": no words parsed. Row format: ${WORD_ROW_FORMAT_HINT}`);
			return;
		}

		if (parsed.invalidRows.length > 0) {
			const first = parsed.invalidRows[0]!;
			new Notice(
				`Word book "${name}": skipped ${parsed.invalidRows.length} invalid row(s), ` +
					`first at line ${first.line}. Row format: ${WORD_ROW_FORMAT_HINT}`,
			);
		}

		if (parsed.indexColumnMismatches > 0) {
			new Notice(
				`Word book "${name}": # column disagrees with row order at ` +
					`${parsed.indexColumnMismatches} row(s); loaded in row order.`,
			);
		}
	}
}

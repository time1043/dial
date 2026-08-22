import { ItemView, Notice, setIcon, TFile, type WorkspaceLeaf } from 'obsidian';

import type DialPlugin from '@/main';

import { bookDisplayName, readWordBook } from '@/modules/word-flip/book-finder';
import { WORD_ROW_FORMAT_HINT, type ParsedWordBook } from '@/modules/word-flip/book-parser';
import { appendJourneySession, type JourneyWordSnapshot } from '@/modules/word-flip/journey-writer';
import { WordFlipCard, type WordFlipCardState } from '@/ui/word-flip-card';
import { VerticalDragDetector, type DragCommitDirection } from '@/ui/word-flip-drag';
import { WordFlipProgressBar } from '@/ui/word-flip-progress';
import { isSpeechSynthesisAvailable, speakWord } from '@/utils/speech';

export const WORD_FLIP_VIEW_TYPE = 'dial-word-flip';

/** One wheel notch = one card; smaller deltas (trackpad drift) are ignored. */
const WHEEL_COOLDOWN_MS = 150;
const WHEEL_MIN_DELTA = 16;
/** Card switch transition duration — ghosts are removed after it. */
const SWITCH_ANIMATION_MS = 260;

/**
 * A study session: opened explicitly via Start (or automatically by the
 * entry commands), closed via End / book switch / view close. Its coverage
 * (min–max visited) is what gets written to the journey file on settle.
 */
interface FlipSession {
	/** Index the session was started at (decides the epoch on settle). */
	startIdx: number;
	minIdx: number;
	maxIdx: number;
	startTime: number;
	marksMade: number;
}

/**
 * Short-video-style word flipping view: one card fills the view, navigated
 * by keyboard, mouse wheel or vertical swipe.
 */
export class WordFlipView extends ItemView {
	private card: WordFlipCard | null = null;
	/** Off-screen twin that previews the adjacent word during a swipe. */
	private neighborCard: WordFlipCard | null = null;
	private cardAreaEl: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;
	private dragDetector: VerticalDragDetector | null = null;
	/** Direction (1 next / -1 prev / 0 none) of the in-flight swipe. */
	private dragDir: 1 | -1 | 0 = 0;

	private bookFile: TFile | null = null;
	private parsed: ParsedWordBook | null = null;
	/** 0-based index of the current word. */
	private index = 0;
	private revealed = false;
	/** Active study session; null while merely browsing. */
	private session: FlipSession | null = null;
	private footerEl: HTMLElement | null = null;
	private sessionBtnEl: HTMLElement | null = null;
	private markBtnEl: HTMLButtonElement | null = null;
	private speakBtnEl: HTMLButtonElement | null = null;
	private progressBar: WordFlipProgressBar | null = null;
	private seekPreviewEl: HTMLElement | null = null;
	private endCardEl: HTMLElement | null = null;
	private endCardShown = false;

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

		this.progressBar = new WordFlipProgressBar(container, {
			onSeekPreview: (index) => this.showSeekPreview(index),
			onSeekCommit: (index) => this.commitSeek(index),
		});

		this.cardAreaEl = container.createDiv({ cls: 'dial-word-flip-area' });
		this.card = new WordFlipCard(this.cardAreaEl, () => this.toggleReveal());
		this.card.rootEl.toggleClass('is-empty-state', true);
		this.neighborCard = new WordFlipCard(this.cardAreaEl, () => {});
		this.neighborCard.rootEl.addClass('dial-word-flip-card-neighbor');
		this.seekPreviewEl = this.cardAreaEl.createDiv({ cls: 'dial-word-flip-seek-preview' });
		this.endCardEl = this.cardAreaEl.createDiv({ cls: 'dial-word-flip-end-card' });
		this.renderEmpty('No word book loaded. Open one via a "Flip words" command.');

		this.dragDetector = new VerticalDragDetector(this.cardAreaEl, {
			onDragMove: (dy) => this.handleDragMove(dy),
			onDragEnd: (dy, commit) => this.handleDragEnd(dy, commit),
		});

		this.footerEl = container.createDiv({ cls: 'dial-word-flip-footer' });

		this.markBtnEl = this.footerEl.createEl('button', {
			cls: 'dial-word-flip-mark-btn',
			attr: { 'aria-label': 'Mark word', title: 'Mark word' },
		});
		this.markBtnEl.addEventListener('click', () => this.toggleMark());

		this.sessionBtnEl = this.footerEl.createEl('button', {
			cls: 'dial-word-flip-session-btn',
		});
		this.sessionBtnEl.addEventListener('click', () => {
			if (this.session) this.endSession();
			else this.startSession();
		});

		// No dead speaker button on platforms without speech synthesis.
		if (isSpeechSynthesisAvailable()) {
			this.speakBtnEl = this.footerEl.createEl('button', {
				cls: 'dial-word-flip-speak-btn',
				attr: { 'aria-label': 'Pronounce word', title: 'Pronounce word' },
			});
			this.speakBtnEl.addEventListener('click', () => this.speakCurrentWord());
		}

		this.updateFooterButtons();

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
		await this.settleSession();
		this.plugin.wordFlip.flush();
		this.dragDetector?.destroy();
		this.dragDetector = null;
		this.progressBar?.destroy();
		this.progressBar = null;
		this.card = null;
		this.neighborCard = null;
		this.cardAreaEl = null;
		this.emptyEl = null;
		this.footerEl = null;
		this.sessionBtnEl = null;
		this.markBtnEl = null;
		this.speakBtnEl = null;
		this.seekPreviewEl = null;
		this.endCardEl = null;
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
		this.endSession();
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

	/** Begin a study session at the current position (marks become available). */
	startSession(): void {
		if (this.session) return;
		if (!this.parsed || this.parsed.words.length === 0) return;
		this.session = {
			startIdx: this.index,
			minIdx: this.index,
			maxIdx: this.index,
			startTime: Date.now(),
			marksMade: 0,
		};
		this.updateFooterButtons();
	}

	isSessionActive(): boolean {
		return this.session !== null;
	}

	/** Toggle the current word's mark. Only available inside a session. */
	private toggleMark(): void {
		if (!this.session || !this.bookFile || !this.parsed) return;
		const entry = this.parsed.words[this.index];
		if (!entry) return;
		const nowMarked = this.plugin.wordFlip.toggleMark(this.bookFile.path, entry.word);
		if (nowMarked) {
			this.session.marksMade++;
		} else {
			this.session.marksMade = Math.max(0, this.session.marksMade - 1);
		}
		this.renderCard();
		this.updateMarkButton();
	}

	/** Close the session and record it to the journey file (fire & forget). */
	endSession(): void {
		void this.settleSession();
	}

	/**
	 * Settle the active session: snapshot the covered range with the
	 * current mark state and append it to the book's journey file in a
	 * single write. Trivial sessions (one word, under 5s, no marks) are
	 * skipped — they are accidental Start/End presses, not study.
	 */
	private async settleSession(): Promise<void> {
		const session = this.session;
		this.session = null;
		this.updateFooterButtons();
		if (!session || !this.bookFile || !this.parsed) return;

		const durationMs = Date.now() - session.startTime;
		if (session.minIdx === session.maxIdx && durationMs < 5000 && session.marksMade === 0) {
			return;
		}

		const words: JourneyWordSnapshot[] = [];
		for (let i = session.minIdx; i <= session.maxIdx; i++) {
			const entry = this.parsed.words[i];
			if (!entry) continue;
			words.push({
				entry,
				marked: this.plugin.wordFlip.isMarked(this.bookFile.path, entry.word),
			});
		}

		try {
			await appendJourneySession(this.app.vault, {
				bookPath: this.bookFile.path,
				startIdx: session.startIdx,
				minIdx: session.minIdx,
				maxIdx: session.maxIdx,
				startTime: new Date(session.startTime),
				endTime: new Date(),
				words,
			});
		} catch (e) {
			new Notice(
				`Failed to write the journey record: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	private updateFooterButtons(): void {
		this.updateSessionButton();
		this.updateMarkButton();
		if (this.speakBtnEl) {
			this.speakBtnEl.empty();
			const iconEl = this.speakBtnEl.createSpan({ cls: 'dial-word-flip-btn-icon' });
			setIcon(iconEl, 'volume-2');
			this.speakBtnEl.disabled = !this.parsed || this.parsed.words.length === 0;
		}
	}

	/** Pronounce the current word: book lang overrides the global setting. */
	private speakCurrentWord(notifyIfUnavailable = true): void {
		const entry = this.parsed?.words[this.index];
		if (!entry) return;
		const lang = this.parsed?.lang ?? this.plugin.settings.wordPronunciationLang;
		speakWord(entry.word, lang, notifyIfUnavailable);
	}

	private updateSessionButton(): void {
		if (!this.sessionBtnEl) return;
		this.sessionBtnEl.empty();
		const iconEl = this.sessionBtnEl.createSpan({ cls: 'dial-word-flip-btn-icon' });
		setIcon(iconEl, this.session ? 'square' : 'play');
		this.sessionBtnEl.createSpan({
			cls: 'dial-word-flip-btn-label',
			text: this.session ? 'End' : 'Start',
		});
		this.sessionBtnEl.toggleClass('is-active-session', this.session !== null);
	}

	/** Mark button: filled star when the current word is marked; disabled
	 *  while browsing (marks are a session activity). */
	private updateMarkButton(): void {
		if (!this.markBtnEl) return;
		const entry = this.parsed?.words[this.index];
		const marked =
			entry !== undefined &&
			this.bookFile !== null &&
			this.plugin.wordFlip.isMarked(this.bookFile!.path, entry.word);
		const enabled = this.session !== null && entry !== undefined;

		this.markBtnEl.empty();
		const iconEl = this.markBtnEl.createSpan({ cls: 'dial-word-flip-btn-icon' });
		setIcon(iconEl, 'star');
		this.markBtnEl.toggleClass('is-marked', marked);
		this.markBtnEl.disabled = !enabled;
		this.markBtnEl.setAttr(
			'title',
			enabled ? 'Mark word as unknown' : 'Marking is available during a session',
		);
	}

	/** Jump to a position without a directional animation. */
	goToIndex(index: number): void {
		this.applyIndex(index);
	}

	next(): void {
		const words = this.parsed?.words;
		if (!words || words.length === 0) return;
		if (this.endCardShown) return;
		if (this.index >= words.length - 1) {
			this.renderEndCard();
			return;
		}
		this.switchTo(this.index + 1, 1);
	}

	prev(): void {
		if (this.endCardShown) {
			this.hideEndCard();
			return;
		}
		if (this.index <= 0) return;
		this.switchTo(this.index - 1, -1);
	}

	private applyIndex(index: number): void {
		const words = this.parsed?.words;
		if (!words || words.length === 0) return;
		this.index = Math.min(Math.max(index, 0), words.length - 1);
		this.revealed = false;
		this.hideEndCard();
		if (this.bookFile) {
			this.plugin.wordFlip.recordIndex(this.bookFile.path, this.index);
		}
		if (this.session) {
			this.session.minIdx = Math.min(this.session.minIdx, this.index);
			this.session.maxIdx = Math.max(this.session.maxIdx, this.index);
		}
		this.progressBar?.setPosition(this.index, words.length);
		this.renderCard();
		if (this.plugin.settings.wordAutoPronounce && isSpeechSynthesisAvailable()) {
			this.speakCurrentWord(false);
		}
	}

	/**
	 * Finale card past the last word: session stats and a start-over
	 * button (a session, if active, keeps running — starting over does not
	 * open a new epoch; only a session started at word 1 does).
	 */
	private renderEndCard(): void {
		if (!this.endCardEl || !this.parsed) return;
		this.endCardShown = true;
		this.endCardEl.empty();
		this.endCardEl.addClass('is-visible');

		this.endCardEl.createDiv({
			cls: 'dial-word-flip-end-title',
			text: 'Book finished',
		});

		const statsEl = this.endCardEl.createDiv({ cls: 'dial-word-flip-end-stats' });
		if (this.session && this.bookFile) {
			const range = `${this.session.minIdx + 1} - ${this.session.maxIdx + 1}`;
			statsEl.createDiv({ text: `This session: words ${range}` });
			statsEl.createDiv({ text: `Marked this session: ${this.session.marksMade}` });
			const total = this.plugin.wordFlip.getMarkedWords(this.bookFile.path).length;
			statsEl.createDiv({ text: `Marked in this book: ${total}` });
		}

		const startOverEl = this.endCardEl.createEl('button', {
			cls: 'dial-word-flip-end-restart',
			text: 'Start over',
		});
		startOverEl.addEventListener('click', () => this.goToIndex(0));
	}

	private hideEndCard(): void {
		this.endCardShown = false;
		this.endCardEl?.removeClass('is-visible');
	}

	/** Live word preview while the progress bar is being dragged. */
	private showSeekPreview(index: number): void {
		if (!this.seekPreviewEl || !this.parsed) return;
		const entry = this.parsed.words[index];
		if (!entry) return;
		this.seekPreviewEl.empty();
		this.seekPreviewEl.createDiv({
			cls: 'dial-word-flip-seek-preview-index',
			text: `${index + 1} / ${this.parsed.words.length}`,
		});
		this.seekPreviewEl.createDiv({
			cls: 'dial-word-flip-seek-preview-word',
			text: entry.word,
		});
		this.seekPreviewEl.addClass('is-visible');
	}

	/** Release the seek: jump without a directional animation and hide the
	 *  preview (the card re-renders unrevealed). */
	private commitSeek(index: number): void {
		this.seekPreviewEl?.removeClass('is-visible');
		this.goToIndex(index);
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
		this.card.update(this.cardStateFor(this.index, entry));
		this.updateMarkButton();
	}

	private cardStateFor(index: number, entry: ParsedWordBook['words'][number]): WordFlipCardState {
		return {
			entry,
			index,
			total: this.parsed?.words.length ?? 0,
			revealed: this.revealed,
			marked:
				this.bookFile !== null &&
				this.plugin.wordFlip.isMarked(this.bookFile.path, entry.word),
			revealMode: this.plugin.settings.wordFlipRevealMode,
		};
	}

	private canGo(direction: 1 | -1): boolean {
		const words = this.parsed?.words;
		if (!words || words.length === 0) return false;
		return direction === 1 ? this.index < words.length - 1 : this.index > 0;
	}

	/**
	 * Finger-tracking phase: the current card follows the finger and the
	 * adjacent word slides in from the edge. At book boundaries the card
	 * moves with rubber-band resistance instead (30%).
	 */
	private handleDragMove(dy: number): void {
		if (!this.card || !this.neighborCard || !this.parsed || this.parsed.words.length === 0) {
			return;
		}
		const dir: 1 | -1 | 0 = dy < 0 ? 1 : dy > 0 ? -1 : 0;
		if (dir !== this.dragDir) {
			this.dragDir = dir;
			if (dir !== 0) this.renderNeighbor(dir);
		}

		this.card.rootEl.addClass('is-dragging');
		this.neighborCard.rootEl.addClass('is-dragging');

		if (dir !== 0 && this.canGo(dir)) {
			this.card.rootEl.style.transform = `translateY(${dy}px)`;
			const base = dir === 1 ? 100 : -100;
			this.neighborCard.rootEl.style.visibility = 'visible';
			this.neighborCard.rootEl.style.transform = `translateY(calc(${base}% + ${dy}px))`;
		} else {
			this.card.rootEl.style.transform = `translateY(${dy * 0.3}px)`;
			this.neighborCard.rootEl.style.visibility = 'hidden';
		}
	}

	/**
	 * Release phase: commit the swipe (current card exits, neighbor takes
	 * center, then content is swapped in) or spring everything back.
	 */
	private handleDragEnd(dy: number, commit: DragCommitDirection): void {
		if (!this.card || !this.neighborCard) return;
		const words = this.parsed?.words;
		if (!words || words.length === 0 || dy === 0) {
			this.clearDragStyles();
			return;
		}
		const effective = commit !== 0 && this.canGo(commit) ? commit : 0;

		this.card.rootEl.removeClass('is-dragging');
		this.neighborCard.rootEl.removeClass('is-dragging');

		if (effective !== 0 && this.dragDir === effective) {
			this.card.rootEl.style.transform =
				effective === 1 ? 'translateY(-100%)' : 'translateY(100%)';
			this.neighborCard.rootEl.style.transform = 'translateY(0)';
		} else {
			this.card.rootEl.style.transform = 'translateY(0)';
			if (this.dragDir !== 0) {
				this.neighborCard.rootEl.style.transform =
					this.dragDir === 1 ? 'translateY(100%)' : 'translateY(-100%)';
			}
		}

		const targetIndex = effective !== 0 ? this.index + effective : -1;
		this.dragDir = 0;
		window.setTimeout(() => {
			if (targetIndex >= 0) this.applyIndex(targetIndex);
			this.clearDragStyles();
		}, SWITCH_ANIMATION_MS + 20);
	}

	private clearDragStyles(): void {
		if (!this.card || !this.neighborCard) return;
		for (const el of [this.card.rootEl, this.neighborCard.rootEl]) {
			el.removeClass('is-dragging');
			el.style.transform = '';
		}
		this.neighborCard.rootEl.style.visibility = 'hidden';
	}

	private renderNeighbor(direction: 1 | -1): void {
		if (!this.neighborCard || !this.parsed) return;
		const target = this.index + direction;
		const entry = this.parsed.words[target];
		if (!entry) {
			this.neighborCard.rootEl.style.visibility = 'hidden';
			return;
		}
		this.neighborCard.update(this.cardStateFor(target, entry));
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

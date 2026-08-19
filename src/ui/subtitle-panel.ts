import { Notice, setIcon } from 'obsidian';

import type { ABLoopState, Subtitle } from '@/types';

import { formatTime } from '@/utils/time';

function formatSpeed(rate: number): string {
	return rate % 1 === 0 ? `${rate}x` : `${rate.toFixed(2)}x`;
}

export interface SubtitlePanelCallbacks {
	onSubtitleClick: (sub: Subtitle) => void;
	onSetA: (time: number) => ABLoopState;
	onSetB: (time: number) => ABLoopState;
	onClearAB: () => ABLoopState;
	onGetCurrentTime: () => number;
	onTogglePlay: () => void;
	onSpeedChange: (rate: number) => void;
}

/**
 * Reusable subtitle panel: AB controls + speed slider + subtitle list.
 * Used by SubtitleView (desktop) and VideoPlayerView (mobile).
 */
export class SubtitlePanel {
	readonly containerEl: HTMLElement;
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private abLoop: ABLoopState = { a: null, b: null, active: false };
	private subtitleEls: Map<number, HTMLElement> = new Map();
	private loopedSubtitleIds: Set<number> = new Set();

	private abStatusEl: HTMLElement | null = null;
	private btnClearEl: HTMLElement | null = null;
	private btnPlayPauseEl: HTMLElement | null = null;
	private speedLabel!: HTMLElement;
	private speedSlider!: HTMLInputElement;
	private subtitleContainerEl: HTMLElement | null = null;

	private searchInput!: HTMLInputElement;
	private searchCountEl: HTMLElement | null = null;
	private searchClearEl: HTMLElement | null = null;
	private searchEmptyEl: HTMLElement | null = null;
	private searchText = '';

	private callbacks: SubtitlePanelCallbacks | null = null;
	private playbackRate = 1;

	private mobileLayoutAbortController: AbortController | null = null;
	private mobileViewportHandler: (() => void) | null = null;

	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({ cls: 'dial-subtitle-panel' });
		this.buildUI();
	}

	setCallbacks(callbacks: SubtitlePanelCallbacks): void {
		this.callbacks = callbacks;
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
		this.renderSubtitles();
	}

	setCurrentSubtitle(id: number): void {
		if (id === this.currentSubtitleId) return;

		const oldEl = this.subtitleEls.get(this.currentSubtitleId);
		oldEl?.removeClass('dial-subtitle-active');

		this.currentSubtitleId = id;
		const newEl = this.subtitleEls.get(id);
		if (newEl) {
			newEl.addClass('dial-subtitle-active');
			newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	setPlayState(isPlaying: boolean): void {
		if (this.btnPlayPauseEl) {
			setIcon(this.btnPlayPauseEl, isPlaying ? 'pause' : 'play');
		}
	}

	setABLoopState(state: ABLoopState): void {
		this.abLoop = state;
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	getCurrentSubtitleId(): number {
		return this.currentSubtitleId;
	}

	getSubtitles(): Subtitle[] {
		return this.subtitles;
	}

	changeSpeed(delta: number): void {
		const newRate = Math.max(0.25, Math.min(3, this.playbackRate + delta));
		this.setSpeed(newRate);
	}

	setSpeed(rate: number): void {
		this.playbackRate = rate;
		this.speedSlider.value = String(rate);
		this.speedLabel.textContent = formatSpeed(rate);
		this.callbacks?.onSpeedChange(rate);
	}

	/** Focus the search input and select its content for quick retyping. */
	focusSearch(): void {
		this.searchInput.focus();
		this.searchInput.select();
	}

	/**
	 * Clear the search query and restore the full list.
	 * Does not move focus on its own; the clear button calls this and then
	 * refocuses the input.
	 */
	clearSearch(): void {
		this.searchInput.value = '';
		this.searchText = '';
		this.applySearchFilter();
	}

	/**
	 * Mobile-only: while the search box is focused, pin the container's
	 * height to the visible viewport (which shrinks when the soft keyboard
	 * appears) and replace the black video background with the theme color.
	 * Uses the visualViewport API because `100dvh` and CSS variable
	 * substitution are unreliable in some mobile webviews.
	 */
	private beginMobileSearchLayout(): void {
		const closest = this.searchInput.closest('.dial-video-container');
		const container = closest instanceof HTMLElement ? closest : null;
		if (!container) return;

		// Resolve the theme background to a literal color string, so we don't
		// depend on `var(...)` resolving inside an inline style on some webviews.
		const themeBg =
			getComputedStyle(document.documentElement)
				.getPropertyValue('--background-primary')
				.trim() ||
			getComputedStyle(document.body).getPropertyValue('--background-primary').trim();

		// Some Android webviews (e.g. Honor's MagicOS fork) report the LAYOUT
		// viewport through visualViewport.height — it never shrinks when the
		// soft keyboard opens. window.innerHeight does shrink there (Obsidian
		// mobile uses adjustResize), so take the smaller of the two: whichever
		// source is honest wins.
		const visibleHeight = (): number => {
			const vv = window.visualViewport?.height ?? Infinity;
			const inner = window.innerHeight > 0 ? window.innerHeight : Infinity;
			return Math.min(vv, inner);
		};

		const apply = () => {
			const h = visibleHeight();
			if (!Number.isFinite(h) || h <= 0) return;
			container.style.setProperty('--dial-mobile-h', `${h}px`);
		};
		this.mobileViewportHandler = apply;
		apply();
		if (themeBg) container.style.setProperty('--dial-mobile-bg', themeBg);
		// visualViewport.resize does not always fire for soft-keyboard changes
		// on those webviews; the window resize event is the reliable backup.
		window.visualViewport?.addEventListener('resize', apply);
		window.addEventListener('resize', apply);
	}

	private endMobileSearchLayout(): void {
		if (this.mobileViewportHandler) {
			window.visualViewport?.removeEventListener('resize', this.mobileViewportHandler);
			window.removeEventListener('resize', this.mobileViewportHandler);
			this.mobileViewportHandler = null;
		}
		const closest = this.searchInput.closest('.dial-video-container');
		const container = closest instanceof HTMLElement ? closest : null;
		if (!container) return;
		container.style.removeProperty('--dial-mobile-h');
		container.style.removeProperty('--dial-mobile-bg');
	}

	/** Clean up all focus/blur + visualViewport listeners. Call from onClose. */
	detachMobileLayout(): void {
		this.mobileLayoutAbortController?.abort();
		this.mobileLayoutAbortController = null;
		this.endMobileSearchLayout();
	}

	private buildUI(): void {
		// AB controls
		const controlsEl = this.containerEl.createDiv({ cls: 'dial-ab-controls' });

		this.btnPlayPauseEl = controlsEl.createEl('button', {
			cls: 'dial-ab-btn dial-ab-btn-play',
		});
		setIcon(this.btnPlayPauseEl, 'play');
		this.btnPlayPauseEl.addEventListener('click', () => {
			this.callbacks?.onTogglePlay();
		});

		const btnA = controlsEl.createEl('button', {
			text: 'A',
			cls: 'dial-ab-btn dial-ab-btn-a',
		});
		btnA.addEventListener('click', () => this.handleSetA());

		const btnB = controlsEl.createEl('button', {
			text: 'B',
			cls: 'dial-ab-btn dial-ab-btn-b',
		});
		btnB.addEventListener('click', () => this.handleSetB());

		this.btnClearEl = controlsEl.createEl('button', {
			text: 'AB',
			cls: 'dial-ab-btn dial-ab-btn-clear',
		});
		this.btnClearEl.addEventListener('click', () => this.handleToggleAB());

		this.abStatusEl = controlsEl.createDiv({
			cls: 'dial-ab-status',
			text: 'No loop set',
		});

		// Speed controls
		const speedEl = this.containerEl.createDiv({ cls: 'dial-speed-controls' });

		this.speedLabel = speedEl.createSpan({
			cls: 'dial-speed-label',
			text: '1x',
		});

		this.speedSlider = speedEl.createEl('input', {
			cls: 'dial-speed-slider',
			type: 'range',
			attr: { min: '0.25', max: '3', step: '0.25', value: '1' },
		});
		this.speedSlider.addEventListener('input', () => {
			const rate = parseFloat(this.speedSlider.value);
			this.playbackRate = rate;
			this.speedLabel.textContent = formatSpeed(rate);
			this.callbacks?.onSpeedChange(rate);
		});

		// Subtitle search bar
		const searchEl = this.containerEl.createDiv({ cls: 'dial-subtitle-search' });

		this.searchInput = searchEl.createEl('input', {
			cls: 'dial-subtitle-search-input',
			type: 'text',
			attr: {
				placeholder: 'Search subtitles',
				'aria-label': 'Search subtitles',
				spellcheck: 'false',
			},
		});
		this.searchInput.addEventListener('input', () => {
			this.searchText = this.searchInput.value;
			this.applySearchFilter();
		});

		// Mobile-only: react to the soft keyboard via the visualViewport API so
		// the list fills the visible area. CSS `:has(:focus)` / `100dvh` are
		// unreliable on some iOS webviews, so we set the container height and
		// theme background directly from JS when the search box is focused.
		this.mobileLayoutAbortController = new AbortController();
		this.searchInput.addEventListener('focus', () => this.beginMobileSearchLayout(), {
			signal: this.mobileLayoutAbortController.signal,
		});
		this.searchInput.addEventListener('blur', () => this.endMobileSearchLayout(), {
			signal: this.mobileLayoutAbortController.signal,
		});

		// One-click clear button; visible only while a search is active
		this.searchClearEl = searchEl.createEl('button', {
			cls: 'dial-subtitle-search-clear dial-subtitle-hidden',
			attr: { 'aria-label': 'Clear search' },
		});
		setIcon(this.searchClearEl, 'x');
		this.searchClearEl.addEventListener('click', () => {
			this.clearSearch();
			// Intentionally do NOT refocus the input: on mobile this would
			// re-pop the soft keyboard right after the user dismissed it to
			// read results. On desktop, the user can press s to refocus or
			// click the input again.
		});

		this.searchCountEl = searchEl.createSpan({
			cls: 'dial-subtitle-search-count',
			text: '',
		});

		// Subtitle list
		this.subtitleContainerEl = this.containerEl.createDiv({
			cls: 'dial-subtitle-list',
		});

		// Empty state shown when a search matches nothing
		this.searchEmptyEl = this.containerEl.createDiv({
			cls: 'dial-subtitle-empty dial-subtitle-hidden',
			text: 'No matching subtitles',
		});
	}

	private renderSubtitles(): void {
		if (!this.subtitleContainerEl) return;
		this.subtitleContainerEl.empty();
		this.subtitleEls.clear();

		for (const sub of this.subtitles) {
			const el = this.subtitleContainerEl.createDiv({
				cls: 'dial-subtitle-item',
			});

			el.createSpan({
				cls: 'dial-subtitle-time',
				text: formatTime(sub.start),
			});

			el.createSpan({
				cls: 'dial-subtitle-text',
				text: sub.text,
			});

			el.addEventListener('click', () => {
				this.callbacks?.onSubtitleClick(sub);
			});

			this.subtitleEls.set(sub.id, el);
		}

		this.applySearchFilter();
	}

	/**
	 * Filter the subtitle list by the current search text (case-insensitive).
	 * Non-matching rows are hidden via CSS instead of being removed, so the
	 * active highlight and AB loop markers keep working; clearing the search
	 * box restores the full list.
	 */
	private applySearchFilter(): void {
		const query = this.searchText.trim().toLowerCase();
		let matches = 0;

		for (const sub of this.subtitles) {
			const el = this.subtitleEls.get(sub.id);
			if (!el) continue;
			const hit = query === '' || sub.text.toLowerCase().includes(query);
			el.toggleClass('dial-subtitle-hidden', !hit);
			if (hit) matches++;
		}

		if (this.searchCountEl) {
			this.searchCountEl.textContent =
				query === '' ? '' : `${matches}/${this.subtitles.length}`;
		}

		this.searchClearEl?.toggleClass('dial-subtitle-hidden', query === '');

		if (this.searchEmptyEl) {
			const showEmpty = query !== '' && matches === 0 && this.subtitles.length > 0;
			this.searchEmptyEl.toggleClass('dial-subtitle-hidden', !showEmpty);
		}
	}

	private updateLoopHighlight(): void {
		for (const id of this.loopedSubtitleIds) {
			this.subtitleEls.get(id)?.removeClass('dial-subtitle-looped');
		}
		this.loopedSubtitleIds.clear();

		if (!this.abLoop.active || this.abLoop.a === null || this.abLoop.b === null) return;

		for (const sub of this.subtitles) {
			if (sub.start >= this.abLoop.a && sub.end <= this.abLoop.b) {
				this.loopedSubtitleIds.add(sub.id);
				this.subtitleEls.get(sub.id)?.addClass('dial-subtitle-looped');
			}
		}
	}

	handleSetA(): void {
		if (!this.callbacks) return;
		if (this.abLoop.active) {
			new Notice('Loop active — click ab button to cancel');
			return;
		}
		const sub = this.getCurrentSubtitle();
		const time = sub?.start ?? this.callbacks.onGetCurrentTime();
		this.abLoop = this.callbacks.onSetA(time);
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	handleSetB(): void {
		if (!this.callbacks) return;
		if (this.abLoop.active) {
			new Notice('Loop active — click ab button to cancel');
			return;
		}
		const sub = this.getCurrentSubtitle();
		const time = sub?.end ?? this.callbacks.onGetCurrentTime();
		this.abLoop = this.callbacks.onSetB(time);
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	handleToggleAB(): void {
		if (!this.callbacks) return;
		if (this.abLoop.active) {
			this.abLoop = this.callbacks.onClearAB();
		} else {
			const sub = this.subtitles.find((s) => s.id === this.currentSubtitleId);
			if (sub) {
				this.abLoop = this.callbacks.onSetA(sub.start);
				this.abLoop = this.callbacks.onSetB(sub.end);
			}
		}
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	private getCurrentSubtitle(): Subtitle | null {
		return this.subtitles.find((s) => s.id === this.currentSubtitleId) ?? null;
	}

	private updateABDisplay(): void {
		if (!this.abStatusEl) return;

		if (this.abLoop.active && this.abLoop.a !== null && this.abLoop.b !== null) {
			this.abStatusEl.textContent = `${formatTime(this.abLoop.a)} - ${formatTime(this.abLoop.b)}`;
			this.abStatusEl.addClass('dial-ab-status-active');
			this.btnClearEl?.addClass('dial-ab-btn-active');
		} else if (this.abLoop.a !== null) {
			this.abStatusEl.textContent = `A: ${formatTime(this.abLoop.a)} — set B`;
			this.abStatusEl.removeClass('dial-ab-status-active');
			this.btnClearEl?.removeClass('dial-ab-btn-active');
		} else {
			this.abStatusEl.textContent = 'No loop set';
			this.abStatusEl.removeClass('dial-ab-status-active');
			this.btnClearEl?.removeClass('dial-ab-btn-active');
		}
	}
}

import { Notice, setIcon } from 'obsidian';

import type { ABLoopState, Subtitle, SubtitlePanelVisibility } from '@/types';

import { formatTime } from '@/utils/time';

import { SubtitleSearchController } from './subtitle-search';

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
	private speedLabel: HTMLElement | null = null;
	private speedSlider: HTMLInputElement | null = null;
	private subtitleContainerEl: HTMLElement | null = null;

	private search: SubtitleSearchController | null = null;

	private visibility: SubtitlePanelVisibility;
	private callbacks: SubtitlePanelCallbacks | null = null;
	private playbackRate = 1;
	/** Tracks the last reported play state so it can be restored after a rebuild. */
	private isPlaying = false;

	constructor(parent: HTMLElement, visibility?: SubtitlePanelVisibility) {
		this.containerEl = parent.createDiv({ cls: 'dial-subtitle-panel' });
		this.visibility = visibility ?? { abLoop: true, speed: true, search: true };
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
		this.isPlaying = isPlaying;
		if (this.btnPlayPauseEl) {
			setIcon(this.btnPlayPauseEl, isPlaying ? 'pause' : 'play');
		}
	}

	/**
	 * Re-render the panel with updated control visibility.
	 *
	 * The AB controls, speed slider, and search box are conditionally created
	 * in {@link buildUI}, so changing visibility requires rebuilding the panel
	 * DOM. This tears down the old subtree, rebuilds it, and re-hydrates the
	 * current subtitles, AB loop state, speed, active line, and play icon so
	 * the update is immediate — no need to close and reopen the view.
	 *
	 * The active subtitle search query is not carried over (the search
	 * controller is recreated); subtitle data and loop state are preserved.
	 */
	setVisibility(visibility: SubtitlePanelVisibility): void {
		this.visibility = visibility;
		// Release the old search controller's mobile listeners before its DOM
		// is discarded by containerEl.empty().
		this.search?.detachMobileLayout();
		this.search = null;

		this.containerEl.empty();
		// Reset all element refs so stale pointers are never reused post-rebuild.
		this.abStatusEl = null;
		this.btnClearEl = null;
		this.btnPlayPauseEl = null;
		this.speedLabel = null;
		this.speedSlider = null;
		this.subtitleContainerEl = null;
		this.subtitleEls.clear();
		this.loopedSubtitleIds.clear();

		this.buildUI();

		// Re-hydrate state onto the freshly built DOM.
		if (this.subtitles.length > 0) {
			this.renderSubtitles();
			// Restore the active-line highlight without scrolling: the user is
			// interacting with settings, not the panel, so a scrollIntoView
			// here would be surprising.
			if (this.currentSubtitleId >= 0) {
				this.subtitleEls.get(this.currentSubtitleId)?.addClass('dial-subtitle-active');
			}
		}
		this.updateABDisplay();
		this.updateLoopHighlight();
		if (this.btnPlayPauseEl) {
			setIcon(this.btnPlayPauseEl, this.isPlaying ? 'pause' : 'play');
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
		if (!this.speedSlider || !this.speedLabel) return;
		this.playbackRate = rate;
		this.speedSlider.value = String(rate);
		this.speedLabel.textContent = formatSpeed(rate);
		this.callbacks?.onSpeedChange(rate);
	}

	/** Focus the search input and select its content for quick retyping. */
	focusSearch(): void {
		this.search?.focus();
	}

	/** Clear the search query and restore the full list. */
	clearSearch(): void {
		this.search?.clear();
	}

	/** True while the mobile full-screen search overlay is active. */
	isMobileSearchOverlayActive(): boolean {
		return this.search?.isMobileOverlayActive() ?? false;
	}

	/** Clean up all focus/blur listeners and restore the normal layout. */
	detachMobileLayout(): void {
		this.search?.detachMobileLayout();
	}

	private buildUI(): void {
		// AB controls — only when enabled by settings.
		if (this.visibility.abLoop) {
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
		}

		// Speed controls — only when enabled by settings.
		if (this.visibility.speed) {
			const speedEl = this.containerEl.createDiv({ cls: 'dial-speed-controls' });

			const speedLabel = speedEl.createSpan({
				cls: 'dial-speed-label',
				text: formatSpeed(this.playbackRate),
			});
			this.speedLabel = speedLabel;

			const speedSlider = speedEl.createEl('input', {
				cls: 'dial-speed-slider',
				type: 'range',
				attr: { min: '0.25', max: '3', step: '0.25', value: String(this.playbackRate) },
			});
			this.speedSlider = speedSlider;
			speedSlider.addEventListener('input', () => {
				const rate = parseFloat(speedSlider.value);
				this.playbackRate = rate;
				speedLabel.textContent = formatSpeed(rate);
				this.callbacks?.onSpeedChange(rate);
			});
		}

		// Subtitle search bar — only when enabled by settings.
		if (this.visibility.search) {
			this.search = new SubtitleSearchController({
				panelEl: this.containerEl,
				parent: this.containerEl,
				deps: {
					getSubtitles: () => this.subtitles,
					getSubtitleEls: () => this.subtitleEls,
				},
			});
		}

		// Subtitle list
		this.subtitleContainerEl = this.containerEl.createDiv({
			cls: 'dial-subtitle-list',
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
				// On mobile, tapping a match also drops the full-screen search
				// overlay and dismisses the keyboard, so the user can watch the
				// video jump to that line. On desktop this is a no-op.
				if (this.search?.isMobileOverlayActive()) {
					this.search.blurInput();
				}
			});

			this.subtitleEls.set(sub.id, el);
		}

		this.search?.applyFilter();
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
		if (!this.abStatusEl) return;
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
		if (!this.abStatusEl) return;
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
		if (!this.abStatusEl) return;
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

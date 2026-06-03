import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';

import type { ABLoopState, Subtitle } from '@/types';

import { formatTime } from '@/utils/time';

function formatSpeed(rate: number): string {
	return rate % 1 === 0 ? `${rate}x` : `${rate.toFixed(2)}x`;
}

export const SUBTITLE_VIEW_TYPE = 'dial-subtitle';

interface SubtitleViewCallbacks {
	onSubtitleClick: (sub: Subtitle) => void;
	onSetA: (time: number) => ABLoopState;
	onSetB: (time: number) => ABLoopState;
	onClearAB: () => ABLoopState;
	onGetCurrentTime: () => number;
	onTogglePlay: () => void;
	onJumpPrev: () => void;
	onJumpNext: () => void;
	onSpeedChange: (rate: number) => void;
	onSeek: (delta: number) => void;
	onVolumeChange: (delta: number) => void;
	onToggleMute: () => void;
}

export class SubtitleView extends ItemView {
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private abLoop: ABLoopState = { a: null, b: null, active: false };
	private subtitleContainerEl: HTMLElement | null = null;
	private abStatusEl: HTMLElement | null = null;
	private btnClearEl: HTMLElement | null = null;
	private btnPlayPauseEl: HTMLElement | null = null;
	private subtitleEls: Map<number, HTMLElement> = new Map();
	private loopedSubtitleIds: Set<number> = new Set();
	private keyHandler: ((e: KeyboardEvent) => void) | null = null;

	private callbacks: SubtitleViewCallbacks | null = null;
	private playbackRate = 1;
	private speedLabel!: HTMLElement;
	private speedSlider!: HTMLInputElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return SUBTITLE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Subtitles';
	}

	getIcon(): string {
		return 'subtitles';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass('dial-subtitle-container');
		(container as HTMLElement).setAttribute('tabindex', '-1');

		// AB controls
		const controlsEl = container.createDiv({
			cls: 'dial-ab-controls',
		});

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
		btnA.addEventListener('click', () => {
			this.handleSetA();
		});

		const btnB = controlsEl.createEl('button', {
			text: 'B',
			cls: 'dial-ab-btn dial-ab-btn-b',
		});
		btnB.addEventListener('click', () => {
			this.handleSetB();
		});

		this.btnClearEl = controlsEl.createEl('button', {
			text: 'AB',
			cls: 'dial-ab-btn dial-ab-btn-clear',
		});
		this.btnClearEl.addEventListener('click', () => {
			this.handleToggleAB();
		});

		this.abStatusEl = controlsEl.createDiv({
			cls: 'dial-ab-status',
			text: 'No loop set',
		});

		// Speed controls
		const speedEl = container.createDiv({
			cls: 'dial-speed-controls',
		});

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

		// Subtitle list
		this.subtitleContainerEl = container.createDiv({
			cls: 'dial-subtitle-list',
		});

		// Keyboard shortcuts
		this.keyHandler = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				e.preventDefault();
				this.callbacks?.onTogglePlay();
			} else if (e.code === 'ArrowLeft') {
				e.preventDefault();
				this.callbacks?.onJumpPrev();
			} else if (e.code === 'ArrowRight') {
				e.preventDefault();
				this.callbacks?.onJumpNext();
			} else if (e.code === 'ArrowUp') {
				e.preventDefault();
				this.callbacks?.onVolumeChange(0.05);
			} else if (e.code === 'ArrowDown') {
				e.preventDefault();
				this.callbacks?.onVolumeChange(-0.05);
			} else if (e.code === 'KeyM') {
				e.preventDefault();
				this.callbacks?.onToggleMute();
			} else if (e.code === 'KeyZ') {
				e.preventDefault();
				this.handleSetA();
			} else if (e.code === 'KeyX') {
				e.preventDefault();
				this.handleSetB();
			} else if (e.code === 'KeyC') {
				e.preventDefault();
				this.handleToggleAB();
			} else if (e.code === 'BracketRight') {
				e.preventDefault();
				this.changeSpeed(0.25);
			} else if (e.code === 'BracketLeft') {
				e.preventDefault();
				this.changeSpeed(-0.25);
			} else if (e.code === 'KeyJ') {
				e.preventDefault();
				this.callbacks?.onSeek(-30);
			} else if (e.code === 'KeyL') {
				e.preventDefault();
				this.callbacks?.onSeek(30);
			} else if (e.code === 'Backslash') {
				e.preventDefault();
				this.setSpeed(1);
			}
		};
		(container as HTMLElement).addEventListener('keydown', this.keyHandler);
		container.addEventListener('click', () => {
			(container as HTMLElement).focus();
		});

		// Re-focus container when tab-switching back to this view
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) {
					(container as HTMLElement).focus();
				}
			}),
		);
		(container as HTMLElement).focus();
	}

	async onClose(): Promise<void> {
		if (this.keyHandler) {
			const container = this.containerEl.children[1];
			(container as HTMLElement | undefined)?.removeEventListener('keydown', this.keyHandler);
			this.keyHandler = null;
		}
		this.subtitleContainerEl = null;
		this.abStatusEl = null;
		this.btnPlayPauseEl = null;
		this.subtitleEls.clear();
	}

	setPlayState(isPlaying: boolean): void {
		if (this.btnPlayPauseEl) {
			setIcon(this.btnPlayPauseEl, isPlaying ? 'pause' : 'play');
		}
	}

	getSubtitles(): Subtitle[] {
		return this.subtitles;
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
		this.renderSubtitles();
	}

	setABLoopState(state: ABLoopState): void {
		this.abLoop = state;
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	toggleAbLoop(): void {
		this.handleToggleAB();
	}

	setCurrentSubtitle(id: number): void {
		if (id === this.currentSubtitleId) return;

		// Remove old highlight
		const oldEl = this.subtitleEls.get(this.currentSubtitleId);
		oldEl?.removeClass('dial-subtitle-active');

		// Add new highlight
		this.currentSubtitleId = id;
		const newEl = this.subtitleEls.get(id);
		if (newEl) {
			newEl.addClass('dial-subtitle-active');
			newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	setCallbacks(callbacks: SubtitleViewCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): Record<string, unknown> {
		return { subtitles: this.subtitles };
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { subtitles } = state as { subtitles: Subtitle[] | undefined };
		if (subtitles) {
			this.setSubtitles(subtitles);
		}
	}

	private handleSetA(): void {
		if (!this.callbacks) return;
		const sub = this.getCurrentSubtitle();
		const time = sub?.start ?? this.callbacks.onGetCurrentTime();
		this.abLoop = this.callbacks.onSetA(time);
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	private handleSetB(): void {
		if (!this.callbacks) return;
		const sub = this.getCurrentSubtitle();
		const time = sub?.end ?? this.callbacks.onGetCurrentTime();
		this.abLoop = this.callbacks.onSetB(time);
		this.updateABDisplay();
		this.updateLoopHighlight();
	}

	private handleToggleAB(): void {
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

	private changeSpeed(delta: number): void {
		const newRate = Math.max(0.25, Math.min(3, this.playbackRate + delta));
		this.setSpeed(newRate);
	}

	private setSpeed(rate: number): void {
		this.playbackRate = rate;
		this.speedSlider.value = String(rate);
		this.speedLabel.textContent = formatSpeed(rate);
		this.callbacks?.onSpeedChange(rate);
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
	}

	private updateLoopHighlight(): void {
		// Remove old highlights
		for (const id of this.loopedSubtitleIds) {
			this.subtitleEls.get(id)?.removeClass('dial-subtitle-looped');
		}
		this.loopedSubtitleIds.clear();

		if (!this.abLoop.active || this.abLoop.a === null || this.abLoop.b === null) return;

		// Highlight all subtitles within A-B range
		for (const sub of this.subtitles) {
			if (sub.start >= this.abLoop.a && sub.end <= this.abLoop.b) {
				this.loopedSubtitleIds.add(sub.id);
				this.subtitleEls.get(sub.id)?.addClass('dial-subtitle-looped');
			}
		}
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

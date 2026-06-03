import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { ABLoopState, Subtitle } from '@/types';

import { SubtitlePanel, type SubtitlePanelCallbacks } from './subtitle-panel';

export const SUBTITLE_VIEW_TYPE = 'dial-subtitle';

export interface SubtitleViewCallbacks extends SubtitlePanelCallbacks {
	onJumpPrev: () => void;
	onJumpNext: () => void;
	onSeek: (delta: number) => void;
	onVolumeChange: (delta: number) => void;
	onToggleMute: () => void;
}

export class SubtitleView extends ItemView {
	private panel: SubtitlePanel | null = null;
	private callbacks: SubtitleViewCallbacks | null = null;
	private keyHandler: ((e: KeyboardEvent) => void) | null = null;

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

		this.panel = new SubtitlePanel(container as HTMLElement);
		this.panel.setCallbacks({
			onSubtitleClick: (sub) => this.callbacks?.onSubtitleClick(sub),
			onSetA: (time) => this.callbacks!.onSetA(time),
			onSetB: (time) => this.callbacks!.onSetB(time),
			onClearAB: () => this.callbacks!.onClearAB(),
			onGetCurrentTime: () => this.callbacks!.onGetCurrentTime(),
			onTogglePlay: () => this.callbacks!.onTogglePlay(),
			onSpeedChange: (rate) => this.callbacks!.onSpeedChange(rate),
		});

		// Keyboard shortcuts (desktop only)
		this.keyHandler = (e: KeyboardEvent) => {
			if (!this.callbacks) return;
			if (e.code === 'Space') {
				e.preventDefault();

				this.callbacks.onTogglePlay();
			} else if (e.code === 'ArrowLeft') {
				e.preventDefault();
				this.callbacks.onJumpPrev();
			} else if (e.code === 'ArrowRight') {
				e.preventDefault();
				this.callbacks.onJumpNext();
			} else if (e.code === 'ArrowUp') {
				e.preventDefault();
				this.callbacks.onVolumeChange(0.05);
			} else if (e.code === 'ArrowDown') {
				e.preventDefault();
				this.callbacks.onVolumeChange(-0.05);
			} else if (e.code === 'KeyM') {
				e.preventDefault();
				this.callbacks.onToggleMute();
			} else if (e.code === 'KeyZ') {
				e.preventDefault();
				this.panel?.handleSetA();
			} else if (e.code === 'KeyX') {
				e.preventDefault();
				this.panel?.handleSetB();
			} else if (e.code === 'KeyC') {
				e.preventDefault();
				this.panel?.handleToggleAB();
			} else if (e.code === 'BracketRight') {
				e.preventDefault();
				this.panel?.changeSpeed(0.25);
			} else if (e.code === 'BracketLeft') {
				e.preventDefault();
				this.panel?.changeSpeed(-0.25);
			} else if (e.code === 'KeyJ') {
				e.preventDefault();
				this.callbacks.onSeek(-30);
			} else if (e.code === 'KeyL') {
				e.preventDefault();
				this.callbacks.onSeek(30);
			} else if (e.code === 'Backslash') {
				e.preventDefault();
				this.panel?.setSpeed(1);
			}
		};
		(container as HTMLElement).addEventListener('keydown', this.keyHandler);
		container.addEventListener('click', () => {
			(container as HTMLElement).focus();
		});

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
		this.panel = null;
	}

	setPlayState(isPlaying: boolean): void {
		this.panel?.setPlayState(isPlaying);
	}

	getSubtitles(): Subtitle[] {
		return this.panel?.getSubtitles() ?? [];
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.panel?.setSubtitles(subtitles);
	}

	setABLoopState(state: ABLoopState): void {
		this.panel?.setABLoopState(state);
	}

	toggleAbLoop(): void {
		this.panel?.handleToggleAB();
	}

	setCurrentSubtitle(id: number): void {
		this.panel?.setCurrentSubtitle(id);
	}

	setCallbacks(callbacks: SubtitleViewCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): Record<string, unknown> {
		return { subtitles: this.panel?.getSubtitles() ?? [] };
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { subtitles } = state as { subtitles: Subtitle[] | undefined };
		if (subtitles) {
			this.setSubtitles(subtitles);
		}
	}
}

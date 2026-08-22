import { ItemView, WorkspaceLeaf } from 'obsidian';

import type DialPlugin from '@/main';
import type { ABLoopState, Subtitle, SubtitlePanelVisibility } from '@/types';

import { subtitlePanelVisibility } from '@/settings';

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
	private plugin?: DialPlugin;

	constructor(leaf: WorkspaceLeaf, plugin?: DialPlugin) {
		super(leaf);
		this.plugin = plugin;
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

		this.panel = new SubtitlePanel(
			container as HTMLElement,
			this.plugin ? subtitlePanelVisibility(this.plugin.settings) : undefined,
		);
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
			// Escape leaves the search box and returns focus to the panel
			if (e.key === 'Escape' && e.target instanceof HTMLInputElement) {
				e.preventDefault();
				e.target.blur();
				(container as HTMLElement).focus();
				return;
			}
			// Skip shortcuts while typing in an input (e.g. the subtitle search box)
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}
			if (e.code === 'KeyS') {
				e.preventDefault();
				this.panel?.focusSearch();
			} else if (e.code === 'KeyD') {
				// Clear the search while the panel (not the search box) has
				// focus: with the search box focused, d types the letter.
				e.preventDefault();
				this.panel?.clearSearch();
			} else if (e.code === 'Space') {
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
		container.addEventListener('click', (e) => {
			// Do not steal focus from interactive elements in the search bar
			// (input and clear button): native focus happens before this
			// bubbled click, and focusing the container here would blur them.
			if (e.target instanceof HTMLElement && e.target.closest('.dial-subtitle-search')) {
				return;
			}
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
		this.panel?.detachMobileLayout();
		this.panel = null;
	}

	setPlayState(isPlaying: boolean): void {
		this.panel?.setPlayState(isPlaying);
	}

	/** Re-render the embedded panel with updated control visibility. */
	updateVisibility(visibility: SubtitlePanelVisibility): void {
		this.panel?.setVisibility(visibility);
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

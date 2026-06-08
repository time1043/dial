import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Subtitle } from '@/types';

import { TypeSubtitlePanel, type TypeSubtitlePanelCallbacks } from './type-subtitle-panel';

export const TYPE_SUBTITLE_VIEW_TYPE = 'dial-type-subtitle';

export class TypeSubtitleView extends ItemView {
	private panel: TypeSubtitlePanel | null = null;
	private callbacks: TypeSubtitlePanelCallbacks | null = null;
	private keyHandler: ((e: KeyboardEvent) => void) | null = null;

	// Pending state from setState (runs before onOpen on reload)
	private pendingSubtitles: Subtitle[] | null = null;
	private pendingRevealed: number[] = [];
	private pendingCurrentIndex = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return TYPE_SUBTITLE_VIEW_TYPE;
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
		container.addClass('dial-type-subtitle-container');
		(container as HTMLElement).setAttribute('tabindex', '-1');

		this.panel = new TypeSubtitlePanel(container as HTMLElement);

		// Restore from workspace state (setState runs before onOpen)
		if (this.pendingSubtitles) {
			this.panel.setSubtitles(this.pendingSubtitles);
			this.panel.setCurrentIndex(this.pendingCurrentIndex);
			for (const i of this.pendingRevealed) {
				this.panel.revealSentence(i);
			}
			this.pendingSubtitles = null;
		}

		// Speed shortcuts: [ and ]
		this.keyHandler = (e: KeyboardEvent) => {
			if (e.code === 'BracketRight') {
				e.preventDefault();
				this.panel?.changeSpeed(0.25);
			} else if (e.code === 'BracketLeft') {
				e.preventDefault();
				this.panel?.changeSpeed(-0.25);
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

	setCallbacks(cb: TypeSubtitlePanelCallbacks): void {
		this.callbacks = cb;
		this.panel?.setCallbacks(cb);
	}

	hasData(): boolean {
		return this.panel?.hasData() ?? false;
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.panel?.setSubtitles(subtitles);
	}

	setCurrentIndex(index: number): void {
		this.panel?.setCurrentIndex(index);
	}

	revealSentence(index: number): void {
		this.panel?.revealSentence(index);
	}

	getCurrentIndex(): number {
		return this.panel?.getCurrentIndex() ?? 0;
	}

	getRevealed(): number[] {
		return this.panel?.getRevealed() ?? [];
	}

	getSubtitles(): Subtitle[] {
		return this.panel?.getSubtitles() ?? [];
	}

	getState(): Record<string, unknown> {
		if (!this.panel) return {};
		return {
			subtitles: this.panel.getSubtitles(),
			revealed: this.panel.getRevealed(),
			currentIndex: this.panel.getCurrentIndex(),
		};
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { subtitles, revealed, currentIndex } = state as {
			subtitles?: Subtitle[];
			revealed?: number[];
			currentIndex?: number;
		};
		if (subtitles) {
			this.pendingSubtitles = subtitles;
			this.pendingRevealed = revealed ?? [];
			this.pendingCurrentIndex = currentIndex ?? 0;
		}
	}
}

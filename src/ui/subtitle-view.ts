import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Subtitle } from '@/types';

import { formatTime } from '@/utils/time';

export const SUBTITLE_VIEW_TYPE = 'dial-subtitle';

export class SubtitleView extends ItemView {
	private subtitles: Subtitle[] = [];
	private currentSubtitleId: number = -1;
	private subtitleContainerEl: HTMLElement | null = null;
	private subtitleEls: Map<number, HTMLElement> = new Map();

	// Callbacks
	private onSubtitleClick: ((sub: Subtitle) => void) | null = null;

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

		// Subtitle list
		this.subtitleContainerEl = container.createDiv({
			cls: 'dial-subtitle-list',
		});
	}

	async onClose(): Promise<void> {
		this.subtitleContainerEl = null;
		this.subtitleEls.clear();
	}

	setSubtitles(subtitles: Subtitle[]): void {
		this.subtitles = subtitles;
		this.renderSubtitles();
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

	setCallbacks(opts: { onSubtitleClick: (sub: Subtitle) => void }): void {
		this.onSubtitleClick = opts.onSubtitleClick;
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
				this.onSubtitleClick?.(sub);
			});

			this.subtitleEls.set(sub.id, el);
		}
	}
}

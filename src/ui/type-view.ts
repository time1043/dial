import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Subtitle, TypeSessionData } from '@/types';

import { applySplitRatio } from '@/utils/layout';

import { TypePanel, type TypePanelCallbacks } from './type-panel';

export const TYPE_VIEW_TYPE = 'dial-type';

export class TypeView extends ItemView {
	private panel: TypePanel | null = null;
	private callbacks: TypePanelCallbacks | null = null;

	// Persisted via Obsidian's native getState/setState (workspace.json).
	// Stored on loadSession and updated on every save via updateSession.
	private savedSubtitles: Subtitle[] | null = null;
	private savedSession: TypeSessionData | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return TYPE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Type';
	}

	getIcon(): string {
		return 'keyboard';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass('dial-type-container');

		this.panel = new TypePanel(container as HTMLElement);
		if (this.callbacks) {
			this.panel.setCallbacks(this.callbacks);
		}

		// Restore from workspace state (setState runs before onOpen)
		if (this.savedSubtitles && this.savedSession) {
			this.panel.load(this.savedSubtitles, this.savedSession);
		}

		// Re-apply split ratio on workspace restore (refresh) — Obsidian
		// resets flex ratios when rebuilding the layout from saved state.
		setTimeout(() => {
			applySplitRatio(this.containerEl, [2, 8]);
		}, 200);
	}

	async onClose(): Promise<void> {
		this.panel = null;
	}

	setCallbacks(callbacks: TypePanelCallbacks): void {
		this.callbacks = callbacks;
		this.panel?.setCallbacks(callbacks);
	}

	loadSession(subtitles: Subtitle[], session: TypeSessionData): void {
		this.savedSubtitles = subtitles;
		this.savedSession = session;
		this.panel?.load(subtitles, session);
	}

	goToSentence(index: number): void {
		this.panel?.goToSentence(index);
	}

	focus(): void {
		this.panel?.focus();
	}

	hasData(): boolean {
		return this.savedSubtitles !== null && this.savedSession !== null;
	}

	/** Update the saved session snapshot (call from onSave callback). */
	updateSession(session: TypeSessionData): void {
		this.savedSession = session;
	}

	getState(): Record<string, unknown> {
		if (!this.savedSubtitles || !this.savedSession) return {};
		return {
			subtitles: this.savedSubtitles,
			session: this.savedSession,
		};
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { subtitles, session } = state as {
			subtitles?: Subtitle[];
			session?: TypeSessionData;
		};
		if (subtitles && session) {
			this.savedSubtitles = subtitles;
			this.savedSession = session;
			// If panel already exists (setState after onOpen), load now.
			// Otherwise onOpen will pick up savedSubtitles/savedSession.
			if (this.panel) {
				this.panel.load(subtitles, session);
			}
		}
	}
}

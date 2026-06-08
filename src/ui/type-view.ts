import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Subtitle, TypeSessionData } from '@/types';

import { applySplitRatio } from '@/utils/layout';

import { TypePanel, type TypePanelCallbacks } from './type-panel';

export const TYPE_VIEW_TYPE = 'dial-type';

export class TypeView extends ItemView {
	private panel: TypePanel | null = null;
	private callbacks: TypePanelCallbacks | null = null;

	// Subtitles persisted via Obsidian's getState/setState (workspace.json).
	// Session data lives in plugin storage only — restored by tryRestoreTypeSession.
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

		// Restore from workspace state (setState runs before onOpen).
		// Session data may not be available yet — tryRestoreTypeSession
		// will call loadSession() with the full session from plugin storage.
		if (this.savedSubtitles && this.savedSession) {
			this.panel.load(this.savedSubtitles, this.savedSession);
		} else if (this.savedSubtitles) {
			this.panel.load(this.savedSubtitles, {
				id: '',
				videoPath: '',
				subtitlePath: '',
				currentIndex: 0,
				createdAt: '',
				sentences: [],
			});
		}

		// Auto-focus input when this tab becomes active
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) {
					this.panel?.focus();
				}
			}),
		);

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
		if (!this.savedSubtitles) return {};
		return { subtitles: this.savedSubtitles };
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const { subtitles } = state as {
			subtitles?: Subtitle[];
		};
		if (subtitles) {
			this.savedSubtitles = subtitles;
			// Session is not in workspace.json — it comes from plugin
			// storage via tryRestoreTypeSession. Only set subtitles here
			// so onOpen can render word placeholders immediately.
			if (this.panel && !this.savedSession) {
				this.panel.load(subtitles, {
					id: '',
					videoPath: '',
					subtitlePath: '',
					currentIndex: 0,
					createdAt: '',
					sentences: [],
				});
			}
		}
	}
}

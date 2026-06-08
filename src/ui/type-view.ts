import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Subtitle, TypeSessionData } from '@/types';

import { TypePanel, type TypePanelCallbacks } from './type-panel';

export const TYPE_VIEW_TYPE = 'dial-type';

export class TypeView extends ItemView {
	private panel: TypePanel | null = null;
	private callbacks: TypePanelCallbacks | null = null;

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
	}

	async onClose(): Promise<void> {
		this.panel = null;
	}

	setCallbacks(callbacks: TypePanelCallbacks): void {
		this.callbacks = callbacks;
		this.panel?.setCallbacks(callbacks);
	}

	loadSession(subtitles: Subtitle[], session: TypeSessionData): void {
		this.panel?.load(subtitles, session);
	}

	goToSentence(index: number): void {
		this.panel?.goToSentence(index);
	}

	focus(): void {
		this.panel?.focus();
	}

	getState(): Record<string, unknown> {
		return {};
	}

	async setState(_state: Record<string, unknown>): Promise<void> {}
}

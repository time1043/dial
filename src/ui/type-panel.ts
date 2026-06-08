import type { Subtitle, TypeSessionData } from '@/types';

export interface TypePanelCallbacks {
	onSave: (session: TypeSessionData) => void;
}

export class TypePanel {
	readonly containerEl: HTMLElement;

	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({ cls: 'dial-type-panel' });
		this.containerEl.createEl('h2', {
			cls: 'dial-type-placeholder',
			text: 'Type',
		});
	}

	load(_subtitles: Subtitle[], _session: TypeSessionData): void {}
	goToSentence(_index: number): void {}
	focus(): void {}
	setCallbacks(_cb: TypePanelCallbacks): void {}
}

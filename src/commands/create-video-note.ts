import { App, Modal, Notice } from 'obsidian';

import type DialPlugin from '@/main';

export async function createVideoNote(plugin: DialPlugin): Promise<void> {
	const filename = await promptFilename(plugin);
	if (!filename) return;

	const path = `${filename}.md`;
	const existing = plugin.app.vault.getAbstractFileByPath(path);
	if (existing) {
		new Notice(`File already exists: ${path}`);
		return;
	}

	const content = `---
video: ${filename}.mp4
subtitle: ${filename}.srt
---
`;
	const file = await plugin.app.vault.create(path, content);
	await plugin.app.workspace.openLinkText(file.path, '', true);
}

function promptFilename(plugin: DialPlugin): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new FilenameModal(plugin.app, resolve);
		modal.open();
	});
}

class FilenameModal extends Modal {
	private onSubmit: (value: string | null) => void;
	private submitted = false;

	constructor(app: App, onSubmit: (value: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'New video note' });

		const input = contentEl.createEl('input', {
			cls: 'dial-input',
			type: 'text',
			placeholder: 'filename',
		});

		contentEl.createEl('p', {
			cls: 'dial-hint',
			text: 'Creates filename.md with video: filename.mp4, subtitle: filename.srt',
		});

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();

				const value = input.value.trim();
				this.submitted = true;
				this.close();
				this.onSubmit(value || null);
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();

				this.close();
			}
		});

		setTimeout(() => input.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) {
			this.onSubmit(null);
		}
	}
}

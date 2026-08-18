import { Modal, Notice } from 'obsidian';

import type DialPlugin from '@/main';

import { URL_PLAYER_VIEW_TYPE, UrlPlayerView } from '@/ui/url-player-view';
import { toEmbedUrl } from '@/utils/url-player';

class UrlInputModal extends Modal {
	private readonly plugin: DialPlugin;
	private value = '';

	constructor(plugin: DialPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Open video player with video URL' });

		const input = contentEl.createEl('input', {
			cls: 'dial-input',
			type: 'text',
			placeholder: 'https://www.bilibili.com/video/BV1zF7A6QEAG/',
		});
		input.value = this.value;
		input.addEventListener('input', () => {
			this.value = input.value;
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.submit();
			}
		});

		contentEl.createEl('p', {
			cls: 'dial-hint',
			text: 'Embeds the platform’s native player. Subtitle sync, looping, and seeking are not available for URL sources.',
		});

		const row = contentEl.createDiv({ cls: 'dial-url-modal-actions' });
		const open = row.createEl('button', { text: 'Open', cls: 'mod-cta' });
		open.addEventListener('click', () => this.submit());
		const cancel = row.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());

		// Focus the input when the modal opens
		setTimeout(() => input.focus(), 0);
	}

	private submit(): void {
		const raw = this.value.trim();
		if (!raw) {
			new Notice('Please enter a video URL');
			return;
		}
		this.close();
		void openUrlPlayer(this.plugin, raw);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export async function openUrlPlayer(plugin: DialPlugin, rawUrl: string): Promise<void> {
	const embedUrl = toEmbedUrl(rawUrl);

	const existing = plugin.app.workspace.getLeavesOfType(URL_PLAYER_VIEW_TYPE);
	let view: UrlPlayerView;
	if (existing.length > 0) {
		const leaf = existing[0]!;
		await plugin.app.workspace.revealLeaf(leaf);
		view = leaf.view as UrlPlayerView;
	} else {
		const leaf = plugin.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: URL_PLAYER_VIEW_TYPE, active: true });
		await plugin.app.workspace.revealLeaf(leaf);
		view = leaf.view as UrlPlayerView;
	}

	view.loadUrl(embedUrl);
}

export function openUrlPlayerPrompt(plugin: DialPlugin): void {
	new UrlInputModal(plugin).open();
}

import { Notice } from 'obsidian';

import type DialPlugin from '@/main';

import { URL_PLAYER_VIEW_TYPE, UrlPlayerView } from '@/ui/url-player-view';
import { toEmbedUrl } from '@/utils/url-player';

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

/**
 * Reads the `video-link` frontmatter field from the active note and opens it
 * in the URL video player. Shows a notice if there is no active note or the
 * field is missing.
 */
export async function openUrlPlayerFromActiveNote(plugin: DialPlugin): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice('No active file');
		return;
	}

	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	const videoLink: unknown = cache?.frontmatter?.['video-link'];

	if (typeof videoLink !== 'string' || !videoLink.trim()) {
		new Notice("Active file must have 'video-link' in frontmatter");
		return;
	}

	await openUrlPlayer(plugin, videoLink.trim());
}

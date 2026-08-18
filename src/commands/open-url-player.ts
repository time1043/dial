import { MarkdownView, Notice } from 'obsidian';

import type DialPlugin from '@/main';

import { URL_PLAYER_VIEW_TYPE, UrlPlayerView } from '@/ui/url-player-view';
import { applySplitRatio } from '@/utils/layout';
import { toEmbedUrl } from '@/utils/url-player';

export async function openUrlPlayer(plugin: DialPlugin, rawUrl: string): Promise<void> {
	const embedUrl = toEmbedUrl(rawUrl);

	const existing = plugin.app.workspace.getLeavesOfType(URL_PLAYER_VIEW_TYPE);
	let view: UrlPlayerView | null;
	if (existing.length > 0) {
		const leaf = existing[0]!;
		await plugin.app.workspace.revealLeaf(leaf);
		view = leaf.view as UrlPlayerView;
	} else {
		view = null;
	}

	if (!view) {
		// Mirror the local player's layout: active note (md) on the left,
		// video player on the right, at a 2:8 split.
		const sourceView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const sourceLeaf = sourceView?.leaf ?? plugin.app.workspace.getLeaf('tab');
		const videoLeaf = plugin.app.workspace.createLeafBySplit(sourceLeaf, 'vertical');
		await videoLeaf.setViewState({ type: URL_PLAYER_VIEW_TYPE, active: true });
		await plugin.app.workspace.revealLeaf(videoLeaf);
		view = videoLeaf.view as UrlPlayerView;

		const leftContainer = (sourceView ?? videoLeaf.view)?.containerEl;
		setTimeout(() => {
			if (leftContainer) {
				applySplitRatio(leftContainer, [2, 8]);
			}
			(leftContainer?.children[1] as HTMLElement | undefined)?.focus();
		}, 100);
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
	const rawLink: unknown = cache?.frontmatter?.['video-link'];

	// Accepts both a single string and a list; for a list, use the first item.
	let videoLink: string | undefined;
	if (typeof rawLink === 'string') {
		videoLink = rawLink;
	} else if (Array.isArray(rawLink)) {
		const first: unknown = rawLink[0];
		videoLink = typeof first === 'string' ? first : undefined;
	}

	if (!videoLink || !videoLink.trim()) {
		new Notice("Active file must have 'video-link' in frontmatter");
		return;
	}

	await openUrlPlayer(plugin, videoLink.trim());
}

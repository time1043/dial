import type { View } from 'obsidian';

import { Notice, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { SubtitleView, SUBTITLE_VIEW_TYPE } from '@/ui/subtitle-view';
import { VideoPlayerView, VIDEO_PLAYER_VIEW_TYPE } from '@/ui/video-player-view';

export async function openVideoPlayer(plugin: DialPlugin): Promise<void> {
	// 1. Read frontmatter
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice('No active file');
		return;
	}

	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	const frontmatter = cache?.frontmatter;

	if (!frontmatter?.video || !frontmatter?.subtitle) {
		new Notice("Active file must have 'video' and 'subtitle' in frontmatter");
		return;
	}

	const videoPath = String(frontmatter.video);
	const subtitlePath = String(frontmatter.subtitle);

	// 2. Read subtitle file (inside vault)
	const subtitleFile = plugin.app.vault.getAbstractFileByPath(subtitlePath);
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		new Notice(`Subtitle file not found: ${subtitlePath}`);
		return;
	}

	let subtitleBuffer: ArrayBuffer;
	try {
		subtitleBuffer = await plugin.app.vault.readBinary(subtitleFile);
	} catch {
		new Notice('Failed to read subtitle file.');
		return;
	}

	let subtitles: Subtitle[];
	try {
		subtitles = parseSubtitle(subtitleBuffer, subtitlePath);
	} catch (e) {
		new Notice(`Subtitle parse error: ${e instanceof Error ? e.message : String(e)}`);
		return;
	}

	if (subtitles.length === 0) {
		new Notice('No subtitles found in file');
		return;
	}

	// 3. Open both views
	const videoView = (await openView(plugin, VIDEO_PLAYER_VIEW_TYPE)) as VideoPlayerView;
	const subtitleView = (await openView(plugin, SUBTITLE_VIEW_TYPE)) as SubtitleView;

	// 4. Wire everything up
	videoView.loadVideo(videoPath);
	videoView.setSubtitles(subtitles);
	subtitleView.setSubtitles(subtitles);

	setupSync(videoView, subtitleView);

	new Notice(`Loaded ${subtitles.length} subtitles`);
}

async function openView(plugin: DialPlugin, viewType: string): Promise<View> {
	const existing = plugin.app.workspace.getLeavesOfType(viewType);
	if (existing.length > 0) {
		await plugin.app.workspace.revealLeaf(existing[0]!);
		return existing[0]!.view;
	}

	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.setViewState({
		type: viewType,
		active: true,
	});
	await plugin.app.workspace.revealLeaf(leaf);
	return leaf.view;
}

function setupSync(videoView: VideoPlayerView, subtitleView: SubtitleView): void {
	// Video → Subtitle: highlight current subtitle
	videoView.setSubtitleChangeCallback((id: number) => {
		subtitleView.setCurrentSubtitle(id);
	});

	// Subtitle → Video: click subtitle to jump
	subtitleView.setCallbacks({
		onSubtitleClick: (sub: Subtitle) => {
			videoView.jumpToTime(sub.start);
			videoView.play();
		},
	});
}

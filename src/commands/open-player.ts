import type { View } from 'obsidian';

import { Notice, TFile } from 'obsidian';
import { join } from 'path';

import type DialPlugin from '@/main';
import type { Subtitle } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { SubtitleView, SUBTITLE_VIEW_TYPE } from '@/ui/subtitle-view';
import { VideoPlayerView, VIDEO_PLAYER_VIEW_TYPE } from '@/ui/video-player-view';

export async function openVideoPlayer(plugin: DialPlugin): Promise<void> {
	// 1. Validate settings
	if (!plugin.settings.videoLibraryPath) {
		new Notice('Please set the video library path in plugin settings.');
		return;
	}

	// 2. Read frontmatter
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

	const videoRelative = String(frontmatter.video);
	const subtitleRelative = String(frontmatter.subtitle);

	// 3. Resolve video path (absolute, outside vault)
	const videoPath = join(plugin.settings.videoLibraryPath, videoRelative);

	// 4. Read subtitle file (inside vault)
	const subtitlePath = join(plugin.settings.subtitleLibraryPath, subtitleRelative).replace(
		/\\/g,
		'/',
	);
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

	// 5. Open views in split layout: left (md + subtitles) | right (video)
	const subtitleView = (await openView(plugin, SUBTITLE_VIEW_TYPE, 'tab')) as SubtitleView;
	const videoView = (await openView(plugin, VIDEO_PLAYER_VIEW_TYPE, 'split')) as VideoPlayerView;

	// 6. Wire everything up
	videoView.loadVideo(videoPath);
	videoView.setSubtitles(subtitles);
	subtitleView.setSubtitles(subtitles);

	setupSync(plugin, videoView, subtitleView);

	// 7. Restore playback position
	const savedTime = plugin.positions.restore(videoPath);
	if (savedTime !== null) {
		videoView.jumpToTime(savedTime);
	}

	new Notice(`Loaded ${subtitles.length} subtitles`);
}

async function openView(plugin: DialPlugin, viewType: string, mode: 'tab' | 'split'): Promise<View> {
	const existing = plugin.app.workspace.getLeavesOfType(viewType);
	if (existing.length > 0) {
		await plugin.app.workspace.revealLeaf(existing[0]!);
		return existing[0]!.view;
	}

	const leaf = plugin.app.workspace.getLeaf(mode);
	await leaf.setViewState({
		type: viewType,
		active: true,
	});
	await plugin.app.workspace.revealLeaf(leaf);
	return leaf.view;
}

export function setupSync(
	plugin: DialPlugin,
	videoView: VideoPlayerView,
	subtitleView: SubtitleView,
): void {
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

	// Save playback position on pause
	videoView.setSavePositionCallback((time: number) => {
		const path = videoView.getVideoPath();
		if (path) {
			plugin.positions.save(path, time);
		}
	});
}

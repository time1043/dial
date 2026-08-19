import type { View } from 'obsidian';

import { Notice, Platform, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { applySplitRatio } from '@/utils/layout';
import { formatTime } from '@/utils/time';

// Extract the file extension (including the leading dot) from a filename.
// Falls back to `fallback` when there is no usable extension.
function getFileExtension(filename: string, fallback: string): string {
	const idx = filename.lastIndexOf('.');
	if (idx <= 0 || idx >= filename.length - 1) {
		return fallback;
	}
	return filename.slice(idx);
}

async function recordTrace(
	plugin: DialPlugin,
	videoPath: string,
	notePath: string,
	seconds: number,
): Promise<void> {
	const trace = plugin.trace;
	const now = new Date();
	const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
	const filePath = trace.getMonthFilePath(now);
	const dirPath = '_lib/trace';

	const row = {
		time: trace.formatTime(now),
		notePath,
		position: trace.formatPosition(seconds, notePath),
	};

	// Ensure directory exists
	if (!plugin.app.vault.getAbstractFileByPath(dirPath)) {
		await plugin.app.vault.createFolder(dirPath);
	}

	let content = '';
	const existing = plugin.app.vault.getAbstractFileByPath(filePath);
	if (existing instanceof TFile) {
		content = await plugin.app.vault.read(existing);
	}

	const updated = trace.addRow(content, date, 'Video Player', row);

	if (existing instanceof TFile) {
		await plugin.app.vault.modify(existing, updated);
	} else {
		await plugin.app.vault.create(filePath, updated);
	}
}

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

	// Derive the file extensions from the frontmatter so the mirrored path
	// matches the actual video/subtitle format (e.g. .mkv, .webm, .vtt)
	// instead of being hardcoded to .mp4 / .srt.
	const videoExt = getFileExtension(videoRelative, '.mp4');
	const subtitleExt = getFileExtension(subtitleRelative, '.srt');

	// 3. Resolve paths — flat first, then mirror note folder structure
	// e.g. notePath "note/psychology-anthony/xxx.md" → noteSubpath "psychology-anthony/xxx.md"
	const noteSubpath = activeFile.path.replace(/^[^/]+\//, '');
	const flatVideoPath = `${plugin.settings.videoLibraryPath}/${videoRelative}`.replace(
		/\\/g,
		'/',
	);
	const flatSubtitlePath = `${plugin.settings.subtitleLibraryPath}/${subtitleRelative}`.replace(
		/\\/g,
		'/',
	);
	const mirrorVideoPath =
		`${plugin.settings.videoLibraryPath}/${noteSubpath.replace(/\.md$/, videoExt)}`.replace(
			/\\/g,
			'/',
		);
	const mirrorSubtitlePath =
		`${plugin.settings.subtitleLibraryPath}/${noteSubpath.replace(/\.md$/, subtitleExt)}`.replace(
			/\\/g,
			'/',
		);

	// Try flat path first, fallback to mirrored structure
	const videoPath = plugin.app.vault.getAbstractFileByPath(flatVideoPath)
		? flatVideoPath
		: mirrorVideoPath;
	let subtitleFile = plugin.app.vault.getAbstractFileByPath(flatSubtitlePath);
	let subtitlePath = flatSubtitlePath;
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		subtitleFile = plugin.app.vault.getAbstractFileByPath(mirrorSubtitlePath);
		subtitlePath = mirrorSubtitlePath;
	}
	if (!subtitleFile || !(subtitleFile instanceof TFile)) {
		new Notice(`Subtitle file not found: ${flatSubtitlePath}`);
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

	// 5. Open views
	if (Platform.isMobile) {
		// Mobile: single video view with embedded subtitle panel
		const videoLeaf = plugin.app.workspace.getLeaf('tab');
		await videoLeaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE, active: true });
		await plugin.app.workspace.revealLeaf(videoLeaf);
		const videoView = videoLeaf.view as VideoPlayerView;

		await videoView.loadVideo(videoPath, plugin.settings.defaultVolume);
		videoView.setSubtitles(subtitles);
		plugin.setSubtitles(subtitles);

		// Trace: record video opened
		const notePath = activeFile.path;
		plugin.activeNotePath = notePath;
		void recordTrace(plugin, videoPath, notePath, 0);

		// Wire video → subtitle highlight
		videoView.setSubtitleChangeCallback((id: number) => {
			videoView.setCurrentSubtitle(id);
		});

		videoView.setPlayStateCallback((isPlaying: boolean) => {
			videoView.setPlayState(isPlaying);
		});

		videoView.setSavePositionCallback((time: number) => {
			const path = videoView.getVideoPath();
			if (path) {
				plugin.positions.save(path, time);
				void recordTrace(plugin, path, notePath, time);
			}
		});

		const savedTime = plugin.positions.restore(videoPath);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}
	} else {
		// Desktop: split layout — left (md + subtitles) | right (video)
		const subtitleView = (await openView(plugin, SUBTITLE_VIEW_TYPE, 'tab')) as SubtitleView;
		const subLeaf = plugin.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE)[0]!;
		const videoLeaf = plugin.app.workspace.createLeafBySplit(subLeaf, 'vertical');
		await videoLeaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE });
		await plugin.app.workspace.revealLeaf(subLeaf);
		plugin.app.workspace.setActiveLeaf(subLeaf);
		const videoView = videoLeaf.view as VideoPlayerView;

		// Set 2:8 ratio via CSS flex, then focus subtitle for keyboard shortcuts
		setTimeout(() => {
			applySplitRatio(subtitleView.containerEl, [2, 8]);
			(subtitleView.containerEl.children[1] as HTMLElement)?.focus();
		}, 100);

		// Wire everything up
		await videoView.loadVideo(videoPath, plugin.settings.defaultVolume);
		videoView.setSubtitles(subtitles);
		subtitleView.setSubtitles(subtitles);
		plugin.setSubtitles(subtitles);

		// Trace: record video opened
		const notePath = activeFile.path;
		plugin.activeNotePath = notePath;
		void recordTrace(plugin, videoPath, notePath, 0);

		setupSync(plugin, videoView, subtitleView, notePath);

		const savedTime = plugin.positions.restore(videoPath);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}
	}

	new Notice(`Loaded ${subtitles.length} subtitles`);
}

async function openView(
	plugin: DialPlugin,
	viewType: string,
	mode: 'tab' | 'split',
): Promise<View> {
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
	notePath?: string,
): void {
	// Video → Subtitle: highlight current subtitle
	videoView.setSubtitleChangeCallback((id: number) => {
		subtitleView.setCurrentSubtitle(id);
	});

	// Video → Subtitle: update play/pause button icon
	videoView.setPlayStateCallback((isPlaying: boolean) => {
		subtitleView.setPlayState(isPlaying);
	});

	// Subtitle → Video: click subtitle to jump
	subtitleView.setCallbacks({
		onSubtitleClick: (sub: Subtitle) => {
			videoView.jumpToTime(sub.start);
			videoView.play();
		},
		onSetA: (time: number) => {
			const state = plugin.abLoop.setPointA(time);
			videoView.setABLoop(state.a, state.b, state.active);
			new Notice(`A: ${formatTime(time)}`);
			return state;
		},
		onSetB: (time: number) => {
			const { state, error } = plugin.abLoop.setPointB(time);
			if (error) {
				new Notice(error);
			} else {
				videoView.setABLoop(state.a, state.b, state.active);
				new Notice(`Loop: ${formatTime(state.a!)} → ${formatTime(state.b!)}`);
			}
			return state;
		},
		onClearAB: () => {
			const state = plugin.abLoop.clear();
			videoView.setABLoop(state.a, state.b, state.active);
			new Notice('Loop cleared');
			return state;
		},
		onGetCurrentTime: () => {
			return videoView.getCurrentTime();
		},
		onTogglePlay: () => {
			videoView.togglePlay();
		},
		onJumpPrev: () => {
			plugin.jumpSubtitle(-1);
		},
		onJumpNext: () => {
			plugin.jumpSubtitle(1);
		},
		onSpeedChange: (rate: number) => {
			videoView.setPlaybackRate(rate);
		},
		onSeek: (delta: number) => {
			const t = videoView.getCurrentTime() + delta;
			videoView.jumpToTime(Math.max(0, t));
		},
		onVolumeChange: (delta: number) => {
			videoView.changeVolume(delta);
			new Notice(`Volume: ${Math.round(videoView.getVolume() * 100)}%`);
		},
		onToggleMute: () => {
			videoView.toggleMute();
			new Notice(videoView.isMuted() ? 'Muted' : 'Unmuted');
		},
	});

	// Save playback position on pause
	videoView.setSavePositionCallback((time: number) => {
		const path = videoView.getVideoPath();
		if (path) {
			plugin.positions.save(path, time);
			if (notePath) {
				void recordTrace(plugin, path, notePath, time);
			}
		}
	});
}

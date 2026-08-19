import { Notice, Platform, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { applySplitRatio } from '@/utils/layout';
import { formatTime } from '@/utils/time';
import { openOrReuseLeaf, resolveMediaPaths } from '@/vault/paths';

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
	// 1. Resolve media paths (flat library path, then mirrored note folder).
	const paths = await resolveMediaPaths(plugin);
	if (!paths) return;
	const { videoPath, subtitlePath, notePath } = paths;

	const subtitleTFile = plugin.app.vault.getAbstractFileByPath(subtitlePath);
	if (!(subtitleTFile instanceof TFile)) {
		new Notice('Subtitle file not found.');
		return;
	}
	let subtitleBuffer: ArrayBuffer;
	try {
		subtitleBuffer = await plugin.app.vault.readBinary(subtitleTFile);
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
		plugin.activeNotePath = notePath;
		void recordTrace(plugin, videoPath, notePath, 0);

		// Wire video → subtitle highlight
		videoView.setSubtitleChangeCallback((id: number) => {
			videoView.setCurrentSubtitle(id);
		});

		videoView.setPlayStateCallback((isPlaying: boolean) => {
			videoView.setPlayState(isPlaying);
		});

		// Route mobile AB loop buttons through AbLoopManager (single source of truth)
		videoView.setABLoopHandler({
			onSetA: (time) => {
				const state = plugin.abLoop.setPointA(time);
				videoView.setABLoopState(state);
				new Notice(`A: ${formatTime(time)}`);
				return state;
			},
			onSetB: (time) => {
				const { state, error } = plugin.abLoop.setPointB(time);
				if (error) {
					new Notice(error);
				} else {
					videoView.setABLoopState(state);
					new Notice(`Loop: ${formatTime(state.a!)} → ${formatTime(state.b!)}`);
				}
				return state;
			},
			onClearAB: () => {
				const state = plugin.abLoop.clear();
				videoView.setABLoopState(state);
				new Notice('Loop cleared');
				return state;
			},
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
		const subtitleView = (await openOrReuseLeaf(
			plugin,
			SUBTITLE_VIEW_TYPE,
			'tab',
		)) as SubtitleView;
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
			videoView.setABLoopState(state);
			new Notice(`A: ${formatTime(time)}`);
			return state;
		},
		onSetB: (time: number) => {
			const { state, error } = plugin.abLoop.setPointB(time);
			if (error) {
				new Notice(error);
			} else {
				videoView.setABLoopState(state);
				new Notice(`Loop: ${formatTime(state.a!)} → ${formatTime(state.b!)}`);
			}
			return state;
		},
		onClearAB: () => {
			const state = plugin.abLoop.clear();
			videoView.setABLoopState(state);
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

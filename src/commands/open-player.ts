import { Notice, Platform, TFile } from 'obsidian';

import type DialPlugin from '@/main';
import type { Subtitle } from '@/types';

import { parseSubtitle } from '@/modules/subtitle-parsers';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { applySplitRatio } from '@/utils/layout';
import { formatTime } from '@/utils/time';
import { openOrReuseLeaf, resolveMediaPaths } from '@/vault/paths';

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
		videoView.setLoopMode(plugin.settings.loopMode);
		wireVideoEnd(plugin, videoView);
		plugin.setSubtitles(subtitles);

		// Trace: record video opened
		plugin.activeNotePath = notePath;
		plugin.singleLoopNotified = false;
		void plugin.trace.saveTrace(plugin.app.vault, notePath, 0);

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
				void plugin.trace.saveTrace(plugin.app.vault, notePath, time);
			}
		});

		const savedTime = plugin.positions.restore(videoPath);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}

		// Auto-play if enabled.
		if (plugin.settings.autoPlay) {
			videoView.play();
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
		videoView.setLoopMode(plugin.settings.loopMode);
		wireVideoEnd(plugin, videoView);
		subtitleView.setSubtitles(subtitles);
		plugin.setSubtitles(subtitles);

		// Trace: record video opened
		plugin.activeNotePath = notePath;
		plugin.singleLoopNotified = false;
		void plugin.trace.saveTrace(plugin.app.vault, notePath, 0);

		setupSync(plugin, videoView, subtitleView, notePath);

		const savedTime = plugin.positions.restore(videoPath);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}

		// Auto-play if enabled (independent of subtitle-panel focus).
		if (plugin.settings.autoPlay) {
			videoView.play();
		}
	}

	new Notice(`Loaded ${subtitles.length} subtitles`);
}

/**
 * Wire the video-end callback that drives folder/all advance. The teardown
 * is deferred with setTimeout so it runs outside the video element's own
 * `ended` handler — detaching a leaf while inside the event that owns it is
 * a timing hazard. Harmless for none/single modes, whose handleVideoEnd
 * never calls onVideoEnd.
 */
export function wireVideoEnd(plugin: DialPlugin, videoView: VideoPlayerView): void {
	videoView.setVideoEndCallback(() => {
		// Defer so teardown runs outside the video element's own `ended` handler.
		setTimeout(() => void plugin.advanceToNextNote(), 0);
	});
	// Feature: preview the next episode ~5s before the end.
	videoView.setNearEndCallback(() => void plugin.notifyNextEpisode());
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
				void plugin.trace.saveTrace(plugin.app.vault, notePath, time);
			}
		}
	});
}

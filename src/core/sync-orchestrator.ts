import type DialPlugin from '@/main';
import type { ABLoopState } from '@/types';

import { setupSync } from '@/commands/open-player';
import { tryRestoreTypeSession } from '@/commands/open-type-session';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from '@/ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { applySplitRatio } from '@/utils/layout';

/**
 * Re-wire video ↔ subtitle sync after vault reload restores views.
 *
 * Called from the layout-change event. May fire before every view's
 * onOpen() completes — tryRestoreTypeSession polls internally until
 * views are ready. Harmless to call multiple times.
 */
export function trySetupSync(plugin: DialPlugin): void {
	// Type mode — restore session data into views that have no
	// getState/setState persistence.
	if (plugin.activeTypeSessionId) {
		void tryRestoreTypeSession(plugin);
	}

	const videoView = getVideoView(plugin);
	if (!(videoView instanceof VideoPlayerView)) return;

	const subtitleView = plugin.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
	if (subtitleView instanceof SubtitleView) {
		setupSync(plugin, videoView, subtitleView, plugin.activeNotePath ?? undefined);
		plugin.setSubtitles(subtitleView.getSubtitles());
	}

	// Restore playback position and volume after vault reload
	videoView.setVolume(plugin.settings.defaultVolume);
	const path = videoView.getVideoPath();
	if (path && videoView.getCurrentTime() === 0) {
		const savedTime = plugin.positions.restore(path);
		if (savedTime !== null) {
			videoView.jumpToTime(savedTime);
		}
	}

	// Re-apply split ratio after DOM is ready
	const splitRatio: [number, number] = [2, 8];
	setTimeout(() => {
		const refEl =
			subtitleView instanceof SubtitleView ? subtitleView.containerEl : videoView.containerEl;
		applySplitRatio(refEl, splitRatio);
		if (subtitleView instanceof SubtitleView) {
			(subtitleView.containerEl.children[1] as HTMLElement)?.focus();
		}
	}, 100);
}

/** Push AB loop state to both the video view and subtitle view. */
export function syncABToViews(plugin: DialPlugin, state: ABLoopState): void {
	const videoView = getVideoView(plugin);
	videoView?.setABLoopState(state);
	const subtitleView = plugin.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
	if (subtitleView instanceof SubtitleView) {
		subtitleView.setABLoopState(state);
	}
}

/** Get the active VideoPlayerView, or null if none is open. */
export function getVideoView(plugin: DialPlugin): VideoPlayerView | null {
	const view = plugin.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first()?.view;
	return view instanceof VideoPlayerView ? view : null;
}

/** Get the active SubtitleView, or null if none is open (e.g. on mobile). */
export function getSubtitleView(plugin: DialPlugin): SubtitleView | null {
	const view = plugin.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
	return view instanceof SubtitleView ? view : null;
}

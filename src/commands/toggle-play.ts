import type DialPlugin from '@/main';

import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '../ui/video-player-view';

export function togglePlay(plugin: DialPlugin): void {
	const view = plugin.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first()?.view;
	if (view instanceof VideoPlayerView) {
		view.togglePlay();
	}
}

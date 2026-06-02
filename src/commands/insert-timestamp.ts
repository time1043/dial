import { MarkdownView, Notice } from 'obsidian';

import type DialPlugin from '@/main';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from '@/ui/video-player-view';
import { formatTime } from '@/utils/time';

export function insertTimestamp(plugin: DialPlugin): void {
	const videoView = plugin.app.workspace
		.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)
		.first()?.view;
	if (!(videoView instanceof VideoPlayerView)) {
		new Notice('No video is playing');
		return;
	}

	const mdView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!mdView) {
		new Notice('No active Markdown editor');
		return;
	}

	const time = videoView.getCurrentTime();
	const text = `- [${formatTime(time)}](obsidian://dial?seconds=${Math.floor(time)})`;
	mdView.editor.replaceSelection(text);
}

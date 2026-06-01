import { Plugin } from 'obsidian';

import type { DialSettings } from './settings';

import { createVideoNote } from './commands/create-video-note';
import { openVideoPlayer, setupSync } from './commands/open-player';
import { PositionManager } from './modules/position-manager/position-manager';
import { DEFAULT_SETTINGS, DialSettingTab } from './settings';
import { SUBTITLE_VIEW_TYPE, SubtitleView } from './ui/subtitle-view';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './ui/video-player-view';
import { applySplitRatio } from './utils/layout';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	readonly positions = new PositionManager();

	async onload(): Promise<void> {
		await this.loadPersistedData();

		this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf));
		this.registerView(SUBTITLE_VIEW_TYPE, (leaf) => new SubtitleView(leaf));

		this.addRibbonIcon('play', 'Dial', () => {
			void openVideoPlayer(this);
		});

		this.addCommand({
			id: 'open-video-player',
			name: 'Open video player',
			callback: () => openVideoPlayer(this),
		});

		this.addCommand({
			id: 'create-video-note',
			name: 'Create video note',
			callback: () => createVideoNote(this),
		});

		this.addSettingTab(new DialSettingTab(this.app, this));

		// Re-wire sync after vault reload restores views
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.trySetupSync();
			}),
		);
	}

	onunload(): void {
		// Save playback position for all open video views
		for (const leaf of this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof VideoPlayerView) {
				const path = view.getVideoPath();
				const time = view.getCurrentTime();
				if (path) {
					this.positions.save(path, time);
				}
			}
		}
		this.persistAll();
	}

	private trySetupSync(): void {
		const videoView = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).first()?.view;
		const subtitleView = this.app.workspace.getLeavesOfType(SUBTITLE_VIEW_TYPE).first()?.view;
		if (videoView instanceof VideoPlayerView && subtitleView instanceof SubtitleView) {
			setupSync(this, videoView, subtitleView);

			// Restore playback position after vault reload
			const path = videoView.getVideoPath();
			if (path && videoView.getCurrentTime() === 0) {
				const savedTime = this.positions.restore(path);
				if (savedTime !== null) {
					videoView.jumpToTime(savedTime);
				}
			}

			// Re-apply 2:8 split ratio after DOM is ready
			setTimeout(() => {
				applySplitRatio(subtitleView.containerEl, [2, 8]);
				(subtitleView.containerEl.children[1] as HTMLElement)?.focus();
			}, 100);
		}
	}

	private async loadPersistedData(): Promise<void> {
		const data = (await this.loadData()) as Record<string, unknown> | null;
		if (!data) return;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data['settings'] as Partial<DialSettings> | undefined,
		);
		this.positions.load((data['positions'] as Record<string, number> | undefined) ?? {});
	}

	async saveSettings(): Promise<void> {
		this.persistAll();
	}

	private persistAll(): void {
		void this.saveData({
			settings: this.settings,
			positions: this.positions.getAll(),
		});
	}
}

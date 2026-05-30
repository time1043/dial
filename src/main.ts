import { Plugin } from 'obsidian';

import type { DialSettings } from './settings';

import { openVideoPlayer } from './commands/open-player';
import { DEFAULT_SETTINGS, DialSettingTab } from './settings';
import { SubtitleView, SUBTITLE_VIEW_TYPE } from './ui/subtitle-view';
import { VideoPlayerView, VIDEO_PLAYER_VIEW_TYPE } from './ui/video-player-view';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

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

		this.addSettingTab(new DialSettingTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DialSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

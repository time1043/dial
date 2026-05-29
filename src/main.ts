import { Notice, Plugin } from 'obsidian';

import { DEFAULT_SETTINGS, DialSettings, DialSettingTab } from './settings';

export default class DialPlugin extends Plugin {
	settings: DialSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('play', 'Dial', () => {
			new Notice('Dial is ready!');
		});

		this.addSettingTab(new DialSettingTab(this.app, this));

		this.addCommand({
			id: 'open-video-player',
			name: 'Open video player',
			callback: () => {
				new Notice('Open video player (coming soon)');
			},
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DialSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

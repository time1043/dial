import { App, PluginSettingTab, Setting } from 'obsidian';

import type DialPlugin from './main';

export interface DialSettings {
	defaultSpeed: number;
}

export const DEFAULT_SETTINGS: DialSettings = {
	defaultSpeed: 1,
};

export class DialSettingTab extends PluginSettingTab {
	plugin: DialPlugin;

	constructor(app: App, plugin: DialPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default playback speed')
			.setDesc('The default playback speed for videos.')
			.addText((text) =>
				text
					.setPlaceholder('1')
					.setValue(String(this.plugin.settings.defaultSpeed))
					.onChange(async (value) => {
						const speed = parseFloat(value);
						if (!isNaN(speed) && speed > 0) {
							this.plugin.settings.defaultSpeed = speed;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}

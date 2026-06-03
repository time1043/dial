import { App, PluginSettingTab, Setting } from 'obsidian';

import type DialPlugin from './main';

export interface DialSettings {
	videoLibraryPath: string;
	subtitleLibraryPath: string;
	defaultVolume: number;
}

export const DEFAULT_SETTINGS: DialSettings = {
	videoLibraryPath: '',
	subtitleLibraryPath: '_lib/subtitles',
	defaultVolume: 1,
};

function trimTrailingSlash(path: string): string {
	return path.replace(/[/\\]+$/, '');
}

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
			.setName('Video library path')
			.setDesc('Absolute path to the directory containing your video files.')
			.addText((text) =>
				text
					.setPlaceholder('/path/to/videos')
					.setValue(this.plugin.settings.videoLibraryPath)
					.onChange(async (value) => {
						this.plugin.settings.videoLibraryPath = trimTrailingSlash(value);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Subtitle library path')
			.setDesc('Vault-relative path to the directory containing subtitle files.')
			.addText((text) =>
				text
					.setPlaceholder('_lib/subtitles')
					.setValue(this.plugin.settings.subtitleLibraryPath)
					.onChange(async (value) => {
						this.plugin.settings.subtitleLibraryPath =
							trimTrailingSlash(value) || DEFAULT_SETTINGS.subtitleLibraryPath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default volume')
			.setDesc('Volume level applied when loading a video (0–100%).')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.defaultVolume * 100)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.defaultVolume = value / 100;
						await this.plugin.saveSettings();
					}),
			);
	}
}

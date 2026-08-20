import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type DialPlugin from './main';
import type { FolderOrderMode, LoopMode } from './types';

export interface DialSettings {
	videoLibraryPath: string;
	subtitleLibraryPath: string;
	defaultVolume: number;
	loopMode: LoopMode;
	folderOrderMode: FolderOrderMode;
	folderLoopDepth: number;
	autoPlay: boolean;
}

export const DEFAULT_SETTINGS: DialSettings = {
	videoLibraryPath: '_lib/videos',
	subtitleLibraryPath: '_lib/subtitles',
	defaultVolume: 1,
	loopMode: 'folder',
	folderOrderMode: 'tree',
	folderLoopDepth: 1,
	autoPlay: true,
};

export function trimTrailingSlash(path: string): string {
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
			.setDesc('Vault-relative path to the directory containing video files.')
			.addText((text) =>
				text
					.setPlaceholder('_lib/videos')
					.setValue(this.plugin.settings.videoLibraryPath)
					.onChange(async (value) => {
						this.plugin.settings.videoLibraryPath =
							trimTrailingSlash(value) || DEFAULT_SETTINGS.videoLibraryPath;
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
						this.plugin.applyVolume(this.plugin.settings.defaultVolume);
						new Notice(`Default volume: ${value}%`);
					}),
			);

		new Setting(containerEl)
			.setName('Loop mode')
			.setDesc(
				'Behavior when the current video finishes. ' +
					'All-files mode is coming soon — selecting it has no effect yet.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('none', 'Play once (no loop)')
					.addOption('single', 'Loop single episode')
					.addOption('folder', 'Loop current folder')
					.addOption('all', 'Loop all files (coming soon)')
					.setValue(this.plugin.settings.loopMode)
					.onChange(async (value) => {
						const mode = value as LoopMode;
						this.plugin.settings.loopMode = mode;
						await this.plugin.saveSettings();
						this.plugin.applyLoopMode(mode);
					}),
			);

		new Setting(containerEl)
			.setName('Folder order mode')
			.setDesc(
				'How the next episode is chosen in "Loop current folder" mode. ' +
					'"File tree order" follows the folder sorted by path; ' +
					'"Index.md list" follows the order declared in an index.md file ' +
					'in the same folder under a "# List" heading.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('tree', 'File tree order')
					.addOption('index', 'Index.md list')
					.setValue(this.plugin.settings.folderOrderMode)
					.onChange(async (value) => {
						const mode = value as FolderOrderMode;
						this.plugin.settings.folderOrderMode = mode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Folder loop depth')
			.setDesc(
				'How many folder levels up from the current note define the loop ' +
					'scope in "Loop current folder" mode. 1 = the note\'s own folder; ' +
					'2 = its parent folder (and everything beneath it); and so on. ' +
					'All playable notes within that scope are included. Defaults to 1.',
			)
			.addText((text) =>
				text
					.setPlaceholder('1')
					.setValue(String(this.plugin.settings.folderLoopDepth))
					.onChange(async (value) => {
						const depth = Math.max(1, Math.floor(Number(value)) || 1);
						this.plugin.settings.folderLoopDepth = depth;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Auto-play on open')
			.setDesc(
				'Start playback automatically when the player opens, and when it ' +
					'advances to the next episode in loop mode.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoPlay).onChange(async (value) => {
					this.plugin.settings.autoPlay = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}

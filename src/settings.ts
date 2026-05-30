import { App, PluginSettingTab } from 'obsidian';

import type DialPlugin from './main';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DialSettings {}

export const DEFAULT_SETTINGS: DialSettings = {};

export class DialSettingTab extends PluginSettingTab {
	plugin: DialPlugin;

	constructor(app: App, plugin: DialPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
	}
}

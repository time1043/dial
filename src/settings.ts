import { App, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';

import { createSpeechChain } from '@/modules/speech/create-speech-chain';
import { createTranslationChain } from '@/modules/translation/create-translation-chain';

import type DialPlugin from './main';
import type {
	FolderOrderMode,
	LoopMode,
	SubtitlePanelVisibility,
	WordFlipRevealMode,
} from './types';

export type DeeplPlan = 'free' | 'pro';

export interface DialSettings {
	videoLibraryPath: string;
	subtitleLibraryPath: string;
	defaultVolume: number;
	loopMode: LoopMode;
	folderOrderMode: FolderOrderMode;
	folderLoopDepth: number;
	allFilesOrderMode: FolderOrderMode;
	allFilesRoot: string;
	autoPlay: boolean;
	showABLoop: boolean;
	showSpeed: boolean;
	showSubtitleSearch: boolean;
	wordPronunciationLang: string;
	wordAutoPronounce: boolean;
	/**
	 * Speech engine ids in user priority order (tried top to bottom).
	 * Ids not yet in the registry are skipped; registry engines missing
	 * here are appended at the end.
	 */
	speechEngineOrder: string[];
	/** Master opt-in for cloud translation (policy: default off). */
	translationEnabled: boolean;
	translationSourceLang: string;
	translationTargetLang: string;
	translationEngineOrder: string[];
	azureTranslateKey: string;
	azureRegion: string;
	deeplKey: string;
	deeplPlan: DeeplPlan;
	vocabularyBucketPath: string;
	wordFlipRevealMode: WordFlipRevealMode;
}

export const DEFAULT_SETTINGS: DialSettings = {
	videoLibraryPath: '_lib/videos',
	subtitleLibraryPath: '_lib/subtitles',
	defaultVolume: 1,
	loopMode: 'folder',
	folderOrderMode: 'tree',
	folderLoopDepth: 1,
	allFilesOrderMode: 'tree',
	allFilesRoot: 'note/',
	autoPlay: true,
	showABLoop: true,
	showSpeed: false,
	showSubtitleSearch: true,
	wordPronunciationLang: 'en-US',
	wordAutoPronounce: true,
	speechEngineOrder: ['system', 'azure', 'google'],
	translationEnabled: false,
	translationSourceLang: 'en',
	translationTargetLang: 'zh',
	translationEngineOrder: ['azure-translate', 'deepl'],
	azureTranslateKey: '',
	azureRegion: '',
	deeplKey: '',
	deeplPlan: 'free',
	vocabularyBucketPath: '_lib/vocabulary-bucket',
	wordFlipRevealMode: 'hidden',
};

/** Languages offered for word card pronunciation (BCP 47 → label). */
export const PRONUNCIATION_LANG_OPTIONS: Record<string, string> = {
	'en-US': 'English (US)',
	'en-GB': 'English (UK)',
	'fr-FR': 'French',
	'de-DE': 'German',
	'es-ES': 'Spanish',
	'ja-JP': 'Japanese',
	'ko-KR': 'Korean',
};

/** Languages offered for translation source/target. */
export const TRANSLATION_LANG_OPTIONS: Record<string, string> = {
	en: 'English',
	zh: 'Chinese',
	fr: 'French',
	de: 'German',
	es: 'Spanish',
	ja: 'Japanese',
	ko: 'Korean',
};

/**
 * Derive the subtitle panel control visibility from the plugin settings.
 * Used by SubtitleView and VideoPlayerView when constructing SubtitlePanel.
 */
export function subtitlePanelVisibility(settings: DialSettings): SubtitlePanelVisibility {
	return {
		abLoop: settings.showABLoop,
		speed: settings.showSpeed,
		search: settings.showSubtitleSearch,
	};
}

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
					'Folder and all-files modes loop to the next episode in the configured scope.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('none', 'Play once (no loop)')
					.addOption('single', 'Loop single episode')
					.addOption('folder', 'Loop current folder')
					.addOption('all', 'Loop all files')
					.setValue(this.plugin.settings.loopMode)
					.onChange(async (value) => {
						const mode = value as LoopMode;
						this.plugin.settings.loopMode = mode;
						await this.plugin.saveSettings();
						this.plugin.applyLoopMode(mode);
						// Show/hide the mode-attached settings below.
						folderSettingsEl.style.display = mode === 'folder' ? '' : 'none';
						allSettingsEl.style.display = mode === 'all' ? '' : 'none';
					}),
			);

		// Folder-loop-attached settings: only meaningful in "folder" mode, so
		// show them only then. They are kept mounted (values persist) and
		// toggled via display:none to avoid calling the deprecated display().
		// Rendered as indented children of "Loop mode" for visual hierarchy.
		const folderSettingsEl = containerEl.createDiv({ cls: 'dial-loop-subsettings' });
		folderSettingsEl.style.display = this.plugin.settings.loopMode === 'folder' ? '' : 'none';

		new Setting(folderSettingsEl)
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

		new Setting(folderSettingsEl)
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

		// All-files-loop-attached settings: only meaningful in "all" mode, so
		// show them only then. Same nested/conditional treatment as the folder
		// settings above, rendered as indented children of "Loop mode".
		const allSettingsEl = containerEl.createDiv({ cls: 'dial-loop-subsettings' });
		allSettingsEl.style.display = this.plugin.settings.loopMode === 'all' ? '' : 'none';

		new Setting(allSettingsEl)
			.setName('All files order mode')
			.setDesc(
				'How the next episode is chosen in "Loop all files" mode. ' +
					'"File tree order" follows the folder under the all-files root sorted by path; ' +
					'"Index.md list" follows the order declared in an index.md file ' +
					'in that root under a "# List" heading.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('tree', 'File tree order')
					.addOption('index', 'Index.md list')
					.setValue(this.plugin.settings.allFilesOrderMode)
					.onChange(async (value) => {
						const mode = value as FolderOrderMode;
						this.plugin.settings.allFilesOrderMode = mode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(allSettingsEl)
			.setName('All files root')
			.setDesc(
				'Vault-relative folder that scopes "Loop all files" mode. Every ' +
					'playable note under this folder (recursively) becomes the loop ' +
					'playlist. Defaults to "note/".',
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.allFilesRoot).onChange(async (value) => {
					this.plugin.settings.allFilesRoot =
						trimTrailingSlash(value) || DEFAULT_SETTINGS.allFilesRoot;
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

		new Setting(containerEl).setName('Subtitle panel').setHeading();

		new Setting(containerEl)
			.setName('Show loop controls')
			.setDesc('Display the start/end loop buttons on the subtitle panel.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showABLoop).onChange(async (value) => {
					this.plugin.settings.showABLoop = value;
					await this.plugin.saveSettings();
					this.plugin.applySubtitlePanelVisibility();
				}),
			);

		new Setting(containerEl)
			.setName('Show playback speed control')
			.setDesc('Display the playback speed slider on the subtitle panel.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showSpeed).onChange(async (value) => {
					this.plugin.settings.showSpeed = value;
					await this.plugin.saveSettings();
					this.plugin.applySubtitlePanelVisibility();
				}),
			);

		new Setting(containerEl)
			.setName('Show subtitle search')
			.setDesc('Display the subtitle search box on the subtitle panel.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showSubtitleSearch).onChange(async (value) => {
					this.plugin.settings.showSubtitleSearch = value;
					await this.plugin.saveSettings();
					this.plugin.applySubtitlePanelVisibility();
				}),
			);

		new Setting(containerEl).setName('Word card').setHeading();

		// Pronunciation engine priority list: one traffic-light row per
		// engine, reorderable with arrows. Android WebView has no system
		// speech at all (red dot), so the order decides whether a cloud
		// engine takes over — that is the point of letting users set it.
		const enginesSetting = new Setting(containerEl)
			.setName('Pronunciation engines')
			.setDesc(
				'Engines tried top to bottom when pronouncing a word. The dot ' +
					'shows whether an engine works on this device. Cloud engines ' +
					'appear here once their API key is configured.',
			);
		const enginesListEl = enginesSetting.descEl.createDiv({ cls: 'dial-speech-engines' });
		const renderEngines = () => {
			this.renderEngineList(
				enginesListEl,
				() =>
					createSpeechChain(() => this.plugin.settings)
						.statuses()
						.map((status) => ({
							id: status.id,
							label: status.label,
							dot: status.available
								? ('available' as const)
								: ('unavailable' as const),
						})),
				'speechEngineOrder',
			);
		};
		renderEngines();

		new Setting(containerEl).addButton((button) =>
			button.setButtonText('Re-detect engines').onClick(() => renderEngines()),
		);

		new Setting(containerEl)
			.setName('Pronunciation language')
			.setDesc(
				'Language used to pronounce a word when you press the speaker ' +
					'button on the word card. Applies to new pronunciations immediately.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(PRONUNCIATION_LANG_OPTIONS)
					.setValue(this.plugin.settings.wordPronunciationLang)
					.onChange(async (value) => {
						this.plugin.settings.wordPronunciationLang = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Auto-pronounce on card open')
			.setDesc(
				'Speak the word automatically when the word card appears. ' +
					'The speaker button on the card still works where a pronunciation ' +
					'engine is available (see the engine list above).',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.wordAutoPronounce).onChange(async (value) => {
					this.plugin.settings.wordAutoPronounce = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Translation').setHeading();

		new Setting(containerEl)
			.setName('Enable cloud translation')
			.setDesc(
				'Opt-in: show word translations on the word card. Words that are not ' +
					'in the local cache are sent to the cloud service configured below; ' +
					'results are cached in your vault and reused without further requests.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.translationEnabled).onChange(async (value) => {
					this.plugin.settings.translationEnabled = value;
					await this.plugin.saveSettings();
				}),
			);

		const translationEnginesSetting = new Setting(containerEl)
			.setName('Translation engines')
			.setDesc(
				'Tried top to bottom. Green = API key configured, yellow = needs a ' +
					'key (fields below).',
			);
		const translationListEl = translationEnginesSetting.descEl.createDiv({
			cls: 'dial-speech-engines',
		});
		const renderTranslationEngines = () => {
			this.renderEngineList(
				translationListEl,
				() =>
					createTranslationChain(() => this.plugin.settings)
						.statuses()
						.map((status) => ({
							id: status.id,
							label: status.label,
							dot: status.configured ? ('available' as const) : ('partial' as const),
						})),
				'translationEngineOrder',
			);
		};
		renderTranslationEngines();

		new Setting(containerEl)
			.setName('Source language')
			.setDesc('Language of the subtitle words being looked up.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(TRANSLATION_LANG_OPTIONS)
					.setValue(this.plugin.settings.translationSourceLang)
					.onChange(async (value) => {
						this.plugin.settings.translationSourceLang = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Target language')
			.setDesc('Language the translation is shown in.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(TRANSLATION_LANG_OPTIONS)
					.setValue(this.plugin.settings.translationTargetLang)
					.onChange(async (value) => {
						this.plugin.settings.translationTargetLang = value;
						await this.plugin.saveSettings();
					}),
			);

		const keyField = (
			name: string,
			getValue: () => string,
			save: (value: string) => Promise<void>,
			onRefresh: () => void,
		) =>
			new Setting(containerEl).setName(name).addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(getValue()).onChange(async (value) => {
					await save(value);
					onRefresh();
				});
			});

		keyField(
			'Azure Translator key',
			() => this.plugin.settings.azureTranslateKey,
			async (value) => {
				this.plugin.settings.azureTranslateKey = value;
				await this.plugin.saveSettings();
			},
			renderTranslationEngines,
		);

		new Setting(containerEl)
			.setName('Azure region')
			.setDesc('Region of your Translator resource, e.g. eastus or global.')
			.addText((text) =>
				text.setValue(this.plugin.settings.azureRegion).onChange(async (value) => {
					this.plugin.settings.azureRegion = value.trim();
					await this.plugin.saveSettings();
					renderTranslationEngines();
				}),
			);

		keyField(
			'DeepL API key',
			() => this.plugin.settings.deeplKey,
			async (value) => {
				this.plugin.settings.deeplKey = value;
				await this.plugin.saveSettings();
			},
			renderTranslationEngines,
		);

		new Setting(containerEl)
			.setName('DeepL plan')
			.setDesc('Free keys use api-free.deepl.com; pro keys use api.deepl.com.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('free', 'Free')
					.addOption('pro', 'Pro')
					.setValue(this.plugin.settings.deeplPlan)
					.onChange(async (value) => {
						this.plugin.settings.deeplPlan = value as DeeplPlan;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Word flip').setHeading();

		new Setting(containerEl)
			.setName('Vocabulary bucket path')
			.setDesc(
				'Vault-relative folder that holds word books. Every .md file in it ' +
					'(recursively) is listed as a book; drop a shared book file into ' +
					'this folder to import it.',
			)
			.addText((text) =>
				text
					.setPlaceholder('_lib/vocabulary-bucket')
					.setValue(this.plugin.settings.vocabularyBucketPath)
					.onChange(async (value) => {
						this.plugin.settings.vocabularyBucketPath =
							trimTrailingSlash(value) || DEFAULT_SETTINGS.vocabularyBucketPath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Meaning visibility')
			.setDesc(
				'"Reveal on tap" shows only the word first — tap the card to reveal ' +
					'phonetics, meaning and word forms (active recall). "Always visible" ' +
					'shows everything immediately for fast review passes.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('hidden', 'Reveal on tap')
					.addOption('always', 'Always visible')
					.setValue(this.plugin.settings.wordFlipRevealMode)
					.onChange(async (value) => {
						this.plugin.settings.wordFlipRevealMode = value as WordFlipRevealMode;
						await this.plugin.saveSettings();
					}),
			);
	}

	/**
	 * Render one reorderable engine priority list (shared by the speech
	 * and translation engine settings). Rows are recomputed through
	 * `getRows` on every render, so availability dots refresh after a
	 * reorder, a key edit, or a Re-detect press.
	 */
	private renderEngineList(
		listEl: HTMLElement,
		getRows: () => {
			id: string;
			label: string;
			dot: 'available' | 'partial' | 'unavailable';
		}[],
		orderSettingKey: 'speechEngineOrder' | 'translationEngineOrder',
	): void {
		listEl.empty();
		const rows = getRows();
		const order = this.plugin.settings[orderSettingKey];

		rows.forEach((row, index) => {
			const rowEl = listEl.createDiv({ cls: 'dial-speech-engine-row' });
			rowEl.createSpan({ cls: `dial-speech-dot dial-speech-dot-${row.dot}` });
			rowEl.createSpan({ cls: 'dial-speech-engine-label', text: row.label });

			const move = (delta: number, icon: string) => {
				const btn = rowEl.createEl('button', {
					cls: 'dial-speech-engine-move',
					attr: {
						'aria-label': delta < 0 ? 'Move up' : 'Move down',
						title: delta < 0 ? 'Move up' : 'Move down',
					},
				});
				setIcon(btn, icon);
				btn.disabled = index + delta < 0 || index + delta >= rows.length;
				btn.addEventListener('click', async () => {
					const target = index + delta;
					const current = order[index];
					const swapWith = order[target];
					if (current === undefined || swapWith === undefined) return;
					order[index] = swapWith;
					order[target] = current;
					this.plugin.settings[orderSettingKey] = [...order];
					await this.plugin.saveSettings();
					this.renderEngineList(listEl, getRows, orderSettingKey);
				});
			};
			move(-1, 'chevron-up');
			move(1, 'chevron-down');
		});
	}
}

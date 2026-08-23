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
	azureSpeechKey: string;
	azureSpeechRegion: string;
	googleSpeechKey: string;
	/** Master opt-in for cloud translation (policy: default off). */
	translationEnabled: boolean;
	translationSourceLang: string;
	translationTargetLang: string;
	translationEngineOrder: string[];
	azureTranslateKey: string;
	azureRegion: string;
	deeplKey: string;
	deeplPlan: DeeplPlan;
	baiduTranslateAppId: string;
	baiduTranslateSecret: string;
	tencentSecretId: string;
	tencentSecretKey: string;
	/** Baidu Cloud speech (TTS) API Key / Secret Key (AI platform, not translate). */
	baiduSpeechApiKey: string;
	baiduSpeechSecretKey: string;
	/** Alibaba Cloud speech (TTS) AccessKey pair + NLS project appkey. */
	aliyunAccessKeyId: string;
	aliyunAccessKeySecret: string;
	aliyunAppKey: string;
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
	speechEngineOrder: ['system', 'azure', 'google', 'tencent', 'alibaba', 'baidu'],
	azureSpeechKey: '',
	azureSpeechRegion: '',
	googleSpeechKey: '',
	baiduSpeechApiKey: '',
	baiduSpeechSecretKey: '',
	aliyunAccessKeyId: '',
	aliyunAccessKeySecret: '',
	aliyunAppKey: '',
	translationEnabled: false,
	translationSourceLang: 'en',
	translationTargetLang: 'zh',
	translationEngineOrder: ['azure-translate', 'deepl', 'baidu-translate', 'tencent-translate'],
	azureTranslateKey: '',
	azureRegion: '',
	deeplKey: '',
	deeplPlan: 'free',
	baiduTranslateAppId: '',
	baiduTranslateSecret: '',
	tencentSecretId: '',
	tencentSecretKey: '',
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
							dot: status.state,
						})),
				'speechEngineOrder',
			);
		};
		renderEngines();

		new Setting(containerEl).addButton((button) =>
			button.setButtonText('Re-detect engines').onClick(() => renderEngines()),
		);

		new Setting(containerEl)
			.setName('Azure speech key')
			.setDesc(
				'Key of your Azure speech resource (the free tier works). The yellow dot ' +
					'above turns green once key and region are set.',
			)
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(this.plugin.settings.azureSpeechKey).onChange(async (value) => {
					this.plugin.settings.azureSpeechKey = value;
					await this.plugin.saveSettings();
					renderEngines();
				});
			});

		new Setting(containerEl)
			.setName('Azure speech region')
			.setDesc('Region of the speech resource, for example eastus')
			.addText((text) =>
				text.setValue(this.plugin.settings.azureSpeechRegion).onChange(async (value) => {
					this.plugin.settings.azureSpeechRegion = value.trim();
					await this.plugin.saveSettings();
					renderEngines();
				}),
			);

		new Setting(containerEl)
		.setName('Google text-to-speech key')
		.setDesc('API key of the project with the text-to-speech API enabled')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.googleSpeechKey).onChange(async (value) => {
				this.plugin.settings.googleSpeechKey = value;
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

	// The three Chinese clouds need no international payment method, so they
	// are the realistic choice for many users. Tencent speech reuses the
	// Tencent Cloud secret configured under Translation below.
	new Setting(containerEl)
		.setName('Tencent speech')
		.setDesc(
			'Tencent speech reuses the secret ID and secret key you set under translation ' +
				'below, so no separate key is needed.',
		);

	new Setting(containerEl)
		.setName('Baidu speech API key')
		.setDesc('AI platform API key of the application with the speech service enabled')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.baiduSpeechApiKey).onChange(async (value) => {
				this.plugin.settings.baiduSpeechApiKey = value;
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

	new Setting(containerEl)
		.setName('Baidu speech secret key')
		.setDesc('Secret key paired with the speech API key above')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.baiduSpeechSecretKey).onChange(async (value) => {
				this.plugin.settings.baiduSpeechSecretKey = value;
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

	new Setting(containerEl)
		.setName('Alibaba access key ID')
		.setDesc('Access key ID for your cloud account, used to mint a speech token')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.aliyunAccessKeyId).onChange(async (value) => {
				this.plugin.settings.aliyunAccessKeyId = value.trim();
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

	new Setting(containerEl)
		.setName('Alibaba access key secret')
		.setDesc('Access key secret paired with the access key ID above')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.aliyunAccessKeySecret).onChange(async (value) => {
				this.plugin.settings.aliyunAccessKeySecret = value;
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

	new Setting(containerEl)
		.setName('Alibaba speech appkey')
		.setDesc('Appkey of the speech interaction project, separate from the access key')
		.addText((text) => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.aliyunAppKey).onChange(async (value) => {
				this.plugin.settings.aliyunAppKey = value.trim();
				await this.plugin.saveSettings();
				renderEngines();
			});
		});

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
			.setDesc('Region of the translator resource, for example eastus or global')
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
			.setName('Plan')
			.setDesc('Choose the matching host for your key tier')
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

		new Setting(containerEl)
			.setName('Baidu translate app ID')
			.setDesc('App ID of the translate app you created on the open platform')
			.addText((text) =>
				text.setValue(this.plugin.settings.baiduTranslateAppId).onChange(async (value) => {
					this.plugin.settings.baiduTranslateAppId = value.trim();
					await this.plugin.saveSettings();
					renderTranslationEngines();
				}),
			);

		new Setting(containerEl)
			.setName('Baidu translate secret')
			.setDesc('Secret key paired with the app ID above')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(this.plugin.settings.baiduTranslateSecret).onChange(async (value) => {
					this.plugin.settings.baiduTranslateSecret = value;
					await this.plugin.saveSettings();
					renderTranslationEngines();
				});
			});

		new Setting(containerEl)
			.setName('Tencent secret ID')
			.setDesc('Tencent secret ID of the key you created in the console')
			.addText((text) =>
				text.setValue(this.plugin.settings.tencentSecretId).onChange(async (value) => {
					this.plugin.settings.tencentSecretId = value.trim();
					await this.plugin.saveSettings();
					renderTranslationEngines();
				}),
			);

		new Setting(containerEl)
			.setName('Tencent secret key')
			.setDesc('Tencent secret key, paired with the secret ID above')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(this.plugin.settings.tencentSecretKey).onChange(async (value) => {
					this.plugin.settings.tencentSecretKey = value;
					await this.plugin.saveSettings();
					renderTranslationEngines();
				});
			});

		new Setting(containerEl).setName('Lookup data').setHeading();

		const formatBytes = (bytes: number): string => {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		};

		const cacheStatsEl = containerEl.createDiv({ cls: 'dial-cache-stats' });
		const renderCacheStats = async () => {
			cacheStatsEl.empty();
			try {
				const [translate, audio, queries] = await Promise.all([
					this.plugin.translateCache.stats(),
					this.plugin.audioCache.stats(),
					this.plugin.queryLogger.aggregate(),
				]);
				const translateBytes = translate.months.reduce((sum, m) => sum + m.bytes, 0);
				const audioBytes = audio.months.reduce((sum, m) => sum + m.bytes, 0);
				cacheStatsEl
					.createDiv()
					.setText(
						`Translation cache: ${translate.totalEntries} entries ` +
							`(${translate.totalStale} stale), ${formatBytes(translateBytes)}`,
					);
				cacheStatsEl
					.createDiv()
					.setText(`Audio cache: ${audio.totalFiles} files, ${formatBytes(audioBytes)}`);
				cacheStatsEl
					.createDiv()
					.setText(
						`Lookups: ${queries.total.lookups} total — ${queries.total.cacheHits} cache ` +
							`hits, ${queries.total.apiRequests} API requests ` +
							`(≈${queries.total.chars} chars), ${queries.total.failed} failed`,
					);
			} catch {
				cacheStatsEl.createDiv().setText('Cache stats unavailable.');
			}
		};
		void renderCacheStats();

		new Setting(containerEl)
			.setName('Clear stale translation records')
			.setDesc('Safe: removes old-month copies whose data already lives in a newer month.')
			.addButton((button) =>
				button
					.setButtonText('Clear stale')
					.setClass('mod-warning')
					.onClick(async () => {
						const removed = await this.plugin.translateCache.clearStale();
						new Notice(`Removed ${removed} stale translation records`);
						await renderCacheStats();
					}),
			);

		new Setting(containerEl)
			.setName('Clear cache before this month')
			.setDesc(
				'Danger: deletes all older translation and audio months. ' +
					'Words looked up again will re-request from your cloud engines.',
			)
			.addButton((button) =>
				button
					.setButtonText('Clear old months')
					.setClass('mod-warning')
					.onClick(async () => {
						const translations =
							await this.plugin.translateCache.clearBeforeCurrentMonth();
						const audio = await this.plugin.audioCache.clearBeforeCurrentMonth();
						new Notice(`Removed ${translations} translations and ${audio} audio files`);
						await renderCacheStats();
					}),
			);

		new Setting(containerEl)
			.setName('Clear lookup logs')
			.setDesc('Danger: deletes the query history under _lib/logs. Stats reset to zero.')
			.addButton((button) =>
				button
					.setButtonText('Clear logs')
					.setClass('mod-warning')
					.onClick(async () => {
						const removed = await this.plugin.queryLogger.clearAll();
						new Notice(`Removed ${removed} log lines`);
						await renderCacheStats();
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
				btn.addEventListener('click', () => {
					void (async () => {
						const target = index + delta;
						const current = order[index];
						const swapWith = order[target];
						if (current === undefined || swapWith === undefined) return;
						order[index] = swapWith;
						order[target] = current;
						this.plugin.settings[orderSettingKey] = [...order];
						await this.plugin.saveSettings();
						this.renderEngineList(listEl, getRows, orderSettingKey);
					})();
				});
			};
			move(-1, 'chevron-up');
			move(1, 'chevron-down');
		});
	}
}

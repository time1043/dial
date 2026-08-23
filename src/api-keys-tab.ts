import { App, PluginSettingTab, Setting } from 'obsidian';

import { createSpeechChain } from '@/modules/speech/create-speech-chain';
import { createTranslationChain } from '@/modules/translation/create-translation-chain';
import { renderEngineList } from './engine-list';

import type DialPlugin from './main';

/**
 * Dedicated tab for every credential-backed setting (cloud TTS + cloud
 * translation keys). Kept separate from the behaviour-focused main tab so the
 * average user only sees API fields when they actually intend to wire a cloud
 * engine. Engine status dots live here too, because they reflect key state.
 */
export class DialApiKeysTab extends PluginSettingTab {
	plugin: DialPlugin;

	constructor(app: App, plugin: DialPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl
			.createDiv({ cls: 'setting-item-description' })
			.setText(
				'All keys are stored locally in your vault settings and are only sent ' +
					'when calling the matching cloud service. Leave a field blank to keep ' +
					'that engine disabled — its dot stays grey below. No key is needed for ' +
					'the system (browser) pronunciation engine.',
			);

		new Setting(containerEl).setName('Pronunciation').setHeading();

		// Pronunciation engine priority list: one traffic-light row per engine,
		// reorderable with arrows. Cloud engines appear here once their key is set.
		const enginesSetting = new Setting(containerEl)
			.setName('Pronunciation engines')
			.setDesc(
				'Engines tried top to bottom when pronouncing a word. The dot shows ' +
					'whether an engine works on this device. Cloud engines appear here ' +
					'once their API key is configured.',
			);
		const enginesListEl = enginesSetting.descEl.createDiv({ cls: 'dial-speech-engines' });
		const renderEngines = () => {
			renderEngineList(
				this.plugin,
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
				'Key of your Azure speech resource (the free tier works). The dot above ' +
					'turns green once key and region are set.',
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

		// Tencent speech reuses the Tencent Cloud secret configured under
		// Translation below, so it needs no separate key field.
		new Setting(containerEl)
			.setName('Tencent speech')
			.setDesc(
				'Tencent speech reuses the secret ID and secret key you set under ' +
					'Translation below, so no separate key is needed.',
			);

		new Setting(containerEl)
			.setName('Baidu speech API key')
			.setDesc('API key of the application with the speech service enabled')
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

		new Setting(containerEl).setName('Translation').setHeading();

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
			renderEngineList(
				this.plugin,
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

		const keyField = (
			name: string,
			getValue: () => string,
			save: (value: string) => Promise<void>,
			onRefresh: () => void,
		) =>
			new Setting(containerEl)
				.setName(name)
				.addText((text) => {
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
						this.plugin.settings.deeplPlan = value as 'free' | 'pro';
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
			.setDesc('Secret ID of the key you created in the console')
			.addText((text) =>
				text.setValue(this.plugin.settings.tencentSecretId).onChange(async (value) => {
					this.plugin.settings.tencentSecretId = value.trim();
					await this.plugin.saveSettings();
					renderTranslationEngines();
				}),
			);

		new Setting(containerEl)
			.setName('Tencent secret key')
			.setDesc('Secret key, paired with the secret ID above')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(this.plugin.settings.tencentSecretKey).onChange(async (value) => {
					this.plugin.settings.tencentSecretKey = value;
					await this.plugin.saveSettings();
					renderTranslationEngines();
				});
			});
	}
}

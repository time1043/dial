import type { AudioCache } from '@/modules/word-cache/audio-cache';
import type { DialSettings } from '@/settings';

import type { SpeechProvider } from './speech-provider';

import { AliyunSpeechProvider } from './aliyun-speech-provider';
import { AzureSpeechProvider } from './azure-speech-provider';
import { BaiduSpeechProvider } from './baidu-speech-provider';
import { CachedSpeechProvider } from './cached-speech-provider';
import { GoogleSpeechProvider } from './google-speech-provider';
import { orderSpeechEngines, SpeechChain } from './speech-chain';
import { systemSpeechProvider } from './system-speech-provider';
import { TencentSpeechProvider } from './tencent-speech-provider';

/**
 * Build the pronunciation chain from the plugin settings. Cloud engines
 * register permanently; without a key they report unavailable and the
 * chain skips them, so the priority list stays stable across key edits.
 *
 * When an AudioCache is provided, cloud engines are wrapped so cached
 * audio replays without a request.
 */
export function createSpeechChain(
	getSettings: () => DialSettings,
	audioCache?: AudioCache,
): SpeechChain {
	const withCache = (provider: SpeechProvider): SpeechProvider =>
		audioCache ? new CachedSpeechProvider(provider, audioCache) : provider;

	const registry = [
		systemSpeechProvider,
		withCache(
			new AzureSpeechProvider(() => {
				const { azureSpeechKey, azureSpeechRegion } = getSettings();
				return { key: azureSpeechKey, region: azureSpeechRegion };
			}),
		),
		withCache(new GoogleSpeechProvider(() => getSettings().googleSpeechKey)),
		// The three Chinese clouds: no international payment method needed.
		withCache(
			new TencentSpeechProvider(() => {
				const { tencentSecretId, tencentSecretKey } = getSettings();
				return { secretId: tencentSecretId, secretKey: tencentSecretKey };
			}),
		),
		withCache(
			new AliyunSpeechProvider(() => {
				const { aliyunAccessKeyId, aliyunAccessKeySecret, aliyunAppKey } = getSettings();
				return {
					accessKeyId: aliyunAccessKeyId,
					accessKeySecret: aliyunAccessKeySecret,
					appKey: aliyunAppKey,
				};
			}),
		),
		withCache(
			new BaiduSpeechProvider(() => {
				const { baiduSpeechApiKey, baiduSpeechSecretKey } = getSettings();
				return { apiKey: baiduSpeechApiKey, secretKey: baiduSpeechSecretKey };
			}),
		),
	];
	return new SpeechChain(orderSpeechEngines(registry, getSettings().speechEngineOrder));
}

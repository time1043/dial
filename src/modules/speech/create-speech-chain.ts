import type { AudioCache } from '@/modules/word-cache/audio-cache';
import type { DialSettings } from '@/settings';

import type { SpeechProvider } from './speech-provider';

import { AzureSpeechProvider } from './azure-speech-provider';
import { CachedSpeechProvider } from './cached-speech-provider';
import { GoogleSpeechProvider } from './google-speech-provider';
import { orderSpeechEngines, SpeechChain } from './speech-chain';
import { systemSpeechProvider } from './system-speech-provider';

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
	];
	return new SpeechChain(orderSpeechEngines(registry, getSettings().speechEngineOrder));
}

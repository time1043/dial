import type { DialSettings } from '@/settings';

import { AzureSpeechProvider } from './azure-speech-provider';
import { GoogleSpeechProvider } from './google-speech-provider';
import { orderSpeechEngines, SpeechChain } from './speech-chain';
import { systemSpeechProvider } from './system-speech-provider';

/**
 * Build the pronunciation chain from the plugin settings. Cloud engines
 * register permanently; without a key they report unavailable and the
 * chain skips them, so the priority list stays stable across key edits.
 */
export function createSpeechChain(getSettings: () => DialSettings): SpeechChain {
	const registry = [
		systemSpeechProvider,
		new AzureSpeechProvider(() => {
			const { azureSpeechKey, azureSpeechRegion } = getSettings();
			return { key: azureSpeechKey, region: azureSpeechRegion };
		}),
		new GoogleSpeechProvider(() => getSettings().googleSpeechKey),
	];
	return new SpeechChain(orderSpeechEngines(registry, getSettings().speechEngineOrder));
}

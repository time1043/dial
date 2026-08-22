import type { DialSettings } from '@/settings';

import { orderSpeechEngines, SpeechChain } from './speech-chain';
import { systemSpeechProvider } from './system-speech-provider';

/**
 * Build the pronunciation chain from the plugin settings.
 *
 * The registry currently holds the system engine only; opt-in cloud
 * engines (Azure, Google) register here once implemented. The order is
 * re-read on every call, so settings changes apply to open panels
 * without a rebuild.
 */
export function createSpeechChain(getSettings: () => DialSettings): SpeechChain {
	const registry = [systemSpeechProvider];
	return new SpeechChain(orderSpeechEngines(registry, getSettings().speechEngineOrder));
}

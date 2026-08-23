import type { DialSettings } from '@/settings';

import { AzureTranslateProvider } from './azure-translate-provider';
import { DeeplTranslateProvider } from './deepl-translate-provider';
import { orderTranslationEngines, TranslationChain } from './translation-chain';

/**
 * Build the translation chain from plugin settings. Engines read their
 * credentials through getters, so key edits in settings apply without
 * rebuilding anything.
 */
export function createTranslationChain(getSettings: () => DialSettings): TranslationChain {
	const registry = [
		new AzureTranslateProvider(() => {
			const { azureTranslateKey, azureRegion } = getSettings();
			return { key: azureTranslateKey, region: azureRegion };
		}),
		new DeeplTranslateProvider(() => {
			const { deeplKey, deeplPlan } = getSettings();
			return { key: deeplKey, plan: deeplPlan };
		}),
	];
	return new TranslationChain(
		orderTranslationEngines(registry, getSettings().translationEngineOrder),
	);
}

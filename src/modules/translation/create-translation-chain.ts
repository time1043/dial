import type { DialSettings } from '@/settings';

import { AliyunTranslateProvider } from './aliyun-translate-provider';
import { AzureTranslateProvider } from './azure-translate-provider';
import { BaiduTranslateProvider } from './baidu-translate-provider';
import { DeeplTranslateProvider } from './deepl-translate-provider';
import { TencentTranslateProvider } from './tencent-translate-provider';
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
		new BaiduTranslateProvider(() => {
			const { baiduTranslateAppId, baiduTranslateSecret } = getSettings();
			return { appId: baiduTranslateAppId, secret: baiduTranslateSecret };
		}),
		new TencentTranslateProvider(() => {
			const { tencentSecretId, tencentSecretKey } = getSettings();
			return { secretId: tencentSecretId, secretKey: tencentSecretKey };
		}),
		new AliyunTranslateProvider(() => {
			const { aliyunAccessKeyId, aliyunAccessKeySecret } = getSettings();
			return { accessKeyId: aliyunAccessKeyId, accessKeySecret: aliyunAccessKeySecret };
		}),
	];
	return new TranslationChain(
		orderTranslationEngines(registry, getSettings().translationEngineOrder),
	);
}

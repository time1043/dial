import type { HttpFn } from '@/utils/http';

import { playAudioBuffer } from '@/utils/audio';
import { obsidianHttp } from '@/utils/http';

import type { SpeakRequest, SynthesizingSpeechProvider } from './speech-provider';

export const AZURE_SPEECH_ID = 'azure';

export interface AzureSpeechCredentials {
	key: string;
	region: string;
}

/** Neural voice per language; unknown tags fall back to the service default. */
const AZURE_VOICES: Record<string, string> = {
	'en-US': 'en-US-AriaNeural',
	'en-GB': 'en-GB-SoniaNeural',
	'fr-FR': 'fr-FR-DeniseNeural',
	'de-DE': 'de-DE-KatjaNeural',
	'es-ES': 'es-ES-ElviraNeural',
	'ja-JP': 'ja-JP-NanamiNeural',
	'ko-KR': 'ko-KR-SunHiNeural',
};

function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (ch) => {
		switch (ch) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case "'":
				return '&apos;';
			default:
				return '&quot;';
		}
	});
}

/**
 * Azure Speech (Text to Speech REST). Free tier F0 allows ~500K neural
 * characters/month — a spoken word is a dozen characters or so.
 */
export class AzureSpeechProvider implements SynthesizingSpeechProvider {
	readonly id = AZURE_SPEECH_ID;
	readonly label = 'Azure Speech';
	readonly kind = 'cloud' as const;

	constructor(
		private readonly getCredentials: () => AzureSpeechCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isAvailable(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.key.trim() !== '' && credentials.region.trim() !== '';
	}

	async synthesize(request: SpeakRequest): Promise<ArrayBuffer> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isAvailable()) {
			throw new Error('azure speech is not configured');
		}
		const voice = AZURE_VOICES[request.lang];
		const inner = voice
			? `<voice name='${voice}'>${escapeXml(request.word)}</voice>`
			: escapeXml(request.word);
		const ssml =
			`<speak version='1.0' xml:lang='${request.lang}' ` +
			`xmlns='http://www.w3.org/2001/10/synthesis'>${inner}</speak>`;

		const response = await this.http({
			url: `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': credentials.key,
				'Content-Type': 'application/ssml+xml',
				'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
			},
			body: ssml,
		});
		if (response.status !== 200 || !response.arrayBuffer) {
			throw new Error(`azure speech failed (${response.status})`);
		}
		return response.arrayBuffer;
	}

	async speak(request: SpeakRequest): Promise<void> {
		await playAudioBuffer(await this.synthesize(request));
	}
}

/**
 * Play in-memory audio (mp3 bytes from a cloud TTS engine).
 *
 * At most one clip plays at a time: a new playback stops the previous
 * one, mirroring the system engine's cancel-then-speak behavior so
 * rapid word hovers do not overlap.
 */
let currentAudio: HTMLAudioElement | null = null;

export function playAudioBuffer(data: ArrayBuffer): Promise<void> {
	currentAudio?.pause();
	currentAudio = null;

	const blob = new Blob([data], { type: 'audio/mpeg' });
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	currentAudio = audio;
	const release = () => {
		if (currentAudio === audio) currentAudio = null;
		URL.revokeObjectURL(url);
	};
	audio.addEventListener('ended', release);
	audio.addEventListener('error', release);
	return audio.play().then(() => undefined);
}

/**
 * Throw when a "success" audio response is actually a JSON error body.
 *
 * Baidu's and Aliyun's TTS gateways return HTTP 200 with a JSON body
 * ({"err_no":...} / {"status":...,"message":...}) when synthesis fails,
 * so a status check alone would feed the error text to the audio player
 * as if it were mp3. Real mp3 always starts with an ID3 tag or a frame
 * sync byte — never a brace — so sniffing the first byte is reliable.
 */
export function assertAudioResponse(data: ArrayBuffer, engineLabel: string): void {
	const firstByte = new Uint8Array(data, 0, Math.min(1, data.byteLength))[0];
	if (firstByte !== 0x7b && firstByte !== 0x5b) return; // not '{' or '['

	const head = new TextDecoder()
		.decode(new Uint8Array(data, 0, Math.min(data.byteLength, 300)))
		.trim();
	let detail = head;
	try {
		const parsed = JSON.parse(head) as Record<string, unknown>;
		detail =
			(parsed.err_msg as string) ??
			(parsed.message as string) ??
			(parsed.Message as string) ??
			head;
	} catch {
		// Truncated JSON — the raw head text is already informative.
	}
	throw new Error(`${engineLabel} tts returned a JSON error body: ${detail}`);
}

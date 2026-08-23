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

import type { Subtitle } from '@/types';

/**
 * Find the subtitle index at the given playback time.
 * Returns -1 if no subtitle is found.
 */
function findCurrentIndex(subtitles: Subtitle[], time: number): number {
	// Exact match: time falls within a subtitle's range
	const exact = subtitles.findIndex((s) => time >= s.start && time <= s.end);
	if (exact !== -1) return exact;

	// Nearest previous subtitle
	return subtitles.findLastIndex((s) => time >= s.start);
}

/**
 * Calculate the target subtitle index for a jump in the given direction.
 * Returns the target Subtitle, or null if no subtitles or nowhere to jump.
 */
export function getJumpTarget(
	subtitles: Subtitle[],
	currentTime: number,
	direction: number,
): Subtitle | null {
	if (subtitles.length === 0) return null;

	const idx = findCurrentIndex(subtitles, currentTime);
	const targetIdx = Math.max(0, Math.min(subtitles.length - 1, idx + direction));
	return subtitles[targetIdx] ?? null;
}

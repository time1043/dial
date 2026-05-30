import type { Subtitle } from '@/types';

function parseSrtTime(timeStr: string): number {
	// Format: HH:MM:SS,mmm
	const match = timeStr.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
	if (!match) return 0;
	const [, h, m, s, ms] = match;
	return parseInt(h!) * 3600 + parseInt(m!) * 60 + parseInt(s!) + parseInt(ms!) / 1000;
}

export function parseSrt(content: string): Subtitle[] {
	const blocks = content.split(/\r?\n\r?\n/);
	const subtitles: Subtitle[] = [];
	let id = 0;

	for (const block of blocks) {
		const lines = block.trim().split(/\r?\n/);
		if (lines.length < 2) continue;

		// First line is the sequence number (skip it)
		// Second line is the time range: 00:00:01,000 --> 00:00:03,230
		const timeLine = lines[1];
		if (!timeLine) continue;

		const timeMatch = timeLine.match(
			/^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/,
		);
		if (!timeMatch) continue;

		const start = parseSrtTime(timeMatch[1]!);
		const end = parseSrtTime(timeMatch[2]!);

		// Remaining lines are the subtitle text
		const text = lines
			.slice(2)
			.join('\n')
			.replace(/<\/?[^>]+>/g, '') // strip HTML tags
			.trim();

		if (text.length > 0) {
			subtitles.push({ id: id++, start, end, text });
		}
	}

	return subtitles;
}

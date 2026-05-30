import type { Subtitle } from '@/types';

import { parseSrt } from './srt-parser';

export type SubtitleParser = (content: string) => Subtitle[];

const parsers: Record<string, SubtitleParser> = {
	srt: parseSrt,
	// Future: ass: parseAss,
};

function decodeBuffer(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return new TextDecoder('utf-16le').decode(buffer);
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return new TextDecoder('utf-16be').decode(buffer);
	}
	return new TextDecoder('utf-8').decode(buffer);
}

export function parseSubtitle(buffer: ArrayBuffer, filename: string): Subtitle[] {
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	const parser = parsers[ext];
	if (!parser) {
		throw new Error(`Unsupported subtitle format: .${ext}`);
	}
	const content = decodeBuffer(buffer);
	return parser(content);
}

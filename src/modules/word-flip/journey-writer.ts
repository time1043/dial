import { TFile, type Vault } from 'obsidian';

import type { WordEntry } from './book-parser';

export const JOURNEY_DIR = '_lib/vocabulary-journey';

/** One word row inside a journey session table. */
export interface JourneyWordSnapshot {
	entry: WordEntry;
	marked: boolean;
}

/** Everything needed to append one settled session to a journey file. */
export interface JourneySessionRecord {
	/** Vault path of the word book (keys the journey file name). */
	bookPath: string;
	/** Session start position — 0 (first word) opens a new epoch. */
	startIdx: number;
	/** Covered range (0-based, inclusive). */
	minIdx: number;
	maxIdx: number;
	startTime: Date;
	endTime: Date;
	/** Word snapshots for [minIdx..maxIdx], marked state at settle time. */
	words: JourneyWordSnapshot[];
}

/** `_lib/vocabulary-journey/<book file name>` — one journey file per book. */
export function journeyFilePath(bookPath: string): string {
	const base = bookPath.split('/').pop() ?? bookPath;
	return `${JOURNEY_DIR}/${base}`;
}

/**
 * Resume URL for a journey trail link. Lands in browse mode at the given
 * (0-based) word position; the index is 1-based in the URL for human
 * readability.
 */
export function buildResumeUrl(bookPath: string, index: number): string {
	return (
		`obsidian://dial?type=word-flip&book=${encodeURIComponent(bookPath)}` +
		`&index=${index + 1}`
	);
}

/** Highest `# Epoch N` number found in a journey file (0 when none). */
export function countEpochs(content: string): number {
	let max = 0;
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^#\s+Epoch\s+(\d+)\s*$/i);
		if (match) {
			max = Math.max(max, Number.parseInt(match[1]!, 10));
		}
	}
	return max;
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

function formatClock(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatDate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDurationMinutes(start: Date, end: Date): number {
	return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

function escapeCell(text: string): string {
	return text.replace(/\|/g, '\\|');
}

function formatWordRow(position: number, snapshot: JourneyWordSnapshot): string {
	const { entry, marked } = snapshot;
	return (
		`| ${position} | ${escapeCell(entry.word)} | ${escapeCell(entry.ipa)} | ` +
		`${escapeCell(entry.meaning)} | ${escapeCell(entry.forms)} | ${marked ? '★' : ''} |`
	);
}

function formatSessionBlock(record: JourneySessionRecord): string {
	const from = formatClock(record.startTime);
	const to = formatClock(record.endTime);
	const minutes = formatDurationMinutes(record.startTime, record.endTime);

	const lines: string[] = [];
	lines.push(`## ${formatDate(record.startTime)} ${from} → ${to} (${minutes}min)`);
	lines.push('');
	// Session trail directly under the heading: a plain marker line, then
	// the covered word range as links that jump back to those positions.
	lines.push('- ▶ Resume word flip');
	lines.push(
		`- [Start word: ${record.startIdx + 1}](${buildResumeUrl(record.bookPath, record.startIdx)})`,
	);
	lines.push(
		`- [End word: ${record.maxIdx + 1}](${buildResumeUrl(record.bookPath, record.maxIdx)})`,
	);
	lines.push('');
	lines.push('| # | word | ipa | meaning | forms | marked |');
	lines.push('| - | ---- | --- | ------- | ----- | ------ |');
	record.words.forEach((snapshot, offset) => {
		lines.push(formatWordRow(record.minIdx + offset + 1, snapshot));
	});
	return lines.join('\n');
}

/**
 * Pure content builder: append one settled session to a journey file's
 * content. A session started at the first word opens a new epoch; anything
 * else is appended under the latest epoch (creating Epoch 1 if the file is
 * new).
 */
export function buildJourneyAppend(existing: string, record: JourneySessionRecord): string {
	const epochs = countEpochs(existing);
	const newEpoch = record.startIdx === 0 || epochs === 0;
	const epochNumber = epochs + 1;

	const parts: string[] = [];
	if (newEpoch) {
		parts.push(`# Epoch ${epochNumber}`);
	}
	parts.push(formatSessionBlock(record));

	const separator = existing.trim().length === 0 ? '' : existing.trimEnd();
	return `${separator}${separator ? '\n\n' : ''}${parts.join('\n\n')}\n`;
}

/** Append a settled session to the book's journey file (single write). */
export async function appendJourneySession(
	vault: Vault,
	record: JourneySessionRecord,
): Promise<void> {
	if (!vault.getAbstractFileByPath(JOURNEY_DIR)) {
		await vault.createFolder(JOURNEY_DIR);
	}

	const path = journeyFilePath(record.bookPath);
	const file = vault.getAbstractFileByPath(path);
	const existing = file instanceof TFile ? await vault.read(file) : '';

	const updated = buildJourneyAppend(existing, record);
	if (file instanceof TFile) {
		await vault.modify(file, updated);
	} else {
		await vault.create(path, updated);
	}
}

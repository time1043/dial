import { extractPunctuation } from './type-session-manager';

export type ParsedWord = { leading: string; word: string; trailing: string };

/** Merge all-punctuation tokens (word === '') into adjacent word tokens. */
export function mergePunctuation(tokens: ParsedWord[]): ParsedWord[] {
	const merged: ParsedWord[] = [];
	let pendingLeading = '';

	for (const t of tokens) {
		if (t.word === '') {
			// All-punctuation token — attach as punctuation of adjacent words
			const punct = t.leading;
			if (merged.length > 0) {
				merged[merged.length - 1]!.trailing += punct;
			} else {
				pendingLeading += punct;
			}
		} else {
			merged.push({
				leading: pendingLeading + t.leading,
				word: t.word,
				trailing: t.trailing,
			});
			pendingLeading = '';
		}
	}

	// Stray punctuation at the very end
	if (pendingLeading && merged.length > 0) {
		merged[merged.length - 1]!.trailing += pendingLeading;
	}

	return merged;
}

/**
 * Parse a subtitle text line into ParsedWord[].
 * Convenience wrapper: splits on whitespace, extracts punctuation,
 * and merges all-punctuation tokens into adjacent words.
 */
export function parseWords(text: string): ParsedWord[] {
	const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
	return mergePunctuation(rawWords.map((w) => extractPunctuation(w)));
}

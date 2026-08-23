/** One cached translation for a word + translation direction. */
export interface TranslateCacheRecord {
	translation: string;
	phonetic?: string;
	/** Source language tag, e.g. `en`. */
	from: string;
	/** Target language tag, e.g. `zh`. */
	to: string;
	/** Engine id that produced this translation. */
	engine: string;
	/** Epoch ms of the first lookup that stored this record. */
	firstSeen: number;
	/** Epoch ms of the most recent lookup (including promotions). */
	lastSeen: number;
	/** How many times this word was looked up — feeds the word flip module. */
	lookupCount: number;
	/**
	 * Set on the old copy after the record was promoted into a newer
	 * month file. Stale records are the first victims of cache cleanup:
	 * the data still exists in the newer month, so removing them is safe.
	 */
	stale?: boolean;
}

/** Where a lookup found its record, for logs and stats. */
export type LookupSource = 'current' | 'promoted' | 'miss';

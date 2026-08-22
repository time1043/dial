/**
 * Authoritative live state for word flipping: per-book last position and
 * marked-word set, plus the most recently opened book. Persisted inside the
 * plugin's data.json (journey files are only session logs — this store is
 * what epochs inherit their marks from).
 *
 * Writes are debounced because swiping can change the position several
 * times a second; flush() forces an immediate persist (used on unload).
 */

interface PersistedBookState {
	lastIndex: number;
	marked: Record<string, true>;
}

interface PersistedWordFlipData {
	lastBook: string | null;
	books: Record<string, PersistedBookState>;
}

const PERSIST_DEBOUNCE_MS = 500;

export function createEmptyFlipData(): PersistedWordFlipData {
	return { lastBook: null, books: {} };
}

export class WordFlipStore {
	private data = createEmptyFlipData();
	private persist: (() => void) | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;

	/** Hydrate from the plugin data blob, ignoring malformed parts. */
	load(raw: unknown): void {
		this.data = sanitizeData(raw);
	}

	serialize(): PersistedWordFlipData {
		return this.data;
	}

	setPersistCallback(persist: () => void): void {
		this.persist = persist;
	}

	getLastBook(): string | null {
		return this.data.lastBook;
	}

	setLastBook(bookPath: string): void {
		if (this.data.lastBook === bookPath) return;
		this.data.lastBook = bookPath;
		this.schedulePersist();
	}

	/** Last saved 0-based position for a book (null when never opened). */
	getLastIndex(bookPath: string): number | null {
		const book = this.data.books[bookPath];
		return book ? book.lastIndex : null;
	}

	recordIndex(bookPath: string, index: number): void {
		const book = this.ensureBook(bookPath);
		if (book.lastIndex === index) return;
		book.lastIndex = index;
		this.schedulePersist();
	}

	isMarked(bookPath: string, word: string): boolean {
		return Boolean(this.data.books[bookPath]?.marked[word]);
	}

	/** Toggle a word's mark; returns the new marked state. */
	toggleMark(bookPath: string, word: string): boolean {
		const book = this.ensureBook(bookPath);
		if (book.marked[word]) {
			delete book.marked[word];
			this.schedulePersist();
			return false;
		}
		book.marked[word] = true;
		this.schedulePersist();
		return true;
	}

	getMarkedWords(bookPath: string): string[] {
		return Object.keys(this.data.books[bookPath]?.marked ?? {});
	}

	/** Run any pending debounced persist immediately. */
	flush(): void {
		if (this.persistTimer !== null) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
		this.persist?.();
	}

	private ensureBook(bookPath: string): PersistedBookState {
		let book = this.data.books[bookPath];
		if (!book) {
			book = { lastIndex: 0, marked: {} };
			this.data.books[bookPath] = book;
		}
		return book;
	}

	private schedulePersist(): void {
		if (this.persistTimer !== null) {
			clearTimeout(this.persistTimer);
		}
		this.persistTimer = setTimeout(() => {
			this.persistTimer = null;
			this.persist?.();
		}, PERSIST_DEBOUNCE_MS);
	}
}

function sanitizeData(raw: unknown): PersistedWordFlipData {
	const clean = createEmptyFlipData();
	if (typeof raw !== 'object' || raw === null) return clean;

	const source = raw as Record<string, unknown>;
	if (typeof source['lastBook'] === 'string') {
		clean.lastBook = source['lastBook'];
	}
	if (typeof source['books'] === 'object' && source['books'] !== null) {
		for (const [path, value] of Object.entries(source['books'] as Record<string, unknown>)) {
			if (typeof value !== 'object' || value === null) continue;
			const book = value as Record<string, unknown>;
			const lastIndex =
				typeof book['lastIndex'] === 'number' && Number.isFinite(book['lastIndex'])
					? Math.max(0, Math.floor(book['lastIndex']))
					: 0;
			const marked: Record<string, true> = {};
			if (typeof book['marked'] === 'object' && book['marked'] !== null) {
				for (const word of Object.keys(book['marked'])) {
					marked[word] = true;
				}
			}
			clean.books[path] = { lastIndex, marked };
		}
	}
	return clean;
}

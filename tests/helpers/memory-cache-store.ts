import type { CacheFileStore } from '@/modules/word-cache/file-store';

/**
 * In-memory CacheFileStore for unit tests. Folders exist implicitly
 * while they contain files; `remove` on a folder deletes it recursively,
 * matching vault.delete on a TFolder.
 */
export class MemoryCacheFileStore implements CacheFileStore {
	/** Public so tests can seed/transfer state between store instances. */
	readonly files = new Map<string, string | ArrayBuffer>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async mkdir(_path?: string): Promise<void> {
		// Folders are implicit.
	}

	async list(path: string): Promise<string[]> {
		const prefix = path.endsWith('/') ? path : `${path}/`;
		const names = new Set<string>();
		for (const key of this.files.keys()) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			const head = rest.split('/')[0];
			if (head) names.add(head);
		}
		return [...names];
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (typeof value !== 'string') throw new Error(`not found: ${path}`);
		return value;
	}

	async write(path: string, text: string): Promise<void> {
		this.files.set(path, text);
	}

	async readBinary(path: string): Promise<ArrayBuffer> {
		const value = this.files.get(path);
		if (!(value instanceof ArrayBuffer)) throw new Error(`not found: ${path}`);
		return value;
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		this.files.set(path, data);
	}

	async rename(from: string, to: string): Promise<void> {
		const value = this.files.get(from);
		if (value === undefined) throw new Error(`not found: ${from}`);
		this.files.set(to, value);
		this.files.delete(from);
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
		const prefix = path.endsWith('/') ? path : `${path}/`;
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) this.files.delete(key);
		}
	}

	/** Copies every file from another memory store (used to seed tests). */
	copyFrom(other: MemoryCacheFileStore): void {
		for (const [key, value] of other.files) {
			this.files.set(key, value);
		}
	}
}

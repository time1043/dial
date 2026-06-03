export interface TraceRow {
	time: string; // HH:MM
	notePath: string; // vault-relative path to the md note
	position: string; // formatted timestamp link
}

export class TraceManager {
	/** Returns `_lib/trace/YYYY-MM.md` for the given date. */
	getMonthFilePath(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		return `_lib/trace/${y}-${m}.md`;
	}

	/** Formats a Date as "HH:MM". */
	formatTime(date: Date): string {
		const h = String(date.getHours()).padStart(2, '0');
		const m = String(date.getMinutes()).padStart(2, '0');
		return `${h}:${m}`;
	}

	/** Formats seconds as a clickable timestamp link. */
	formatPosition(seconds: number, notePath: string): string {
		const total = Math.floor(seconds);
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		const label =
			h > 0
				? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
				: `${m}:${String(s).padStart(2, '0')}`;
		return `[${label}](obsidian://dial?note=${encodeURIComponent(notePath)}&seconds=${total})`;
	}

	/**
	 * Given existing file content and a new row, returns updated content.
	 *
	 * Logic:
	 * 1. Find or create the `# date` section.
	 * 2. Find or create the `## module` subsection.
	 * 3. If the table's last row has the same video → overwrite it.
	 * 4. Otherwise → append a new row.
	 */
	addRow(content: string, date: string, module: string, row: TraceRow): string {
		const lines = content.split('\n');
		const dateHeading = `# ${date}`;
		const moduleHeading = `## ${module}`;

		// Find date section
		let dateIdx = lines.findIndex((l) => l.trim() === dateHeading);

		if (dateIdx === -1) {
			// Date section doesn't exist — append it at the end
			if (content.length > 0 && !content.endsWith('\n')) {
				lines.push('');
			}
			lines.push(dateHeading, '', moduleHeading, '');
			lines.push('| Time | Video | Position |');
			lines.push('| ---- | ----- | -------- |');
			lines.push(this.formatRow(row));
			return lines.join('\n');
		}

		// Find module section within the date section
		let moduleIdx = -1;
		for (let i = dateIdx + 1; i < lines.length; i++) {
			const line = lines[i]!;
			if (line.startsWith('# ')) break; // next date section
			if (line.trim() === moduleHeading) {
				moduleIdx = i;
				break;
			}
		}

		if (moduleIdx === -1) {
			// Module section doesn't exist — insert after date heading
			const insertIdx = dateIdx + 1;
			lines.splice(insertIdx, 0, '', moduleHeading, '');
			lines.splice(insertIdx + 3, 0, '| Time | Video | Position |');
			lines.splice(insertIdx + 4, 0, '| ---- | ----- | -------- |');
			lines.splice(insertIdx + 5, 0, this.formatRow(row));
			return lines.join('\n');
		}

		// Find the table in the module section
		let tableStart = -1;
		let lastDataRow = -1;
		for (let i = moduleIdx + 1; i < lines.length; i++) {
			const line = lines[i]!;
			if (line.startsWith('# ')) break;
			if (line.startsWith('| Time')) {
				tableStart = i;
			}
			if (
				tableStart !== -1 &&
				line.startsWith('|') &&
				!line.startsWith('| ---') &&
				!line.startsWith('| Time')
			) {
				lastDataRow = i;
			}
		}

		if (tableStart === -1) {
			// No table found — insert one after module heading
			const insertIdx = moduleIdx + 1;
			lines.splice(insertIdx, 0, '');
			lines.splice(insertIdx + 1, 0, '| Time | Video | Position |');
			lines.splice(insertIdx + 2, 0, '| ---- | ----- | -------- |');
			lines.splice(insertIdx + 3, 0, this.formatRow(row));
			return lines.join('\n');
		}

		// Check if last row has the same note → overwrite
		if (lastDataRow !== -1) {
			const cells = this.parseRow(lines[lastDataRow]!);
			const noteName = row.notePath.replace(/\.md$/, '').split('/').pop() ?? row.notePath;
			if (cells && cells[1] === `[[${noteName}]]`) {
				lines[lastDataRow] = this.formatRow(row);
				return lines.join('\n');
			}
		}

		// Append new row after last data row (or after header if no data rows)
		const insertAt = lastDataRow !== -1 ? lastDataRow + 1 : tableStart + 2;
		lines.splice(insertAt, 0, this.formatRow(row));
		return lines.join('\n');
	}

	private formatRow(row: TraceRow): string {
		const noteName = row.notePath.replace(/\.md$/, '').split('/').pop() ?? row.notePath;
		return `| ${row.time} | [[${noteName}]] | ${row.position} |`;
	}

	private parseRow(line: string): [string, string, string] | null {
		const match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
		if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
			return null;
		}
		return [match[1], match[2], match[3]];
	}
}

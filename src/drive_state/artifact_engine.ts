/**
 * The SQLite engine behind Drive State: sql.js (SQLite compiled to WebAssembly)
 * behind a small seam, so `node:sqlite` or another engine can replace it
 * without an API change.
 *
 * sql.js is loaded on first use, not at module load, so a consumer that never
 * reads or writes Drive State never loads it. It runs on Node 18, in the
 * browser build, and needs no native build, and a malformed database is parsed
 * inside the wasm sandbox rather than in process memory.
 */
import type { Database as SqlJsDatabase, SqlJsStatic, SqlValue } from 'sql.js';

export type ArtifactRow = Record<string, SqlValue>;

/** One open database. Every method is synchronous; the database is in memory. */
export interface ArtifactDatabase {
	/** Every row [sql] returns, as plain objects keyed by column name. */
	all(sql: string, params?: SqlValue[]): ArtifactRow[];
	/** Runs [sql] for its effect. */
	run(sql: string, params?: SqlValue[]): void;
	/**
	 * Prepares [sql] once to run with many parameter lists, which a builder
	 * inserting tens of thousands of rows needs. Optional: callers fall back to
	 * {@link run}.
	 */
	prepare?(sql: string): ArtifactStatement;
	/** The database file's bytes. */
	exportBytes(): Uint8Array;
	close(): void;
}

/** A statement prepared by {@link ArtifactDatabase.prepare}. */
export interface ArtifactStatement {
	run(params: SqlValue[]): void;
	free(): void;
}

export interface ArtifactEngine {
	/** Opens [bytes] as a database of their own, in memory. */
	open(bytes: Uint8Array): Promise<ArtifactDatabase>;
	/** Creates an empty database in memory. */
	create(): Promise<ArtifactDatabase>;
}

class SqlJsArtifactDatabase implements ArtifactDatabase {
	constructor(private readonly db: SqlJsDatabase) {}

	all(sql: string, params: SqlValue[] = []): ArtifactRow[] {
		const statement = this.db.prepare(sql);
		try {
			statement.bind(params);
			// getAsObject reads the column names again for every row, which
			// is most of the cost of reading a large table.
			const columns = statement.getColumnNames();
			const rows: ArtifactRow[] = [];
			while (statement.step()) {
				const values = statement.get();
				const row: ArtifactRow = {};
				for (let i = 0; i < columns.length; i++) {
					row[columns[i]] = values[i];
				}
				rows.push(row);
			}
			return rows;
		} finally {
			statement.free();
		}
	}

	run(sql: string, params: SqlValue[] = []): void {
		this.db.run(sql, params);
	}

	prepare(sql: string): ArtifactStatement {
		const statement = this.db.prepare(sql);
		return {
			run: (params) => {
				statement.run(params);
			},
			free: () => {
				statement.free();
			}
		};
	}

	exportBytes(): Uint8Array {
		return this.db.export();
	}

	close(): void {
		this.db.close();
	}
}

export interface SqlJsEngineOptions {
	/**
	 * Maps the wasm file name sql.js asks for to the URL the browser fetches it from. Node resolves it from the
	 * `sql.js` package and needs nothing.
	 */
	locateFile?: (file: string) => string;
}

/** The sql.js engine. One wasm instance per engine, created on first use. */
export class SqlJsArtifactEngine implements ArtifactEngine {
	private sql?: Promise<SqlJsStatic>;

	constructor(private readonly options: SqlJsEngineOptions = {}) {}

	private load(): Promise<SqlJsStatic> {
		if (!this.sql) {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const initSqlJs = require('sql.js') as (config?: SqlJsEngineOptions) => Promise<SqlJsStatic>;
			this.sql = initSqlJs(this.options.locateFile ? { locateFile: this.options.locateFile } : undefined);
			// A failed load is not cached: the next call tries again.
			this.sql.catch(() => {
				this.sql = undefined;
			});
		}
		return this.sql;
	}

	async open(bytes: Uint8Array): Promise<ArtifactDatabase> {
		const SQL = await this.load();
		return new SqlJsArtifactDatabase(new SQL.Database(bytes));
	}

	async create(): Promise<ArtifactDatabase> {
		const SQL = await this.load();
		return new SqlJsArtifactDatabase(new SQL.Database());
	}
}

let defaultEngine: ArtifactEngine | undefined;

/** Whether this is a browser page rather than Node. */
function inBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** The engine used when a caller passes none. */
export function defaultArtifactEngine(): ArtifactEngine {
	if (!defaultEngine) {
		defaultEngine = new SqlJsArtifactEngine();
	}
	return defaultEngine;
}

/**
 * Whether Drive State can be read here. Always in Node. In a browser only once
 * the page has said where sql.js's wasm is ({@link setDefaultArtifactEngine},
 * or `enableDriveState` in the web build): without it every read would fail
 * and fall back, at the cost of a query and a download per drive.
 */
export function driveStateSupported(): boolean {
	return !inBrowser() || defaultEngine !== undefined;
}

/** Replaces the default engine, such as the web build's, which knows where its wasm is. */
export function setDefaultArtifactEngine(engine: ArtifactEngine): void {
	defaultEngine = engine;
}

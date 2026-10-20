/**
 * Finding and reading a drive's Drive State: discovery, then up to three
 * candidates, each fetched (bounded, cached) and read. One verdict per drive.
 *
 * Never throws. Every way an artifact can be unusable, including discovery
 * itself failing, is a result the caller falls back from.
 */
import { ArweaveAddress, DriveID, TxID } from '../types';
import { GatewayAPI } from '../utils/gateway_api';
import { ArtifactEngine } from './artifact_engine';
import { DriveStateBodyCache } from './drive_state_cache';
import { candidateFromNode, isUsableCandidate, orderCandidates } from './drive_state_discovery';
import { DriveStateProtection } from './drive_state_envelope';
import { DriveStateOutcome, DriveStateRefused } from './drive_state_outcome';
import { DriveStateFormatVersion } from './drive_state_format_version';
import { buildDriveStateQuery } from './drive_state_query';
import { DriveStateCandidate, DriveStateContents, readDriveState } from './drive_state_reader';
import { DRIVE_STATE_LOOK_BACK_BLOCKS, DRIVE_STATE_MAX_PLAINTEXT_BYTES, DriveStateTagName } from './drive_state_tags';

/** The verdict for one drive. */
export interface DriveStateReadResult {
	outcome: DriveStateOutcome;
	/** Why, for the log. */
	detail: string;
	/** True when discovery itself did not complete: no artifact was ruled out. */
	discoveryFailed?: boolean;
	/** The artifact the verdict is about, when there is one. */
	txId?: string;
	/** How many candidates were tried. */
	attempts: number;
	/** Set when the outcome is `used`. */
	contents?: DriveStateContents;
	/**
	 * Set when the outcome is `used`: the height below which the artifact is
	 * the drive's state. Later sources start above it. A margin below
	 * `Block-End`, because an entity mined just below `Block-End` and indexed
	 * after the producer's last sync is in no artifact.
	 */
	coveredThroughBlock?: number;
	/** What {@link DriveStateReadParams.convert} returned, when the outcome is `used`. */
	converted?: unknown;
}

export interface DriveStateReadParams {
	driveId: DriveID;
	owner: ArweaveAddress;
	protection: DriveStateProtection;
	/** The height a stateful caller has already synced the drive to. */
	syncedToBlock?: number;
	/** The artifact a stateful caller last imported, so it is not read again. */
	lastImported?: { txId: string; syncedThroughBlock: number };
	/**
	 * Turns the rows into the caller's entities. Run before an artifact counts
	 * as used, so one whose rows pass the reader but make no valid entity (a
	 * negative size, say) is refused like any other and the next candidate is
	 * tried. Its result is {@link DriveStateReadResult.converted}.
	 */
	convert?: (contents: DriveStateContents) => Promise<unknown>;
}

export interface DriveStateSourceParams {
	gatewayApi: GatewayAPI;
	engine?: ArtifactEngine;
	/** Where sealed bodies are cached. `false` turns the cache off. */
	cache?: DriveStateBodyCache | false;
	/** How many candidates to try before giving up. */
	maxCandidates?: number;
	/** Where the one line per drive goes. */
	log?: (line: string) => void;
	/**
	 * The network's current block height. A `Block-End` above it is honoured
	 * only up to it, as the format requires: a claim past the chain's tip would
	 * otherwise start every later read above blocks that do not exist yet.
	 */
	currentHeight?: () => Promise<number>;
}

/** A gateway may add framing; a body this far past the format's bound is not an artifact. */
const FETCH_SLACK_BYTES = 64 * 1024;

export class DriveStateSource {
	private readonly gatewayApi: GatewayAPI;
	private readonly engine?: ArtifactEngine;
	private readonly cache?: DriveStateBodyCache;
	private readonly maxCandidates: number;
	private readonly log: (line: string) => void;
	private readonly currentHeight?: () => Promise<number>;

	constructor({
		gatewayApi,
		engine,
		cache,
		maxCandidates = 3,
		log = (line) => console.error(line),
		currentHeight
	}: DriveStateSourceParams) {
		this.currentHeight = currentHeight;
		this.gatewayApi = gatewayApi;
		this.engine = engine;
		this.cache = cache === false ? undefined : (cache ?? new DriveStateBodyCache());
		this.maxCandidates = maxCandidates;
		this.log = log;
	}

	async read(params: DriveStateReadParams): Promise<DriveStateReadResult> {
		let result: DriveStateReadResult;
		try {
			result = await this.readUnlogged(params);
		} catch (e) {
			// Unreachable by design: everything below reports rather than throws.
			result = { outcome: 'integrity-failed', detail: `reading drive state threw: ${e}`, attempts: 0 };
		}
		this.log(
			`[drive-state] ${params.driveId}: ${result.detail}${result.txId ? ` (${result.txId})` : ''} - outcome=${result.outcome}` +
				(result.discoveryFailed ? ' discovery-failed' : '')
		);
		return result;
	}

	private async readUnlogged(params: DriveStateReadParams): Promise<DriveStateReadResult> {
		const { driveId, owner, protection, syncedToBlock } = params;

		let candidates: DriveStateCandidate[];
		try {
			candidates = await this.discover(params);
		} catch (e) {
			// Not "none found": the question was never answered.
			return { outcome: 'none-found', detail: `discovery failed: ${e}`, discoveryFailed: true, attempts: 0 };
		}
		if (candidates.length === 0) {
			return { outcome: 'none-found', detail: 'no drive state found', attempts: 0 };
		}

		let last: DriveStateReadResult | undefined;
		let attempts = 0;
		let height: number | Error | undefined;
		for (const candidate of candidates.slice(0, this.maxCandidates)) {
			attempts++;
			const blockEnd = Number(candidate.tags[DriveStateTagName.blockEnd]);

			// Already imported, and the caller is still at or past it.
			if (
				params.lastImported?.txId === candidate.txId &&
				Number.isFinite(blockEnd) &&
				params.lastImported.syncedThroughBlock >= blockEnd
			) {
				return {
					outcome: 'range-already-covered',
					detail: 'already imported',
					txId: candidate.txId,
					attempts
				};
			}
			// Below where the caller starts: nothing to add. Candidates are in
			// Block-End order, so no later one could either.
			if (
				syncedToBlock !== undefined &&
				Number.isFinite(blockEnd) &&
				blockEnd < syncedToBlock - DRIVE_STATE_LOOK_BACK_BLOCKS
			) {
				return {
					outcome: 'range-already-covered',
					detail: `ends at ${blockEnd}, below the ${syncedToBlock} already synced`,
					txId: candidate.txId,
					attempts
				};
			}

			// A format this build does not read is refused from its tag, without
			// downloading the body only to refuse it. The reader would refuse it the
			// same way; this only saves the download.
			const version = DriveStateFormatVersion.tryParse(candidate.tags[DriveStateTagName.stateVersion]);
			if (version && !version.isReadableByThisBuild) {
				last = {
					outcome: 'unknown-version',
					detail: `State-Version is ${version} and this build reads ${DriveStateFormatVersion.current}`,
					txId: candidate.txId,
					attempts
				};
				continue;
			}

			let body: Uint8Array;
			let fromCache: boolean;
			try {
				({ body, fromCache } = await this.fetch(driveId, candidate.txId));
			} catch (e) {
				last = { outcome: 'fetch-failed', detail: `${e}`, txId: candidate.txId, attempts };
				continue;
			}

			try {
				let contents = await readDriveState(candidate, body, {
					expectedOwnerAddress: `${owner}`,
					protection,
					syncedToBlock,
					engine: this.engine
				});
				let converted: unknown;
				if (params.convert) {
					try {
						converted = await params.convert(contents);
					} catch (e) {
						if (e instanceof DriveStateRefused) {
							throw e;
						}
						throw new DriveStateRefused(
							'integrity-failed',
							`its rows do not make valid entities: ${e instanceof Error ? e.message : e}`
						);
					}
				}
				// Cached only once read: a bad body served with a 200 would otherwise
				// be refused from disk forever, since the key never goes stale.
				if (!fromCache) {
					await this.cache?.put(`${driveId}`, candidate.txId, body);
				}
				let clamped = '';
				if (this.currentHeight) {
					height ??= await this.heightOrError();
					if (height instanceof Error) {
						return {
							outcome: 'fetch-failed',
							detail: `could not read the current block height to bound Block-End: ${height.message}`,
							txId: candidate.txId,
							attempts
						};
					}
					if (height < contents.blockEnd) {
						clamped = `, honoured up to the current height ${height}`;
						contents = { ...contents, blockEnd: height };
					}
				}
				return {
					outcome: 'used',
					detail: `read ${contents.entityCount} entities through block ${candidate.tags[DriveStateTagName.blockEnd]}${clamped}`,
					txId: candidate.txId,
					attempts,
					contents,
					coveredThroughBlock: Math.max(0, contents.blockEnd - DRIVE_STATE_LOOK_BACK_BLOCKS),
					converted
				};
			} catch (e) {
				if (!(e instanceof DriveStateRefused)) {
					throw e;
				}
				last = { outcome: e.outcome, detail: e.detail, txId: candidate.txId, attempts };
				if (e.outcome === 'range-already-covered') {
					return last;
				}
				if (fromCache) {
					// The next read downloads it again rather than trusting the disk.
					await this.cache?.remove(`${driveId}`, candidate.txId);
				}
			}
		}
		return last!;
	}

	/**
	 * Of the drive states already published for a drive, the one holding the
	 * most entities, from its `Entity-Count` tag. Undefined when there is none
	 * or discovery fails: a producer then has nothing to check its count against.
	 */
	async largestPublished({
		driveId,
		owner
	}: {
		driveId: DriveID;
		owner: ArweaveAddress;
	}): Promise<{ txId: string; entityCount: number } | undefined> {
		let candidates: DriveStateCandidate[];
		try {
			candidates = await this.discover({ driveId, owner, protection: { kind: 'public' } });
		} catch (e) {
			this.log(`[drive-state] ${driveId}: could not look up published drive states: ${e}`);
			return undefined;
		}
		let largest: { txId: string; entityCount: number } | undefined;
		for (const candidate of candidates) {
			const entityCount = Number(candidate.tags[DriveStateTagName.entityCount]);
			if (Number.isSafeInteger(entityCount) && entityCount > (largest?.entityCount ?? 0)) {
				largest = { txId: candidate.txId, entityCount };
			}
		}
		return largest;
	}

	private async heightOrError(): Promise<number | Error> {
		try {
			const height = await this.currentHeight!();
			if (!Number.isSafeInteger(height) || height <= 0) {
				return new Error(`the gateway reported height ${height}`);
			}
			return height;
		} catch (e) {
			return e instanceof Error ? e : new Error(`${e}`);
		}
	}

	private async discover({ driveId, owner, syncedToBlock }: DriveStateReadParams): Promise<DriveStateCandidate[]> {
		// An artifact mined below where the caller starts cannot carry a higher
		// Block-End than that, so it is not asked for.
		const minBlockHeight =
			syncedToBlock !== undefined ? Math.max(0, syncedToBlock - DRIVE_STATE_LOOK_BACK_BLOCKS) : undefined;
		const transactions = await this.gatewayApi.gqlRequest(buildDriveStateQuery({ driveId, owner, minBlockHeight }));
		const candidates = transactions.edges
			.map((edge) => candidateFromNode(edge.node))
			.filter((candidate) => isUsableCandidate(candidate, `${driveId}`, `${owner}`));
		return orderCandidates(candidates);
	}

	private async fetch(driveId: DriveID, txId: string): Promise<{ body: Uint8Array; fromCache: boolean }> {
		const cached = await this.cache?.get(`${driveId}`, txId);
		if (cached) {
			return { body: cached, fromCache: true };
		}
		const body = await this.gatewayApi.getTxDataBounded(
			TxID(txId),
			DRIVE_STATE_MAX_PLAINTEXT_BYTES + FETCH_SLACK_BYTES
		);
		return { body, fromCache: false };
	}
}

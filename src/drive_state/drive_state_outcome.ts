/**
 * Why a drive did or did not use a Drive State artifact. The same codes as
 * ardrive-web's `DriveStateOutcome`, so a verdict means the same thing in
 * either client.
 */
export type DriveStateOutcome =
	/** An artifact was read and its rows are the listing's base. */
	| 'used'
	/** Discovery answered, and there is no artifact for the drive. */
	| 'none-found'
	/** The artifact's format version, or its cipher, is one this build does not read. */
	| 'unknown-version'
	/** The artifact was not uploaded by the drive's owner. */
	| 'owner-mismatch'
	/** The body did not decrypt under the drive key. */
	| 'decrypt-failed'
	/** The body is not the artifact its tags describe, or is malformed. */
	| 'integrity-failed'
	/** `Entity-Count` disagrees with what the body holds. */
	| 'count-mismatch'
	/** `Block-Start` or `Block-End` disagree with what the body claims. */
	| 'coverage-mismatch'
	/** The artifact's encryption contradicts the drive's privacy. */
	| 'privacy-mismatch'
	/** The artifact was identified and could not be downloaded. */
	| 'fetch-failed'
	/** The artifact covers nothing the caller has not already synced. */
	| 'range-already-covered';

/** A refusal: an outcome and the reason for the log. */
export interface DriveStateRefusal {
	outcome: Exclude<DriveStateOutcome, 'used' | 'none-found'>;
	detail: string;
}

export class DriveStateRefused extends Error {
	constructor(
		readonly outcome: DriveStateRefusal['outcome'],
		readonly detail: string
	) {
		super(`${outcome}: ${detail}`);
		this.name = 'DriveStateRefused';
	}
}

/** Stops a check: the first failed check decides the outcome. */
export function refuse(outcome: DriveStateRefusal['outcome'], detail: string): never {
	throw new DriveStateRefused(outcome, detail);
}

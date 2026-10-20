/**
 * The Drive State format version: `major.minor`, and nothing else.
 *
 * Carried in the `State-Version` tag and in `meta.version`. From `1.0`, a
 * reader accepts any minor of its own major and refuses any other major.
 * Below `1.0` the minor is the compatibility unit, so a reader requires an
 * exact match: a `0.x` format makes no compatibility promise. A port of
 * ardrive-web's `drive_state_format_version.dart`.
 */
export class DriveStateFormatVersion {
	/** The version this build writes, and the only one it reads while `0.x`. */
	static readonly current = new DriveStateFormatVersion(0, 2);

	// Both decimal, neither with a leading zero, each at most nine digits, so
	// parsing and printing are inverses and no value is large enough to round.
	private static readonly pattern = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;

	constructor(
		readonly major: number,
		readonly minor: number
	) {}

	/** The version in [raw], or undefined when it is not `major.minor`. */
	static tryParse(raw: string | undefined | null): DriveStateFormatVersion | undefined {
		if (raw === undefined || raw === null) {
			return undefined;
		}
		const match = DriveStateFormatVersion.pattern.exec(raw);
		if (!match) {
			return undefined;
		}
		return new DriveStateFormatVersion(Number(match[1]), Number(match[2]));
	}

	equals(other: DriveStateFormatVersion): boolean {
		return this.major === other.major && this.minor === other.minor;
	}

	/** True when this build cannot read it because it is newer. */
	get isNewerThanThisBuild(): boolean {
		const current = DriveStateFormatVersion.current;
		if (this.major !== current.major) {
			return this.major > current.major;
		}
		return current.major === 0 && this.minor > current.minor;
	}

	/** True when this build cannot read it because it predates a breaking change. */
	get isOlderThanThisBuild(): boolean {
		const current = DriveStateFormatVersion.current;
		if (this.major !== current.major) {
			return this.major < current.major;
		}
		return current.major === 0 && this.minor < current.minor;
	}

	get isReadableByThisBuild(): boolean {
		return !this.isNewerThanThisBuild && !this.isOlderThanThisBuild;
	}

	toString(): string {
		return `${this.major}.${this.minor}`;
	}
}

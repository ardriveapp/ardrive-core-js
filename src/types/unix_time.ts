import { Equatable } from './equatable';

export class UnixTime implements Equatable<UnixTime> {
	constructor(private readonly unixTime: number) {
		if (this.unixTime < 0 || !Number.isInteger(this.unixTime) || !Number.isFinite(this.unixTime)) {
			throw new Error('Unix time must be a positive integer!');
		}
	}

	equals(unixTime: UnixTime): boolean {
		return +this.unixTime === +unixTime.unixTime;
	}

	[Symbol.toPrimitive](hint?: string): number | string {
		if (hint === 'string') {
			this.toString();
		}

		return this.unixTime;
	}

	toString(): string {
		return `${this.unixTime}`;
	}

	valueOf(): number {
		return this.unixTime;
	}

	toJSON(): number {
		return this.unixTime;
	}
}

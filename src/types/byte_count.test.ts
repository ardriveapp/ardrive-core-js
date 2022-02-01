import { expect } from 'chai';
import { ByteCount } from './';

describe('ByteCount class', () => {
	describe('constructor', () => {
		it('constructs valid ByteCounts given healthy inputs', () => {
			const byteCountInputs = [0, 1, Number.MAX_SAFE_INTEGER];
			byteCountInputs.forEach((byteCount) => expect(() => new ByteCount(byteCount)).to.not.throw(Error));
		});

		it('throws an error when provided invalid inputs', () => {
			const byteCountInputs = [-1, 0.5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN];
			byteCountInputs.forEach((byteCount) =>
				expect(() => new ByteCount(byteCount), `${byteCount} should throw`).to.throw(Error)
			);
		});
	});

	describe('toPrimitive function', () => {
		it('returns the correct ByteCount string when hint is string', () => {
			const byteCount = new ByteCount(12345);
			expect(`${byteCount}`).to.equal('12345');
		});

		it('returns the correct ByteCount number when hint is number', () => {
			const byteCount = new ByteCount(12345);
			expect(+byteCount).to.equal(12345);
		});
	});

	describe('toString function', () => {
		it('returns the correct ByteCount string', () => {
			const byteCount = new ByteCount(12345);
			expect(byteCount.toString()).to.equal('12345');
		});
	});

	describe('valueOf function', () => {
		it('returns the correct ByteCount number value', () => {
			const eid = new ByteCount(12345);
			expect(eid.valueOf()).to.equal(12345);
		});
	});

	describe('equals function', () => {
		it('correctly evaluates equality', () => {
			const bc1 = new ByteCount(12345);
			const bc2 = new ByteCount(12345);
			const bc3 = new ByteCount(0);
			expect(bc1.equals(bc2), `${bc1} and ${bc2}`).to.be.true;
			expect(bc2.equals(bc1), `${bc2} and ${bc1}`).to.be.true;
			expect(bc1.equals(bc3), `${bc1} and ${bc3}`).to.be.false;
			expect(bc3.equals(bc1), `${bc3} and ${bc1}`).to.be.false;
			expect(bc2.equals(bc3), `${bc2} and ${bc3}`).to.be.false;
			expect(bc3.equals(bc2), `${bc3} and ${bc2}`).to.be.false;
		});
	});

	describe('toJSON function', () => {
		it('returns the correct JSON value', () => {
			const byteCount = new ByteCount(12345);
			expect(JSON.stringify({ byteCount })).to.equal('{"byteCount":12345}');
		});
	});

	describe('plus function', () => {
		it('correctly sums up ByteCount values', () => {
			expect(new ByteCount(1).plus(new ByteCount(2)).toString()).to.equal('3');
		});
	});

	describe('minus function', () => {
		it('correctly subtracts ByteCount values', () => {
			expect(new ByteCount(2).minus(new ByteCount(1)).toString()).to.equal('1');
		});

		it('throws an error when the subtraction result is less than 0', () => {
			expect(() => new ByteCount(1).minus(new ByteCount(2))).to.throw(Error);
		});
	});

	describe('isGreaterThan function', () => {
		it('returns false when other ByteCount is greater', () => {
			expect(new ByteCount(1).isGreaterThan(new ByteCount(2))).to.be.false;
		});

		it('returns true when other ByteCount is lesser', () => {
			expect(new ByteCount(2).isGreaterThan(new ByteCount(1))).to.be.true;
		});

		it('returns false when other ByteCount is equal', () => {
			expect(new ByteCount(2).isGreaterThan(new ByteCount(2))).to.be.false;
		});
	});

	describe('isGreaterThanOrEqualTo function', () => {
		it('returns false when other ByteCount is greater', () => {
			expect(new ByteCount(1).isGreaterThanOrEqualTo(new ByteCount(2))).to.be.false;
		});

		it('returns true when other ByteCount is lesser', () => {
			expect(new ByteCount(2).isGreaterThanOrEqualTo(new ByteCount(1))).to.be.true;
		});

		it('returns true when other ByteCount is equal', () => {
			expect(new ByteCount(2).isGreaterThanOrEqualTo(new ByteCount(2))).to.be.true;
		});
	});
});

import { expect } from 'chai';
import { spy } from 'sinon';
import { stubCommunityContract, stubTxID } from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ArDriveContractOracle } from './ardrive_contract_oracle';

describe('The ArDriveContractOracle', () => {
	const stubContractReader = {
		async readContract() {
			return stubCommunityContract;
		}
	};

	const arDriveContractOracle = new ArDriveContractOracle([stubContractReader]);

	describe('constructor', () => {
		it('does not read the community contract on construction by default', () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);
		});

		it('reads the community contract once on construction when skipSetup is set to false', () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			new ArDriveContractOracle([stubContractReader], false);
			expect(readContractSpy.callCount).to.equal(1);
		});
	});

	describe('getPercentageFromContract method', () => {
		it('returns the expected fee result', async () => {
			expect(await arDriveContractOracle.getTipPercentageFromContract()).to.equal(0.5);
		});

		it('throws an error if fee does not exist', async () => {
			const stubContractReaderWithNoFee = {
				async readContract() {
					return {
						...stubCommunityContract,
						settings: [['not-a-fee', 'lol']]
					};
				}
			};
			const arDriveContractOracleWithNoFee = new ArDriveContractOracle([stubContractReaderWithNoFee]);

			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithNoFee.getTipPercentageFromContract(),
				errorMessage: 'Fee does not exist on smart contract settings'
			});
		});

		it('throws an error if fee is not a number', async () => {
			const stubContractReaderWithFeeAsString = {
				async readContract() {
					return {
						...stubCommunityContract,
						settings: [['fee', 'STUB_STRING']]
					};
				}
			};
			const arDriveContractOracleWithFeeAsString = new ArDriveContractOracle([stubContractReaderWithFeeAsString]);

			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithFeeAsString.getTipPercentageFromContract(),
				errorMessage: 'Fee on smart contract settings is not a number'
			});
		});

		it('throws an error if fee is not greater than zero', async () => {
			const stubContractReaderWithNegativeFee = {
				async readContract() {
					return {
						...stubCommunityContract,
						settings: [['fee', -600]]
					};
				}
			};
			const arDriveContractOracleWithNegativeFee = new ArDriveContractOracle([stubContractReaderWithNegativeFee]);

			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithNegativeFee.getTipPercentageFromContract(),
				errorMessage: 'Fee on smart contract community settings is set to a negative number'
			});
		});
	});

	describe('readContract method', () => {
		it('returns the expected stub community contract', async () => {
			expect(await arDriveContractOracle.readContract(stubTxID)).to.deep.equal(stubCommunityContract);
		});

		const errorThrowingStubContractReader = {
			async readContract() {
				throw new Error('Big time fail!');
			}
		};

		it('throws an error if contract cannot be resolved by any contract reader', async () => {
			const arDriveContractOracleWithError = new ArDriveContractOracle([errorThrowingStubContractReader]);

			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithError.readContract(stubTxID),
				errorMessage: 'Max contract read attempts has been reached on the last fallback contract reader..'
			});
		});

		it('falls back to the next contract reader on error and returns the expected stub community contract', async () => {
			const arDriveContractOracleWithFallback = new ArDriveContractOracle([
				errorThrowingStubContractReader,
				stubContractReader
			]);

			expect(await arDriveContractOracleWithFallback.readContract(stubTxID)).to.deep.equal(stubCommunityContract);
		});
	});

	describe('getCommunityContract method', () => {
		it('returns the cached contract if it exists rather than reading contract again', async () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			const contractOracle = new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);

			await contractOracle.getCommunityContract();
			expect(readContractSpy.callCount).to.equal(1);

			expect(await contractOracle.getCommunityContract()).to.deep.equal(stubCommunityContract);

			// No new calls on read contract
			expect(readContractSpy.callCount).to.equal(1);
		});

		it('returns the current promise to read the contract contract if it exists rather than reading contract again', async () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			const contractOracle = new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);

			// Do not await the result so that the next call will return the promise
			contractOracle.getCommunityContract();
			expect(readContractSpy.callCount).to.equal(1);

			expect(await contractOracle.getCommunityContract()).to.deep.equal(stubCommunityContract);

			// No duplicate calls to read contract during the promise
			expect(readContractSpy.callCount).to.equal(1);
		});
	});
});

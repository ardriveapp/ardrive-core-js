import { expect } from 'chai';
import { stubArweaveAddress, stubTxID } from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ArDriveContractOracle } from './ardrive_contract_oracle';

describe('The ArDriveContractOracle', () => {
	const stubCommunityContract = {
		settings: [['fee', 15]],
		vault: { [`${stubArweaveAddress}`]: [{ balance: 500, start: 1, end: 2 }] },
		balances: { [`${stubArweaveAddress}`]: 200 }
	};
	const stubContractWithNoFee = {
		...stubCommunityContract,
		settings: [['not-a-fee', 'lol']]
	};
	const stubContractWithFeeAsString = {
		...stubCommunityContract,
		settings: [['fee', 'STUB_STRING']]
	};
	const stubContractWithNegativeFee = {
		...stubCommunityContract,
		settings: [['fee', -600]]
	};

	const stubContractReader = {
		async readContract() {
			return stubCommunityContract;
		}
	};
	const stubContractReaderWithNoFee = {
		async readContract() {
			return stubContractWithNoFee;
		}
	};
	const stubContractReaderWithFeeAsString = {
		async readContract() {
			return stubContractWithFeeAsString;
		}
	};
	const stubContractReaderWithNegativeFee = {
		async readContract() {
			return stubContractWithNegativeFee;
		}
	};

	const errorThrowingStubContractReader = {
		async readContract() {
			throw new Error('Big time fail!');
		}
	};
	const arDriveContractOracleWithError = new ArDriveContractOracle([errorThrowingStubContractReader]);

	const arDriveContractOracle = new ArDriveContractOracle([stubContractReader]);
	const arDriveContractOracleWithNoFee = new ArDriveContractOracle([stubContractReaderWithNoFee]);
	const arDriveContractOracleWithFeeAsString = new ArDriveContractOracle([stubContractReaderWithFeeAsString]);
	const arDriveContractOracleWithNegativeFee = new ArDriveContractOracle([stubContractReaderWithNegativeFee]);

	describe('getPercentageFromContract method', () => {
		it('returns the expected fee result', async () => {
			expect(await arDriveContractOracle.getTipPercentageFromContract()).to.equal(0.15);
		});

		it('throws an error if fee does not exist', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithNoFee.getTipPercentageFromContract(),
				errorMessage: 'Fee does not exist on smart contract settings'
			});
		});

		it('throws an error if fee is not a number', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithFeeAsString.getTipPercentageFromContract(),
				errorMessage: 'Fee on smart contract settings is not a number'
			});
		});

		it('throws an error if fee is not a number', async () => {
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

		it('throws an error if contract cannot be resolved by any contract reader', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithError.readContract(stubTxID),
				errorMessage: 'Max contract read attempts has been reached on the last fallback contract reader..'
			});
		});
	});
});

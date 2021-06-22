// The `test` directory is where the integration tests will be

import { expect } from 'chai';
import { getTransactionData } from '../src/gateway';

// This is just a placeholder asynchronous example test
describe('The getTransactionData function', () => {
	// prettier-ignore
	const expectedOutput = new Uint8Array([
    // 'ArConnect Archives' transaction id
    123,  34, 110,  97, 109, 101,  34,  58,  34,  65, 114,  67, 111, 110, 110, 101,  99,
    116,  32,  65, 114,  99, 104, 105, 118, 101, 115,  34,  44,  34, 114, 111, 111, 116,
     70, 111, 108, 100, 101, 114,  73, 100,  34,  58,  34,  49,  51, 100,  53,  99,  57,
    102,  49,  45,  50, 100,  49,  56,  45,  52,  98,  48,  97,  45,  97,  52, 102,  49,
     45,  99,  57, 101,  54, 102,  98,  57,  99,  53,  98, 101,  98,  34, 125,
  ]);

	it('returns transaction data from the arweave network', async () => {
		const transaction = await getTransactionData('rsRzKeNeQUdgOaG4SYyRAcB8cnnOp_E4uo56DtKon8E');
		// Returning anything to a Mocha test will conclude an async test
		return expect(transaction).to.deep.equal(expectedOutput);
	});
});

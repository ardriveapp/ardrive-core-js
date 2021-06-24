/**
 * This is an example integration test used to showcase the testing libraries
 *
 * To run this example on it's own, use: yarn test -g 'basicIntegrationExample'
 *
 * For more examples, visit the unit test example file at: src/example.test.ts
 */

import { expect } from 'chai';
import { mock, spy } from 'sinon';
import { sleep } from '../src/common';

// Independently defined example types to avoid conflict with future type changes
type ExampleUser = { login: string; walletPrivateKey: string; walletPublicKey: string };
type ExampleDrive = { txId: string; driveId: string };

// Example API for integration testing, normally this would be imported into the test file
const basicIntegrationExample = {
	login: async (login: string): Promise<ExampleUser> => {
		await sleep(100); // Wait 100ms for fake async

		return {
			login: login,
			walletPrivateKey: `${login}_walletPriv`,
			walletPublicKey: `${login}_walletPub`
		};
	},

	getDrives: async (user: ExampleUser): Promise<ExampleDrive[]> => {
		await sleep(100); // Wait 100ms for fake async

		if (user.walletPrivateKey !== `${user.login}_walletPriv`) {
			return [];
		} else {
			return [{ txId: `${user.login}_transaction_id`, driveId: `${user.login}_best_drive_id` }];
		}
	}
};

describe('Using the basicIntegrationExample api', () => {
	// Basic Mocha/Chai integration test
	it('users can login and retrieve their drives', async () => {
		const { login, getDrives } = basicIntegrationExample;

		// Login to API
		const user = await login('steve');

		expect(user.walletPrivateKey).to.equal('steve_walletPriv');

		// Get the drives
		const drives = await getDrives(user);
		expect(drives[0].txId).to.equal('steve_transaction_id');

		// Return anything to conclude async test
		return;
	});

	// Sinon Spy
	it('users that are incorrectly logged in cannot get drives', async () => {
		// Define spy
		const sinonSpy = spy(basicIntegrationExample, 'getDrives');

		const incorrectUser: ExampleUser = {
			login: 'greg',
			walletPrivateKey: 'wrong_key',
			walletPublicKey: 'wrong_key'
		};

		const drives = await basicIntegrationExample.getDrives(incorrectUser);
		expect(drives).to.have.length(0);

		// Verify spy calls
		expect(sinonSpy.calledOnce).to.be.ok;
		expect(sinonSpy.calledWith(incorrectUser)).to.be.ok;

		return;
	});

	// Sinon mock
	it('can be used in a Sinon mock', async () => {
		// Create mock
		const sinonMock = mock(basicIntegrationExample);

		// Setup mock expectations
		sinonMock.expects('login').once().alwaysCalledWithExactly('tim');
		sinonMock.expects('getDrives').once().returns('a sinon mock');

		const user = await basicIntegrationExample.login('tim');
		const drives = await basicIntegrationExample.getDrives(user);

		// Expect mocked response
		expect(drives).to.equal('a sinon mock');

		// Verify mock expectations
		return sinonMock.verify();
	});
});

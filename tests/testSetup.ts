import { restore } from 'sinon';

// Restores the default sandbox after every test
export const mochaHooks = {
	afterEach() {
		restore();
	}
};

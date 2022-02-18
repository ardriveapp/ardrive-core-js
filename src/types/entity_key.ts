import { urlEncodeHashKey } from '../utils/common';

export class EntityKey {
	constructor(readonly keyData: Buffer) {
		if (!Buffer.isBuffer(keyData)) {
			throw new Error(`The argument must be of type Buffer, got ${typeof keyData}`);
		}
	}

	toJSON(): string {
		return urlEncodeHashKey(this.keyData);
	}
}

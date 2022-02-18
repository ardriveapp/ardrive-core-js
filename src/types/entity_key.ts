import { urlEncodeHashKey } from '../utils/common';

export class EntityKey {
	constructor(readonly keyData: Buffer) {}

	toJSON(): string {
		return urlEncodeHashKey(this.keyData);
	}
}

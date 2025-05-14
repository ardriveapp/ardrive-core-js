import { urlEncodeHashKey } from '../utils/common';
import { DriveSignatureType } from './types';

export class EntityKey {
	constructor(readonly keyData: Buffer) {
		if (!Buffer.isBuffer(keyData)) {
			throw new Error(`The argument must be of type Buffer, got ${typeof keyData}`);
		}
	}

	toString(): string {
		return urlEncodeHashKey(this.keyData);
	}

	toJSON(): string {
		return this.toString();
	}
}

// Definition for DriveKey placed here as moving to a separate file
// caused issues with circular dependencies
export class DriveKey extends EntityKey {
	readonly driveSignatureType: DriveSignatureType;

	constructor(keyData: Buffer, driveSignatureType: DriveSignatureType) {
		super(keyData);
		this.driveSignatureType = driveSignatureType;
	}
}

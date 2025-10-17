import { urlEncodeHashKey } from '../utils/common_browser';
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
export type DriveKey = EntityKey;

// New signature-aware drive key class for v2 functionality
export class VersionedDriveKey extends EntityKey {
	readonly driveSignatureType: DriveSignatureType;

	constructor(keyData: Buffer, driveSignatureType: DriveSignatureType = DriveSignatureType.v1) {
		super(keyData);
		this.driveSignatureType = driveSignatureType;
	}

	// Helper method to check if this is a v2 signed drive key
	isV2(): boolean {
		return this.driveSignatureType === DriveSignatureType.v2;
	}

	// Helper method to check if this is a v1 drive key
	isV1(): boolean {
		return this.driveSignatureType === DriveSignatureType.v1;
	}
}

// Utility functions to work with drive keys
export function isVersionedDriveKey(key: DriveKey | VersionedDriveKey): key is VersionedDriveKey {
	return key instanceof VersionedDriveKey;
}

export function getDriveSignatureType(key: DriveKey | VersionedDriveKey): DriveSignatureType {
	if (isVersionedDriveKey(key)) {
		return key.driveSignatureType;
	}
	return DriveSignatureType.v1;
}

export function createDriveKey(keyData: Buffer, signatureType?: DriveSignatureType): DriveKey | VersionedDriveKey {
	if (signatureType === undefined || signatureType === DriveSignatureType.v1) {
		return new EntityKey(keyData);
	}
	return new VersionedDriveKey(keyData, signatureType);
}

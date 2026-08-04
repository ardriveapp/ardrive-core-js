import { ArFSPrivateFileBuilder, ArFSPublicFileBuilder } from '../exports';

// EntityDecryptionError
//
// Thrown when a private entity's data cannot be decrypted (wrong key, corrupt
// ciphertext, missing/invalid auth tag, unknown cipher, etc.). This REPLACES the
// historical silent `Buffer.from('Error')` / `'ERROR'` sentinels returned by
// fileDecrypt()/driveDecrypt(): a genuine decryption failure is now an honest,
// typed throw carrying the on-chain Cipher so callers can surface it clearly
// instead of feeding a bogus buffer into JSON.parse() and silently dropping the
// entity. Enumeration paths catch this per-entity (see arfsdao.ts) so one broken
// file never aborts an entire drive listing.
export class EntityDecryptionError extends Error {
	readonly cipher: string;
	readonly entity: string;

	constructor(cipher: string, entity = 'entity', cause?: unknown) {
		const reason = cause instanceof Error && cause.message ? `: ${cause.message}` : '';
		super(`Failed to decrypt ${entity} (cipher ${cipher})${reason}`);
		this.name = 'EntityDecryptionError';
		this.cipher = cipher;
		this.entity = entity;
	}
}

// InvalidFileStateException
export class InvalidFileStateException extends Error {
	readonly missingProperties: string[];

	constructor(missingProperties: string[]) {
		const message = `Invalid file state. Missing required properties: ${missingProperties.join(', ')}`;
		super(message);
		this.missingProperties = missingProperties;
		this.name = 'InvalidFileStateException';
	}
}

export class FileBuilderValidation {
	private missingProperties: string[] = [];

	validateFileProperties(builder: ArFSPublicFileBuilder | ArFSPrivateFileBuilder) {
		if (!builder.name) this.missingProperties.push('name');
		if (builder.size === undefined) this.missingProperties.push('size');
		if (!builder.lastModifiedDate) this.missingProperties.push('lastModifiedDate');
		if (!builder.dataTxId) this.missingProperties.push('dataTxId');
		if (!builder.dataContentType) this.missingProperties.push('dataContentType');
		if (builder.entityType !== 'file') this.missingProperties.push('entityType');
	}

	throwIfMissingProperties() {
		if (this.missingProperties.length > 0) {
			throw new InvalidFileStateException(this.missingProperties);
		}
	}

	reset() {
		this.missingProperties = [];
	}
}

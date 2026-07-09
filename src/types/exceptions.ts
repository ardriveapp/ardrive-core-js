import { ArFSPrivateFileBuilder, ArFSPublicFileBuilder } from '../exports';

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

/**
 * Thrown when a single on-chain entity carries a missing/malformed `Unix-Time` tag
 * (negative, non-integer, non-finite, or otherwise unparseable) while its metadata is
 * being reconstructed from GQL during a LIST/enumeration.
 *
 * Enumeration loops catch this to SKIP the one bad entity rather than abort the whole
 * drive listing. The strict `UnixTime` validation is preserved for WRITE paths — this
 * only makes the read/enumeration path resilient to a single malformed entity.
 */
export class InvalidUnixTimeException extends Error {
	readonly rawValue: string;

	constructor(rawValue: string) {
		super(`Invalid Unix-Time tag value: "${rawValue}"`);
		this.rawValue = rawValue;
		this.name = 'InvalidUnixTimeException';
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

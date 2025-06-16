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

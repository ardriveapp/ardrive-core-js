import { EntityType } from '../types';

const RESERVED_CHARACTERS = ['\\\\', '/', ':', '*', '?', '"', '<', '>', '|'];
const HUMAN_READABLE_RESERVED_CHARACTERS = RESERVED_CHARACTERS.map((char) => `'${char}'`).join(', ');

const LEADING_SPACES_REGEXP = /^(\s+)/;
const TRAILING_DOTS_OR_SPACES_REGEXP = /(\s|\.)+$/;
const CONTAINS_RESERVED_CHARACTER_REGEXP = new RegExp(`[${RESERVED_CHARACTERS.join('')}]`, 'g');
// From ArFS Standards
const MAX_VALID_NAME_LENGTH = 255;

export const assertValidArFSFileName = assertValidArFSEntityNameFactory('file');
export const assertValidArFSFolderName = assertValidArFSEntityNameFactory('folder');
export const assertValidArFSDriveName = assertValidArFSEntityNameFactory('drive');

export function assertValidArFSEntityNameFactory(entityType: EntityType): (name: string) => boolean {
	return function (name: string) {
		if (name.length > MAX_VALID_NAME_LENGTH || name.length === 0) {
			throw new Error(`The ${entityType} name must contain between 1 and ${MAX_VALID_NAME_LENGTH} characters`);
		}

		const matchLeadingSpaces = name.match(LEADING_SPACES_REGEXP);
		if (matchLeadingSpaces) {
			throw new Error(`The ${entityType} name cannot start with spaces`);
		}

		const matchTrailingDotsOrSpaces = name.match(TRAILING_DOTS_OR_SPACES_REGEXP);
		if (matchTrailingDotsOrSpaces) {
			throw new Error(`The ${entityType} name cannot have trailing dots or spaces`);
		}

		const matchReservedCharacters = name.match(CONTAINS_RESERVED_CHARACTER_REGEXP);
		if (matchReservedCharacters) {
			throw new Error(
				`The ${entityType} name cannot contain reserved characters (i.e. ${HUMAN_READABLE_RESERVED_CHARACTERS})`
			);
		}
		return true;
	};
}

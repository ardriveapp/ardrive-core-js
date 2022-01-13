const RESERVED_CHARACTERS = ['\\\\', '/', ':', '*', '?', '"', '<', '>', '|'];
/* RegExp explanation
 * - `^$` matches the beginning and the end of the string
 * - for each character, we ensure it is not a reserved one, and
 *   - that it's not preceded by a space at the beginning
 *   - nor a space or point at the end
 */
const VALID_FILE_NAME_REGEXP = new RegExp(`^(?:(?!^\\s)[^${RESERVED_CHARACTERS.join('')}](?![. ]$))+$`);
const MAX_VALID_NAME_LENGTH = 255;

export function assertValidName(name: string): boolean {
	if (name.length > MAX_VALID_NAME_LENGTH || name.length === 0) {
		throw new Error(`The file name must contain between 0 and ${MAX_VALID_NAME_LENGTH} characters`);
	}
	const match = name.match(VALID_FILE_NAME_REGEXP);
	if (!match) {
		throw new Error(
			`The file name cannot contain reserved characters, cannot start with space or end with a dot or space`
		);
	}
	return true;
}

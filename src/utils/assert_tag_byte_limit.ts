import { Tag } from 'arweave/node/lib/transaction';
import { ByteCount } from '../types';

export function assertTagByteLimit(tags: Tag[]): void {
	let tagsByteCount = new ByteCount(0);

	for (const tag of tags) {
		const nameLength = tag.name.length;
		const valueLength = tag.value.length;

		const tagLength = new ByteCount(nameLength + valueLength);

		tagsByteCount = tagsByteCount.plus(tagLength);
	}

	if (+tagsByteCount > 2048) {
		throw Error(`Transaction has ${tagsByteCount} bytes of GQL tags! This exceeds the tag limit of 2048 bytes.`);
	}
}

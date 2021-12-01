import { Readable } from 'stream';
import { ByteCount } from './byte_count';

export interface ReadableData {
	data: Readable;
	length: ByteCount;
}

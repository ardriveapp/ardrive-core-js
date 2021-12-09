import { expect } from 'chai';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { StreamDecrypt } from './stream_decrypt';

const pipelinePromise = promisify(pipeline);

describe('the StreamDecrypt class', () => {
	const healthyCipherIV = '44PEY4EvVXq6TuBp';
	const badCipherIV = 'xxxxxxxxxxxxxxxx';
	const healthyFileKey = Buffer.from('Zzaf6YeMb0chjYXjGkluCnLdufiu7/SxbuEbyPzR+1g=', 'base64');
	const data = ':)\n\n';
	const rawEncryptedData = Buffer.from('boFKovaNPFrbNHt0mftHjmQexP4=', 'base64');
	const encryptedData = rawEncryptedData.slice(0, rawEncryptedData.length - 16);
	const authTag = rawEncryptedData.slice(rawEncryptedData.length - 16, rawEncryptedData.length);
	let mockStream: Readable;

	beforeEach(() => {
		mockStream = new Readable();
		mockStream.push(encryptedData);
		mockStream.push(null); // EOF
	});

	it('successfully decrypts a file with a healthy input', () => {
		const decryptingStream = new StreamDecrypt(healthyCipherIV, healthyFileKey, authTag);
		let decryptedData = '';
		decryptingStream.on('data', (chunk: Buffer | string) => {
			decryptedData = `${decryptedData}${chunk.toString()}`;
		});
		return pipelinePromise(mockStream, decryptingStream).then(() => {
			return expect(decryptedData).to.equal(data);
		});
	});

	it('fails while decrypting with wrong secrets', () => {
		const decryptingStream = new StreamDecrypt(badCipherIV, healthyFileKey, authTag);
		return pipelinePromise(mockStream, decryptingStream).catch((err) => {
			return expect(err).to.be.instanceOf(Error);
		});
	});
});

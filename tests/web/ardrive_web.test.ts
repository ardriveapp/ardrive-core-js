import { expect } from '@esm-bundle/chai';
import type { DataItem } from '@dha-team/arbundles';
import {
	ArDriveWeb,
	ArDriveAnonymousWeb,
	arDriveFactory,
	arDriveAnonymousFactory,
	type WebFileToUpload
} from '../../dist/web/index.js';
import { testWallet } from './fixtures/testWallet';

const encoder = new TextEncoder();

describe('ArDrive web bundle', () => {
	it('creates ArDriveWeb via factory and signs data', async () => {
		const instance = arDriveFactory({ wallet: testWallet as any });
		expect(instance).to.be.instanceOf(ArDriveWeb);

		const payload = encoder.encode('hello from web bundle');
		const signed = await instance.signData(payload);

		expect(signed).to.have.property('id');
		expect(signed.getRaw()).to.be.instanceOf(Uint8Array);
	});

	it('uploads a public file using the provided postDataItem handler', async () => {
		const ardrive = new ArDriveWeb({ wallet: testWallet as any, appName: 'TestHarness', appVersion: 'headless' });

		const file: WebFileToUpload = {
			name: 'sample.txt',
			size: 5,
			lastModifiedDateMS: 1_700_000_000_000,
			contentType: 'text/plain',
			async getBytes() {
				return encoder.encode('hello');
			}
		};

		const postedItems: DataItem[] = [];
		const postDataItem = async (item: DataItem) => {
			postedItems.push(item);
			return `fake-id-${postedItems.length}`;
		};

		const result = await ardrive.uploadPublicFile({
			driveId: 'drive-id',
			parentFolderId: 'folder-id',
			file,
			postDataItem
		});

		expect(postedItems).to.have.length(2);
		expect(result.dataTxId).to.equal('fake-id-1');
		expect(result.metaDataTxId).to.equal('fake-id-2');
		expect(postedItems.every((item) => item.isSigned())).to.be.true;
	});

	it('returns anonymous instances when requested', () => {
		const anon = arDriveAnonymousFactory();
		expect(anon).to.be.instanceOf(ArDriveAnonymousWeb);
	});
});

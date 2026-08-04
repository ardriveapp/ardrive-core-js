import { expect } from 'chai';
import { ByteCount, GQLTagInterface, stubTransactionID, UnixTime } from '../../types';
import { stubArweaveAddress, stubEntityID, stubEntityIDAlt, stubEntityIDAltTwo } from '../../../tests/stubs';
import { ArFSPublicFilePinMetaDataPrototype } from './arfs_prototypes';
import { ArFSPublicFilePinMetadataTransactionData } from './arfs_tx_data_types';

// Fixed inputs so the interop golden vectors below are deterministic.
const driveId = stubEntityID;
const fileId = stubEntityIDAlt;
const parentFolderId = stubEntityIDAltTwo;
const dataTxId = stubTransactionID; // 43 zeros — the EXISTING data tx being pinned
const pinnedDataOwner = stubArweaveAddress(); // owner of the source data tx (the recognition key)
const size = new ByteCount(2048);
const lastModifiedDateMs = new UnixTime(1700000000000); // MILLISECONDS, minted fresh at pin time
const pinnedFileName = 'pinned photo.png';
const dataContentType = 'image/png';

const tagValue = (tags: GQLTagInterface[], name: string): string | undefined =>
	tags.find((t) => t.name === name)?.value;

describe('ArFSPublicFilePinMetadataTransactionData (pin metadata JSON)', () => {
	const txData = new ArFSPublicFilePinMetadataTransactionData(
		pinnedFileName,
		size,
		lastModifiedDateMs,
		dataTxId,
		dataContentType,
		pinnedDataOwner
	);

	// INTEROP GOLDEN (load-bearing): the serialized bytes must match ardrive-web's pin JSON schema
	// exactly (PINNING-PLAN §0.2) or ardrive-web will not render the entity as a pin.
	it('serializes the exact interop pin JSON, byte-for-byte', () => {
		const expected =
			'{"name":"pinned photo.png","size":2048,"lastModifiedDate":1700000000000,' +
			`"dataTxId":"${dataTxId}","dataContentType":"image/png",` +
			`"pinnedDataOwner":"${pinnedDataOwner}","thumbnail":null,"assignedNames":null}`;
		expect(txData.asTransactionData()).to.equal(expected);
	});

	it('emits the pin JSON keys in the ardrive-web order', () => {
		const parsed = JSON.parse(txData.asTransactionData() as string);
		expect(Object.keys(parsed)).to.deep.equal([
			'name',
			'size',
			'lastModifiedDate',
			'dataTxId',
			'dataContentType',
			'pinnedDataOwner',
			'thumbnail',
			'assignedNames'
		]);
	});

	it('emits pinnedDataOwner (non-null) as the recognition key, plus explicit null thumbnail/assignedNames', () => {
		const parsed = JSON.parse(txData.asTransactionData() as string);
		expect(parsed.pinnedDataOwner).to.equal(`${pinnedDataOwner}`);
		expect(parsed.pinnedDataOwner).to.not.equal(null);
		expect(parsed).to.have.property('thumbnail', null);
		expect(parsed).to.have.property('assignedNames', null);
	});

	it('passes the caller dataTxId through unchanged and uses milliseconds for lastModifiedDate', () => {
		const parsed = JSON.parse(txData.asTransactionData() as string);
		expect(parsed.dataTxId).to.equal(`${dataTxId}`);
		expect(parsed.lastModifiedDate).to.equal(1700000000000);
		expect(parsed.size).to.equal(2048);
		expect(parsed.dataContentType).to.equal('image/png');
	});

	it('does NOT emit writeNotNull fields absent from a pin (isHidden/licenseTxId/fallbackTxId/originalOwner)', () => {
		const parsed = JSON.parse(txData.asTransactionData() as string);
		expect(parsed).to.not.have.property('isHidden');
		expect(parsed).to.not.have.property('licenseTxId');
		expect(parsed).to.not.have.property('fallbackTxId');
		expect(parsed).to.not.have.property('originalOwner');
	});
});

describe('ArFSPublicFilePinMetaDataPrototype (pin tags)', () => {
	const prototype = ArFSPublicFilePinMetaDataPrototype.fromPin({
		dataTxId,
		pinnedDataOwner,
		size,
		dataContentType,
		pinnedFileName,
		lastModifiedDate: lastModifiedDateMs,
		driveId,
		fileId,
		parentFolderId
	});

	// INTEROP GOLDEN (load-bearing): the tag set must include ardrive-web's pin markers
	// (PINNING-PLAN §0.1). App-Name/App-Version/ArFS are added by the TxPreparer, NOT the prototype,
	// and are NOT part of the recognition contract, so we deliberately do not assert them here.
	it('emits the pin-specific tags ArFS-Pin=true and Pinned-Data-Tx=<dataTxId>', () => {
		const tags = prototype.gqlTags;
		expect(tagValue(tags, 'ArFS-Pin')).to.equal('true');
		expect(tagValue(tags, 'Pinned-Data-Tx')).to.equal(`${dataTxId}`);
	});

	it('emits the standard public file-metadata tags for the destination entity', () => {
		const tags = prototype.gqlTags;
		expect(tagValue(tags, 'Entity-Type')).to.equal('file');
		expect(tagValue(tags, 'Content-Type')).to.equal('application/json');
		expect(tagValue(tags, 'Drive-Id')).to.equal(`${driveId}`);
		expect(tagValue(tags, 'File-Id')).to.equal(`${fileId}`);
		expect(tagValue(tags, 'Parent-Folder-Id')).to.equal(`${parentFolderId}`);
		expect(tagValue(tags, 'Unix-Time')).to.match(/^\d+$/); // seconds since epoch
	});

	it('does not emit app tags at the prototype layer (not a recognition input, R2)', () => {
		const tags = prototype.gqlTags;
		expect(tagValue(tags, 'App-Name')).to.equal(undefined);
		expect(tagValue(tags, 'App-Version')).to.equal(undefined);
	});

	it('fromPin and the direct constructor produce identical tags and JSON', () => {
		const direct = new ArFSPublicFilePinMetaDataPrototype(
			new ArFSPublicFilePinMetadataTransactionData(
				pinnedFileName,
				size,
				lastModifiedDateMs,
				dataTxId,
				dataContentType,
				pinnedDataOwner
			),
			driveId,
			fileId,
			parentFolderId,
			dataTxId
		);
		// Unix-Time is minted per-instance from Date.now(), so exclude it from the equality check.
		const withoutUnixTime = (tags: GQLTagInterface[]) => tags.filter((t) => t.name !== 'Unix-Time');
		expect(withoutUnixTime(direct.gqlTags)).to.deep.equal(withoutUnixTime(prototype.gqlTags));
		expect(direct.objectData.asTransactionData()).to.equal(prototype.objectData.asTransactionData());
	});
});

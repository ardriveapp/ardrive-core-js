import { expect } from 'chai';
import { ArFSResult, EntityID, TransactionID, W, Winston } from '../src/exports';
import { stubTxID, stubArweaveAddress } from './stubs';

const entityIdRegex = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const txIdRegex = /^(\w|-){43}$/;

export function assertRetryExpectations({
	result,
	expectedFileId,
	expectedDataTxId = stubTxID,
	expectedMetaDataTxId,
	expectedMetaDataTxReward,
	expectedCommunityTip = W(5),
	expectedDataTxReward = W(10)
}: {
	result: ArFSResult;
	expectedFileId?: EntityID;
	expectedDataTxId?: TransactionID;
	expectedMetaDataTxId?: TransactionID;
	expectedMetaDataTxReward?: Winston;
	expectedCommunityTip?: Winston;
	expectedDataTxReward?: Winston;
}): void {
	const { created, tips, fees } = result;

	expect(created).to.have.length(1);
	const { type, bundleTxId, dataTxId, entityId, key, metadataTxId } = created[0];

	expect(type).to.equal('file');

	expect(bundleTxId).to.be.undefined;
	expect(key).to.be.undefined;

	expect(`${dataTxId}`).to.equal(`${expectedDataTxId}`);

	if (expectedMetaDataTxId) {
		expect(`${metadataTxId}`).to.equal(`${expectedMetaDataTxId}`);
	} else {
		expect(metadataTxId).to.match(txIdRegex);
	}

	if (expectedFileId) {
		expect(`${entityId}`).to.equal(`${expectedFileId}`);
	} else {
		expect(entityId).to.match(entityIdRegex);
	}

	expect(tips).to.have.length(1);
	const { recipient, txId, winston } = tips[0];

	expect(`${recipient}`).to.equal(`${stubArweaveAddress()}`);
	expect(`${txId}`).to.equal(`${expectedDataTxId}`);
	expect(+winston).to.equal(+expectedCommunityTip);

	expect(Object.keys(fees)).to.have.length(expectedMetaDataTxReward === undefined ? 1 : 2);
	expect(+fees[`${expectedDataTxId}`]).to.equal(+expectedDataTxReward);

	if (expectedMetaDataTxReward) {
		expect(+Object.values(fees)[1]).to.equal(+expectedMetaDataTxReward);
	}
}

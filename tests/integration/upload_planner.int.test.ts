import { expect } from 'chai';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import { ArFSTagAssembler } from '../../src/arfs/tags/tag_assembler';
import { ArFSTagSettings } from '../../src/arfs/tags/arfs_tag_settings';
import { TxPreparer } from '../../src/arfs/tx/tx_preparer';
import { UploadStats, ArFSFileToUpload, getPrepFileParams, TxID, W, readJWKFile, JWKWallet } from '../../src/exports';
import { fakeArweave, stubFileUploadStats, stubEntityID } from '../stubs';

describe('UploadPlanner + TxPreparer -- integrated', () => {
	const wallet = readJWKFile('./test_wallet.json') as JWKWallet;

	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArFSDAO Integration Test', appVersion: '1.2' });
	const txPreparer = new TxPreparer({
		arweave: fakeArweave,
		wallet,
		arFSTagAssembler: new ArFSTagAssembler(arFSTagSettings)
	});
	const bundledUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings: arFSTagSettings
	});

	it('bundled byte count of a file upload matches the predicted byte count from the Upload Planner', async () => {
		const uploadPlan = await bundledUploadPlanner.planUploadAllEntities([stubFileUploadStats()]);
		const bundlePlan = uploadPlan.bundlePlans[0];
		const uploadStats = bundlePlan.uploadStats[0] as UploadStats<ArFSFileToUpload>;

		const plannedBundleByteCount = bundlePlan.totalByteCount;

		const prototypeFactories = getPrepFileParams(uploadStats);

		const fileDataItem = await txPreparer.prepareFileDataDataItem({
			objectMetaData: await prototypeFactories.dataPrototypeFactoryFn(
				uploadStats.wrappedEntity.getFileDataBuffer(),
				stubEntityID
			)
		});
		const metaDataItem = await txPreparer.prepareMetaDataDataItem({
			objectMetaData: await prototypeFactories.metadataTxDataFactoryFn(stubEntityID, TxID(fileDataItem.id))
		});
		const bundle = await txPreparer.prepareBundleTx({
			dataItems: [fileDataItem, metaDataItem],
			rewardSettings: { reward: W(1) }
		});

		expect(+plannedBundleByteCount).to.equal(bundle.data.length);
	});
});

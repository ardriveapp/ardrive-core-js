import { expect } from 'chai';
import { ArFSTagSettings } from '../../src/arfs/arfs_tag_settings';
import { ArFSUploadPlanner } from '../../src/arfs/arfs_upload_planner';
import {
	ArDriveCommunityOracle,
	ArFSDAO,
	UploadStats,
	ArFSFileToUpload,
	getPrepFileParams,
	TxID,
	W,
	readJWKFile
} from '../../src/exports';
import { ARDataPriceRegressionEstimator } from '../../src/pricing/ar_data_price_regression_estimator';
import { GatewayOracle } from '../../src/pricing/gateway_oracle';
import { fakeArweave, stubFileUploadStats, stubEntityID } from '../stubs';

describe('ArFSDAO Class -- integrated', () => {
	const wallet = readJWKFile('./test_wallet.json');

	const arweaveOracle = new GatewayOracle();
	const communityOracle = new ArDriveCommunityOracle(fakeArweave);
	const priceEstimator = new ARDataPriceRegressionEstimator(true, arweaveOracle);
	const arFSTagSettings = new ArFSTagSettings({ appName: 'ArFSDAO Integration Test', appVersion: '1.2' });
	const arfsDao = new ArFSDAO(wallet, fakeArweave, true, 'Integration Test', '1.2', arFSTagSettings);

	const bundledUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings: arFSTagSettings,
		priceEstimator,
		communityOracle
	});

	it('bundled byte count of a file upload matches the predicted byte count from the Upload Planner', async () => {
		const uploadPlan = await bundledUploadPlanner.planUploadAllEntities([stubFileUploadStats()]);
		const bundlePlan = uploadPlan.bundlePlans[0];
		const uploadStats = bundlePlan.uploadStats[0] as UploadStats<ArFSFileToUpload>;

		const plannedBundleByteCount = bundlePlan.totalByteCount;

		const prototypeFactories = getPrepFileParams(uploadStats);

		const fileDataItem = await arfsDao.prepareArFSDataItem({
			objectMetaData: await prototypeFactories.dataPrototypeFactoryFn(
				uploadStats.wrappedEntity.getFileDataBuffer(),
				stubEntityID
			),
			excludedTagNames: ['ArFS']
		});
		const metaDataItem = await arfsDao.prepareArFSDataItem({
			objectMetaData: await prototypeFactories.metadataTxDataFactoryFn(stubEntityID, TxID(fileDataItem.id))
		});
		const bundle = await arfsDao.prepareArFSObjectBundle({
			dataItems: [fileDataItem, metaDataItem],
			rewardSettings: { reward: W(1) }
		});

		expect(+plannedBundleByteCount).to.equal(bundle.data.length);
	});
});

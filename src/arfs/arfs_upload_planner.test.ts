/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from 'chai';
import {
	stubFileUploadStats,
	stubFolderUploadStats,
	stubEntityIDAlt,
	stubPrivateDriveMetaDataTx,
	stubPrivateFolderMetaDataTx,
	stubPublicDriveMetaDataTx,
	stubPublicFolderMetaDataTx
} from '../../tests/stubs';
import { ArFSTagSettings } from '../arfs/arfs_tag_settings';
import { ByteCount } from '../types';
import { CreateDriveBundlePlan, CreateDriveV2Plan, EstimateCreateDriveParams } from '../types/upload_planner_types';
import { ArFSUploadPlanner } from './arfs_upload_planner';
import { wrapFileOrFolder, ArFSFolderToUpload } from './arfs_file_wrapper';

describe('The ArFSUploadPlanner class', () => {
	const arFSTagSettings = new ArFSTagSettings({ appName: 'Fabulous-Test', appVersion: '1.2' });

	/** An upload planner set to bundle transactions if possible */
	const bundledUploadPlanner = new ArFSUploadPlanner({
		arFSTagSettings: arFSTagSettings
	});

	/** An upload planner set to only send v2 transactions */
	const v2TxUploadPlanner = new ArFSUploadPlanner({
		shouldBundle: false,
		arFSTagSettings: arFSTagSettings
	});

	it('cannot be constructed with a max data item limit of less than 2', () => {
		expect(() => new ArFSUploadPlanner({ arFSTagSettings, maxDataItemLimit: 1 })).to.throw(
			Error,
			'Maximum data item limit must be an integer value of 2 or more!'
		);
	});
	it('cannot be constructed with a non-integer decimal value as the max data item limit', () => {
		expect(() => new ArFSUploadPlanner({ arFSTagSettings, maxDataItemLimit: 5.5 })).to.throw(
			Error,
			'Maximum data item limit must be an integer value of 2 or more!'
		);
	});

	describe('planUploadAllEntities method', () => {
		it('returns the expected uploadPlan for a single wrappedFile', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([stubFileUploadStats()]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadStats, totalByteCount } = bundlePlans[0];

			expect(uploadStats.length).to.equal(1);
			expect(+totalByteCount).to.equal(5953);
		});

		it('returns the expected uploadPlan for a single wrappedFolder', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([stubFolderUploadStats()]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadStats, totalByteCount } = bundlePlans[0];

			expect(uploadStats.length).to.equal(8);
			expect(+totalByteCount).to.equal(11287);
		});

		it('returns the expected uploadPlan for a folder with an existing folder id', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const wrappedFolderWithExistingId = wrapFileOrFolder(
				'./tests/stub_files/bulk_root_folder'
			) as ArFSFolderToUpload;
			wrappedFolderWithExistingId.existingId = stubEntityIDAlt;

			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				{ ...stubFolderUploadStats(), wrappedEntity: wrappedFolderWithExistingId }
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadStats, totalByteCount } = bundlePlans[0];

			expect(uploadStats.length).to.equal(7);
			expect(+totalByteCount).to.equal(11196);

			// Expect first upload stat to have our existing stub folder id
			expect(`${uploadStats[0].destFolderId}`).to.equal(`${stubEntityIDAlt}`);
		});

		it('returns the expected uploadPlan for a two wrappedFiles', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				stubFileUploadStats(),
				stubFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(1);
			expect(v2TxPlans.length).to.equal(0);

			const { uploadStats, totalByteCount } = bundlePlans[0];

			expect(uploadStats.length).to.equal(2);
			expect(+totalByteCount).to.equal(11874);
		});

		it('returns the expected uploadPlan for a single file that is over the size limit', async () => {
			const uploadPlannerWithLowByteLimit = new ArFSUploadPlanner({
				arFSTagSettings,
				maxBundleLimit: new ByteCount(3_000)
			});
			const { bundlePlans, v2TxPlans } = await uploadPlannerWithLowByteLimit.planUploadAllEntities([
				stubFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(0);
			expect(v2TxPlans.length).to.equal(1);

			const { fileDataByteCount, metaDataByteCount, metaDataBundleIndex } = v2TxPlans[0];

			expect(+fileDataByteCount!).to.equal(3204);
			expect(+metaDataByteCount!).to.equal(166);
			expect(metaDataBundleIndex).to.be.undefined;
		});

		it('returns the expected uploadPlan for a two files that are over the size limit', async () => {
			const uploadPlannerWithLowByteLimit = new ArFSUploadPlanner({
				arFSTagSettings,
				maxBundleLimit: new ByteCount(3_000)
			});
			const { bundlePlans, v2TxPlans } = await uploadPlannerWithLowByteLimit.planUploadAllEntities([
				stubFileUploadStats(),
				stubFileUploadStats()
			]);

			// Expect one bundle for the 2 metadata data items
			expect(bundlePlans.length).to.equal(1);
			const { uploadStats, totalByteCount: bundleByteCount } = bundlePlans[0];
			expect(+bundleByteCount).to.equal(3108);
			expect(uploadStats.length).to.equal(0);

			// Expect two v2 transactions for the oversized files
			expect(v2TxPlans.length).to.equal(2);
			for (const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } of v2TxPlans) {
				expect(+fileDataByteCount!).to.equal(3204);

				// V2 tx plan will have a metadata bundle index for
				expect(metaDataBundleIndex).to.equal(0);
				expect(metaDataByteCount).to.be.undefined;
			}
		});

		it('returns the expected uploadPlan for a two wrappedFiles when shouldBundle is set to false', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings, shouldBundle: false });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				stubFileUploadStats(),
				stubFileUploadStats()
			]);

			expect(bundlePlans.length).to.equal(0);

			expect(v2TxPlans.length).to.equal(2);
			for (const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } of v2TxPlans) {
				expect(+fileDataByteCount!).to.equal(3204);
				expect(+metaDataByteCount!).to.equal(166);
				expect(metaDataBundleIndex).to.be.undefined;
			}
		});

		const bulkFolderV2Expectations = [
			{ expectedMetaDataSize: 27 },
			{ expectedFileSize: 12, expectedMetaDataSize: 158 },
			{ expectedMetaDataSize: 24 },
			{ expectedFileSize: 12, expectedMetaDataSize: 160 },
			{ expectedMetaDataSize: 23 },
			{ expectedFileSize: 14, expectedMetaDataSize: 159 },
			{ expectedMetaDataSize: 28 },
			{ expectedFileSize: 14, expectedMetaDataSize: 164 }
		];

		it('returns the expected uploadPlan for a wrappedFolder when shouldBundle is set to false', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings, shouldBundle: false });
			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([stubFolderUploadStats()]);

			expect(bundlePlans.length).to.equal(0);

			expect(v2TxPlans.length).to.equal(8);
			for (let index = 0; index < v2TxPlans.length; index++) {
				const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } = v2TxPlans[index];
				const { expectedFileSize, expectedMetaDataSize } = bulkFolderV2Expectations[index];

				if (expectedFileSize) {
					expect(+fileDataByteCount!).to.equal(expectedFileSize);
				}
				expect(+metaDataByteCount!).to.equal(expectedMetaDataSize);
				expect(metaDataBundleIndex).to.be.undefined;
			}
		});

		it('returns the expected uploadPlan for single wrappedFolder', async () => {
			const uploadPlanner = new ArFSUploadPlanner({ arFSTagSettings });
			const emptyWrappedFolder = wrapFileOrFolder('./tests/stub_files/bulk_root_folder') as ArFSFolderToUpload;

			// Empty the contents of the folder to upload
			emptyWrappedFolder.files = [];
			emptyWrappedFolder.folders = [];

			const { bundlePlans, v2TxPlans } = await uploadPlanner.planUploadAllEntities([
				{ ...stubFolderUploadStats(), wrappedEntity: emptyWrappedFolder }
			]);

			// Expect no bundles for a single folder meta data upload
			expect(bundlePlans.length).to.equal(0);
			expect(v2TxPlans.length).to.equal(1);

			const { fileDataByteCount, metaDataBundleIndex, metaDataByteCount } = v2TxPlans[0];

			expect(fileDataByteCount).to.be.undefined;
			expect(+metaDataByteCount!).to.equal(27);
			expect(metaDataBundleIndex).to.be.undefined;
		});
	});

	describe('planCreateDrive function', () => {
		describe('used on a public drive', () => {
			const publicCreateDriveParams: EstimateCreateDriveParams = {
				rootFolderMetaDataPrototype: stubPublicFolderMetaDataTx,
				driveMetaDataPrototype: stubPublicDriveMetaDataTx
			};

			it('returns correct byte count for a bundle', async () => {
				const uploadPlan = bundledUploadPlanner.planCreateDrive(publicCreateDriveParams);
				console.log('uploadPlan', uploadPlan);
				const { totalBundledByteCount } = uploadPlan as CreateDriveBundlePlan;

				// Expected ByteCount for this create drive Bundle is 2832
				expect(+totalBundledByteCount).to.equal(2832);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const uploadPlan = v2TxUploadPlanner.planCreateDrive(publicCreateDriveParams);
				const { driveByteCount, rootFolderByteCount } = uploadPlan as CreateDriveV2Plan;

				// Expected byte count of drive metadata tx is 91 bytes
				expect(+driveByteCount).to.equal(91);

				// Expected byte count of root folder metadata tx is 38 bytes
				expect(+rootFolderByteCount).to.equal(38);
			});
		});

		describe('used on a private drive', async () => {
			const privateCreateDriveParams: () => Promise<EstimateCreateDriveParams> = async () => {
				return {
					rootFolderMetaDataPrototype: await stubPrivateFolderMetaDataTx,
					driveMetaDataPrototype: await stubPrivateDriveMetaDataTx
				};
			};

			it('returns correct rewardSetting and totalWinstonPrice for a bundle', async () => {
				const uploadPlan = bundledUploadPlanner.planCreateDrive(await privateCreateDriveParams());
				const { totalBundledByteCount } = uploadPlan as CreateDriveBundlePlan;

				// Expected ByteCount for this private drive Bundle is 2998
				expect(+totalBundledByteCount).to.equal(2998);
			});

			it('returns correct rewardSetting and totalWinstonPrice for a v2 transaction', async () => {
				const uploadPlan = v2TxUploadPlanner.planCreateDrive(await privateCreateDriveParams());
				const { driveByteCount, rootFolderByteCount } = uploadPlan as CreateDriveV2Plan;

				// Expected byte count of private drive metadata tx is 108 bytes
				expect(+driveByteCount).to.equal(108);

				// Expected byte count of private root folder metadata tx is 55 bytes
				expect(+rootFolderByteCount).to.equal(55);
			});
		});
	});
});

import { expect } from 'chai';
import { DownloadManager, EntityToDownload, DownloadResult } from './download_manager';

const downloadedFolderResult: DownloadResult = {
	status: 'success',
	localPath: '/path/to/my/downloaded/folder'
};

const downloadedFileResult: DownloadResult = {
	status: 'success',
	localPath: '/path/to/my/downloaded/file'
};

const folderToDownload: EntityToDownload = {
	entityType: 'folder',
	download: () => Promise.resolve(downloadedFolderResult)
};

const fileToDownload: EntityToDownload = {
	entityType: 'file',
	download: () => Promise.resolve(downloadedFileResult)
};

const slowFileToDownload: EntityToDownload = {
	entityType: 'file',
	download: () => new Promise((resolve) => setTimeout(() => resolve(downloadedFileResult), 10))
};

describe('DownloadManager class', () => {
	it('instantly resolves when an empty array of items is passed', () => {
		const downloader = new DownloadManager([], 5);
		return downloader.start();
	});

	it('resolves in an array of the same length than the one passed to the constructor', async () => {
		const downloader = new DownloadManager([folderToDownload, fileToDownload], 5);
		const results = await downloader.start();
		expect(results).to.deep.equal([downloadedFolderResult, downloadedFileResult]);
	});

	it('the downloads-in-progress count equals the max when the length of items to download is bigger than the max', async () => {
		const downloader = new DownloadManager([folderToDownload, slowFileToDownload, fileToDownload], 1);
		const downloadPromise = downloader.start();
		expect(downloader.downloadsInProgressAmount).to.equal(1);
		await downloadPromise;
	});

	it('start method will resolve after ALL of the pending downloads were handled', async () => {
		const downloader = new DownloadManager([folderToDownload, slowFileToDownload, fileToDownload], 2);
		const downloadPromise = downloader.start();
		await downloadPromise;
		expect(downloader.downloadsInProgressAmount).to.equal(0);
	});

	it('throws when an invalid maxDownloadsInParallel is passed', () => {
		expect(() => new DownloadManager([], -1)).to.throw();
		expect(() => new DownloadManager([], 0)).to.throw();
		expect(() => new DownloadManager([], 0.5)).to.throw();
	});
});

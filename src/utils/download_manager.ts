export interface EntityToDownload {
	readonly entityType: 'file' | 'folder';
	readonly download: (progressCallback?: ProgressCallback) => Promise<DownloadResult>;
}

export interface DownloadResult {
	readonly status: 'success' | 'failed';
	readonly error?: Error;
	readonly localPath: string;
}

export type ProgressCallback = (pctTotal: number, pctFile: number, curFileName: string, curFilePath: string) => void;

export class DownloadManager {
	private readonly downloadsInProgress: EntityToDownload[] = [];
	private readonly pendingDownloads: EntityToDownload[] = [];
	private readonly downloadResults: DownloadResult[] = [];

	constructor(entitiesToDownload: EntityToDownload[], private readonly maxDownloadsInParallel: number) {
		if (!Number.isInteger(maxDownloadsInParallel) || maxDownloadsInParallel <= 0) {
			throw new Error('The max downloads in parallel must be an integer number greater than zero');
		}
		this.pendingDownloads = entitiesToDownload.slice();
	}

	get downloadsInProgressAmount(): number {
		return this.downloadsInProgress.length;
	}

	private flush = async (): Promise<void> => {
		const itemsToDownloadAmount = this.maxDownloadsInParallel - this.downloadsInProgressAmount;
		const itemsToDownload = this.pendingDownloads.splice(0, itemsToDownloadAmount);
		itemsToDownload.forEach(async (entityToDownload) => {
			entityToDownload.download().then((result) => {
				this.downloadResults.push(result);
				const inProgressIndex = this.downloadsInProgress.findIndex((download) => download === entityToDownload);
				if (inProgressIndex !== -1) {
					this.downloadsInProgress.splice(inProgressIndex, 1);
				}
			});
			this.downloadsInProgress.push(entityToDownload);
			await entityToDownload.download();
		});
		debugger;
		if (this.downloadsInProgressAmount) {
			const downloadsInProgressRace = Promise.race(this.downloadsInProgress);
			await downloadsInProgressRace;
		}
		if (this.pendingDownloads.length || this.downloadsInProgressAmount) {
			await this.flush();
		}
	};

	public async start(): Promise<DownloadResult[]> {
		await this.flush();
		return this.downloadResults;
	}
}

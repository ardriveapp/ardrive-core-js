import { Readable } from 'node:stream';
import { DataItem } from '@dha-team/arbundles';

import { TurboUnauthenticatedClient, TurboUploadDataItemResponse, TurboFactory } from '@ardrive/turbo-sdk';
import { defaultTurboPaymentUrl, defaultTurboUploadUrl } from '../utils/constants';

export interface TurboSettings {
	/** @deprecated Use turboUploadUrl instead */
	turboUrl?: URL;
	turboUploadUrl?: URL;
	turboPaymentUrl?: URL;
}

export interface TurboCachesResponse {
	dataCaches?: string[];
	fastFinalityIndexes?: string[];
}

// Note: this class is a wrapper of the TurboSDk - it's helpful for things like dry run and other tests, but could be removed in the future
export class Turbo {
	private isDryRun: boolean;
	private turbo: TurboUnauthenticatedClient;

	constructor({
		turboUploadUrl,
		turboPaymentUrl = defaultTurboPaymentUrl,
		turboUrl,
		isDryRun = false
	}: TurboSettings & { isDryRun?: boolean }) {
		if (turboUrl) {
			turboUploadUrl ??= turboUrl;
		}
		turboUploadUrl ??= defaultTurboUploadUrl;
		this.isDryRun = isDryRun;
		this.turbo = TurboFactory.unauthenticated({
			uploadServiceConfig: {
				url: turboUploadUrl.origin
			},
			paymentServiceConfig: {
				url: turboPaymentUrl.origin
			}
		});
	}

	async sendDataItem(dataItem: DataItem): Promise<TurboUploadDataItemResponse> {
		const defaultResponse = {
			id: dataItem.id,
			owner: dataItem.owner,
			dataCaches: [],
			fastFinalityIndexes: [],
			winc: '0'
		};
		if (this.isDryRun) {
			return defaultResponse;
		}

		// convert the data item Buffer to a Readable
		return this.turbo.uploadSignedDataItem({
			dataItemStreamFactory: () => Readable.from(dataItem.getRaw()),
			dataItemSizeFactory: () => dataItem.getRaw().length
		});
	}
}

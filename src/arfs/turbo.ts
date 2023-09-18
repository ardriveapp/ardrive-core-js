import { DataItem } from 'arbundles';
import { Readable } from 'node:stream';

import {TurboUnauthenticatedClient, TurboUploadDataItemResponse, TurboFactory } from '@ardrive/turbo-sdk';

export interface TurboSettings {
	turboUploadUrl: URL;
	turboPaymentUrl: URL;
	isDryRun: boolean;
}

export interface TurboCachesResponse {
	dataCaches?: string[];
	fastFinalityIndexes?: string[];
}

// Note: this class is a wrapper of the TurboSDk - it's helpful for things like dry run and other tests, but could be removed in the future
export class Turbo {
	private isDryRun: boolean;
	private turbo: TurboUnauthenticatedClient;

	constructor({ turboUploadUrl, turboPaymentUrl, isDryRun = false }: TurboSettings) {
		this.isDryRun = isDryRun;
		this.turbo = TurboFactory.unauthenticated({
			uploadServiceConfig: {
				url: turboUploadUrl.toString()
			},
			paymentServiceConfig: {
				url: turboPaymentUrl.toString()
			}
		});
	}

	async sendDataItem(dataItem: DataItem): Promise<TurboUploadDataItemResponse> {
		const defaultResponse = {
			id: dataItem.id,
			owner: dataItem.owner,
			dataCaches: [],
			fastFinalityIndexes: []
		};
		if (this.isDryRun) {
			return defaultResponse;
		}

		// convert the data item Buffer to a Readable
		return this.turbo.uploadSignedDataItem({
			dataItemStreamFactory: () => Readable.from(dataItem.getRaw())
		});
	}
}

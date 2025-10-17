import { DataItem } from '@dha-team/arbundles';
import type { TurboUnauthenticatedClient, TurboUploadDataItemResponse } from '@ardrive/turbo-sdk';
import { TurboFactory } from '@ardrive/turbo-sdk';
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

/**
 * Browser-compatible Turbo wrapper
 * Uses ReadableStream instead of Node.js Readable streams
 */
export class TurboWeb {
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

		// Convert DataItem buffer to ReadableStream for browser
		const buffer = dataItem.getRaw();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(buffer);
				controller.close();
			}
		});

		return this.turbo.uploadSignedDataItem({
			dataItemStreamFactory: () => stream,
			dataItemSizeFactory: () => buffer.length
		});
	}
}

import { DataItem } from 'arbundles';
import { createAxiosInstance } from '../utils/axiosClient';
import { AxiosInstance } from 'axios';

interface TurboParams {
	turboUrl: URL;
	isDryRun: boolean;
	axios?: AxiosInstance;
}

export interface TurboCachesResponse {
	dataCaches?: string[];
	fastFinalityIndexes?: string[];
}

export interface SendDataItemsResponse extends TurboCachesResponse {
	id: string;
	owner: string;
}

export class Turbo {
	public readonly turboUrl: URL;
	private isDryRun: boolean;
	private axios: AxiosInstance;

	constructor({ turboUrl, isDryRun, axios = createAxiosInstance({}) }: TurboParams) {
		this.turboUrl = turboUrl;
		this.isDryRun = isDryRun;
		this.axios = axios;
	}

	private get dataItemEndpoint(): string {
		return `${this.turboUrl.href}v1/tx`;
	}

	async sendDataItem(dataItem: DataItem): Promise<SendDataItemsResponse> {
		const defaultResponse = { id: dataItem.id, owner: dataItem.owner };
		if (this.isDryRun) {
			return defaultResponse;
		}

		const { data, status, statusText } = await this.axios.post<SendDataItemsResponse>(
			this.dataItemEndpoint,
			dataItem.getRaw(),
			{
				headers: {
					'Content-Type': 'application/octet-stream'
				},
				maxBodyLength: Infinity,
				validateStatus: () => true
			}
		);

		if (status === 202) {
			return defaultResponse;
		}

		if (status !== 200) {
			throw new Error(`Upload to Turbo Has Failed. Status: ${status} Text: ${statusText}`);
		}

		return data;
	}
}

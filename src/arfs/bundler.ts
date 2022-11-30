import { DataItem } from 'arbundles';
import axios from 'axios';

interface BundlerParams {
	bundlerUrl: URL;
}

export class Bundler {
	private bundlerUrl: URL;

	constructor({ bundlerUrl }: BundlerParams) {
		this.bundlerUrl = bundlerUrl;
	}

	private get dataItemEndpoint(): string {
		return `${this.bundlerUrl.href}v1/tx`;
	}

	async sendDataItems(dataItems: DataItem[]): Promise<void> {
		for (const dataItem of dataItems) {
			await axios.post(this.dataItemEndpoint, dataItem.getRaw(), {
				headers: {
					'Content-Type': 'application/octet-stream'
				},
				timeout: 100000,
				maxBodyLength: Infinity,
				validateStatus: (status) => (status > 200 && status < 300) || status !== 402
			});
		}
	}
}

import { DataItem } from 'arbundles';
import axios from 'axios';

interface BundlerParams {
	bundlerUrl: URL;
	isDryRun: boolean;
}

export class Bundler {
	private bundlerUrl: URL;
	private isDryRun: boolean;

	constructor({ bundlerUrl, isDryRun }: BundlerParams) {
		this.bundlerUrl = bundlerUrl;
		this.isDryRun = isDryRun;
	}

	private get dataItemEndpoint(): string {
		return `${this.bundlerUrl.href}v1/tx`;
	}

	async sendDataItems(dataItems: DataItem[]): Promise<void> {
		if (!this.isDryRun) {
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
}

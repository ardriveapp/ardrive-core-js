import { DataItem } from 'arbundles';
import axios from 'axios';

interface TurboParams {
	turboUrl: URL;
	isDryRun: boolean;
}

export class Turbo {
	private turboUrl: URL;
	private isDryRun: boolean;

	constructor({ turboUrl, isDryRun }: TurboParams) {
		this.turboUrl = turboUrl;
		this.isDryRun = isDryRun;
	}

	private get dataItemEndpoint(): string {
		return `${this.turboUrl.href}v1/tx`;
	}

	async sendDataItems(dataItems: DataItem[]): Promise<void> {
		if (!this.isDryRun) {
			for (const dataItem of dataItems) {
				await axios.post(this.dataItemEndpoint, dataItem.getRaw(), {
					headers: {
						'Content-Type': 'application/octet-stream'
					},
					maxBodyLength: Infinity,
					validateStatus: (status) => (status > 200 && status < 300) || status !== 402
				});
			}
		}
	}
}

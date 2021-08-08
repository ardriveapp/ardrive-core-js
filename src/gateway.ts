import { arweave } from './arweave';
import { GQLNodeInterface } from './types/gql_Types';
import Axios from 'axios';

// List (in order of initial preference) of the gateways for requests.
const gateways = [
	"https://arweave.net",
	"https://arweave.live",
	"https://arweave.dev"
];

// Index of the currently used gateway into gateways.
let currentGateway: number = 0;

// Switches to the next gateway.
function switchGateway() {
	currentGateway = (currentGateway + 1) % gateways.length;
	console.log("Switched gateway to " + gateways[currentGateway]);
}

// Chooses the current gateway and runs a callback with it.
// If an error occurs, the call is retried and the gateway
// switched automatically.
export async function queryGateway(query: (url: string) => Promise<any>): Promise<any> {
	const initialGatewayIndex = currentGateway;
	let tries: number = 0;
	while (true) {
		try {
			return await query(gateways[currentGateway]);
		} catch (err) {
			console.log(err);
			console.log("Gateway error with " + gateways[currentGateway] + ", retrying...");
			tries += 1;
			if (tries >= 5) {
			    tries = 0;
			    switchGateway ();
			    if (currentGateway === initialGatewayIndex) {
				    // We've tried all gateways, nothing left to do.
				    return Promise.reject(err);
			    }
			}
		}
	}
}

// Gets only the data of a given ArDrive Data transaction (U8IntArray)
export function getTransactionData(txid: string): Promise<Uint8Array> {
	return queryGateway(async (url: string): Promise<Uint8Array> => {
		const response = await Axios({
			method: 'get',
			url: url + "/" + txid,
			responseType: 'arraybuffer'
		});
		return response.data;
	});
}

// Gets metadata (in particular, tags) of a transaction as JSON.
export function getTransactionMetadata(txid: string): Promise<GQLNodeInterface> {
	return queryGateway(async (url: string): Promise<GQLNodeInterface> => {
		const response = await Axios({
			method: 'get',
			url: url + "/tx/" + txid,
			responseType: 'json'
		});
		return response.data;
	});
}

// Get the latest status of a transaction
export async function getTransactionStatus(txid: string): Promise<number> {
	try {
		const response = await arweave.transactions.getStatus(txid);
		return response.status;
	} catch (err) {
		// console.log(err);
		return 0;
	}
}

// Get the latest block height
export async function getLatestBlockHeight(): Promise<number> {
	try {
		const info = await arweave.network.getInfo();
		return info.height;
	} catch (err) {
		console.log('Failed getting latest block height');
		return 0;
	}
}

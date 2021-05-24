import { arweave } from './public/arweave';

// Gets only the data of a given ArDrive Data transaction (U8IntArray)
export async function getTransactionData(txid: string): Promise<string | Uint8Array> {
	try {
		const data = await arweave.transactions.getData(txid, { decode: true });
		return data;
	} catch (err) {
		console.log('Error getting transaction data for Txid %s', txid);
		console.log(err);
		return Promise.reject(err);
	}
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

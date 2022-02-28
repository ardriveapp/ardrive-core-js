import Arweave from 'arweave';
import axios, { AxiosInstance } from 'axios';
import axiosRetry, { exponentialDelay } from 'axios-retry';
import { ArFSMetadataCache } from '../arfs/arfs_metadata_cache';
import { gatewayUrlForArweave, TransactionID } from '../exports';

export async function getDataForTxID(
	txId: TransactionID,
	arweave: Arweave,
	axiosInstance?: AxiosInstance // Provided for test mocking :(
): Promise<Buffer> {
	const cachedData = await ArFSMetadataCache.get(txId);
	if (cachedData) {
		return cachedData;
	}

	const reqURL = `${gatewayUrlForArweave(arweave).href}${txId}`;

	axiosInstance ??= axios.create();
	const maxRetries = 5;
	axiosRetry(axiosInstance, {
		retries: maxRetries,
		retryDelay: (retryNumber) => {
			console.error(`Retry attempt ${retryNumber}/${maxRetries} of request to ${reqURL}`);
			return exponentialDelay(retryNumber);
		}
	});
	const {
		data: txData
	}: {
		data: Buffer;
	} = await axiosInstance.get(reqURL, {
		responseType: 'arraybuffer'
	});

	await ArFSMetadataCache.put(txId, txData);
	return txData;
}

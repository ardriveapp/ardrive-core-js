import Transaction from 'arweave/node/lib/transaction';

export async function rePrepareV2Tx(transaction: Transaction, fileData: Buffer): Promise<Transaction> {
	transaction = new Transaction(transaction);
	transaction.data = fileData;

	await transaction.prepareChunks(fileData);

	return transaction;
}

export function assertDataRootsMatch(transaction: Transaction, dataRootFromGateway: string): void {
	if (transaction.data_root !== dataRootFromGateway) {
		throw Error(
			`Provided file's data does not match the "data_root" field on transaction with id: ${transaction.id}!`
		);
	}
}

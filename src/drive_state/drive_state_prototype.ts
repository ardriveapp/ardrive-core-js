import { ArFSObjectMetadataPrototype } from '../arfs/tx/arfs_prototypes';
import { ArFSPublicFileDataTransactionData } from '../arfs/tx/arfs_tx_data_types';
import { GQLTagInterface } from '../types';
import { BuiltDriveState } from './drive_state_builder';

/**
 * A built Drive State as a transaction to prepare: its sealed body and its
 * tags. Prepared as metadata, so the uploader adds `ArFS`, `App-Name` and
 * `App-Version`, and never a `Content-Encoding`.
 */
export class ArFSDriveStatePrototype extends ArFSObjectMetadataPrototype {
	readonly objectData: ArFSPublicFileDataTransactionData;
	protected readonly protectedTags: GQLTagInterface[];

	constructor(built: BuiltDriveState, unixTime: number = Math.floor(Date.now() / 1000)) {
		super({});
		this.objectData = new ArFSPublicFileDataTransactionData(Buffer.from(built.sealed.body));
		this.protectedTags = [...built.tags, { name: 'Unix-Time', value: `${unixTime}` }];
	}
}

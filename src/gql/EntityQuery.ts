import { IEntity } from '../types/arfs_Types';
import { drivePrivacy, entityType } from '../types/type_guards';
import { Query, NODE_ID_AND_TAGS_PARAMETERS } from './Query';

export class EntityQuery<T extends IEntity> extends Query {
	constructor(args: {
		entityId?: string;
		entityType: entityType.DRIVE | entityType.FOLDER | entityType.FILE;
		owner?: string;
		lastBlockHeight?: number;
		privacy?: drivePrivacy.PRIVATE | drivePrivacy.PUBLIC;
		driveId?: string;
		extraParameters?: string[];
	}) {
		super();
		this.first = args.entityId ? 1 : 100;
		const tags = [{ name: 'Entity-Type', values: args.entityType }] as {
			name: string;
			values: string | string[];
		}[];
		if (args.entityId) {
			const tagName = `${args.entityType.toUpperCase()}-Id`;
			tags.push({ name: tagName, values: args.entityId });
		}
		if (args.privacy) {
			if (args.entityType === 'drive') {
				tags.push({ name: 'Drive-Privacy', values: args.privacy });
			} else if (['folder', 'file'].includes(args.entityType)) {
				if (args.privacy === 'private') {
					tags.push({ name: 'Content-Type', values: 'application/octet-stream' });
				} else {
					tags.push({ name: 'Content-Type', values: 'application/json' });
				}
			}
		}
		if (args.owner) {
			this.owners = [args.owner];
		}
		if (args.lastBlockHeight) {
			this.lastDriveBlockHeight = args.lastBlockHeight;
		}
		if (args.driveId && args.entityType !== 'drive') {
			tags.push({ name: 'Drive-Id', values: args.driveId });
		}
		this.parameters = NODE_ID_AND_TAGS_PARAMETERS;
		if (args.extraParameters) {
			this.parameters.push(...args.extraParameters);
		}
	}

	public async get(): Promise<T[]> {
		const entities = await this.getAll<T>();
		return entities;
	}
}

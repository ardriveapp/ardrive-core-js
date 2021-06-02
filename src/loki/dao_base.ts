import { Collection } from 'lokijs';

import { LokiAccessor } from './loki_accessor';

export class DaoBase<T> {
	_collection!: Collection;

	collectionName = 'sync';

	constructor(collectionName: string) {
		this.collectionName = collectionName;
		if (LokiAccessor.lokiDb.getCollection(collectionName) == null) {
			LokiAccessor.lokiDb.addCollection(collectionName);
		}
		this._collection = LokiAccessor.lokiDb.getCollection(collectionName);
	}

	saveObjectsToCollection(objects: T[]): void {
		this._collection.insert(objects);
	}

	getAllObjectsFromCollection(): T[] {
		return this._collection.data;
	}
}

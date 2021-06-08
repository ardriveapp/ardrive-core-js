import { Collection } from 'lokijs';

import { LokiAccessor } from './loki_accessor';

export class DaoBase<T> {
	collection!: Collection;

	collectionName = 'sync'; //Just a default collection name

	constructor(collectionName: string) {
		this.collectionName = collectionName;
		if (LokiAccessor.lokiDb.getCollection(collectionName) == null) {
			LokiAccessor.lokiDb.addCollection(collectionName);
		}
		this.collection = LokiAccessor.lokiDb.getCollection(collectionName);
	}

	saveObjectsToCollection(objects: T[]): void {
		this.collection.insert(objects);
	}

	getAllObjectsFromCollection(): T[] {
		return this.collection.data.map((e) => e as T);
	}
}

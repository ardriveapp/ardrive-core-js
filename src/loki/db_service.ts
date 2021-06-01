import { Collection } from 'lokijs';

import { LokiService } from './loki_service';

export class DbService<T> {
	_collection!: Collection;

	collectionName = 'sync';

	constructor(collectionName: string) {
		this.collectionName = collectionName;
		if (LokiService.lokiDb.getCollection(collectionName) == null) {
			LokiService.lokiDb.addCollection(collectionName);
		}
		this._collection = LokiService.lokiDb.getCollection(collectionName);
	}

	saveObjectsToCollection(objects: T[]): void {
		this._collection.insert(objects);
	}

	getAllObjectsFromCollection(): T[] {
		return this._collection.data;
	}
}

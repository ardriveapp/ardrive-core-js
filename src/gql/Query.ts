import * as common from '../common';
import * as gqlTypes from '../types/gql_Types';
import Arweave from 'arweave';
import { AxiosResponse } from 'axios';

const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Our primary GQL url
// export const primaryGraphQLURL = `${common.gatewayURL}graphql`;
// export const backupGraphQLURL = 'https://arweave.dev/graphql';
export const primaryGraphQLURL = `https://gateway.amplify.host/graphql`;
export const backupGraphQLURL = 'http://gateway.ardrive.io/graphql';

function tagToAttributeMap(tag: string): string {
	// tag to camel case
	const words = tag.split('-');
	const attribute = words.join('');
	return `${attribute.charAt(0).toLowerCase()}${attribute.slice(1)}`;
}

const QUERY_ARGUMENTS_WHITELIST = [
	'edges',
	'edges.node',
	'edges.node.id',
	'edges.node.tags',
	'edges.node.tags.name',
	'edges.node.tags.value',
	'edges.node.block',
	'edges.node.block.timestamp',
	'edges.node.block.height',
	'pageInfo',
	'pageInfo.hasNextPage'
];

export class Query {
	private _hasRan = false;
	private _parameters: string[] = ['edges.node.id'];
	private edges: gqlTypes.GQLEdgeInterface[] = [];
	private hasNextPage = true;
	private cursor = '';
	private triesCount = 0;
	private MAX_TRIES_COUNT = 5;
	private gqlUrl = primaryGraphQLURL;

	public ids?: string[];
	public owners?: string[];
	public tags?: { name: string; values: string | string[] }[];
	public first?: number;
	public lastDriveBlockHeight?: number;

	private get parsedIds(): string | false {
		return !!this.ids && serializedArray(this.ids, serializedString);
	}

	private get parsedOwners(): string | false {
		return !!this.owners && serializedArray(this.owners, serializedString);
	}

	private get parsedTags(): string | false {
		const tags = this.tags?.map((tag) => {
			const parsedValue = Array.isArray(tag.values)
				? serializedArray(tag.values, serializedString)
				: serializedString(tag.values);
			return { name: tag.name, value: parsedValue };
		});
		return !!tags && serializedArray(tags, serializedObject);
	}

	private get parsedFirst(): string | false {
		return !!this.first && serializedNumber(this.first);
	}

	private get parsedBlock(): string | false {
		if (this.lastDriveBlockHeight) {
			const min = this.lastDriveBlockHeight > 5 ? this.lastDriveBlockHeight - 5 : this.lastDriveBlockHeight;
			const block = serializedObject({ min });
			return serializedObject(block);
		}
		return false;
	}

	private get parsedAfter(): string | false {
		return !!this.cursor && serializedString(this.cursor);
	}

	set parameters(parameters: string[]) {
		if (!this._validateArguments(parameters)) {
			throw new Error('Invalid parameters.');
		}
		this._parameters = parameters;
	}

	private _validateArguments(argument: string[]) {
		const isValid = argument.reduce((valid: boolean, arg: string): boolean => {
			return valid && QUERY_ARGUMENTS_WHITELIST.includes(arg);
		}, true);
		return isValid;
	}

	public getAll = async <T>(): Promise<T[]> => {
		await this._run();
		const entities: T[] = [];
		this.edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const entity: any = {};
			entity.txId = node.id;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const { name, value } = tag;
				const attributeName = tagToAttributeMap(name);
				if (attributeName === 'unixTime') {
					entity[attributeName] = Number(value);
				} else {
					entity[attributeName] = value;
				}
			});
			entities.push(entity);
		});
		return entities.map((e) => <T>e);
	};

	public getRaw = async (): Promise<gqlTypes.GQLEdgeInterface[]> => {
		await this._run();
		return this.edges;
	};

	private _run = async (): Promise<void> => {
		if (this._hasRan) return;
		const query = this._getQueryString();
		this.triesCount = 0;
		this.hasNextPage = true;
		while (this.hasNextPage) {
			const response = await arweave.api.post(this.gqlUrl, query).catch(this._handleError);
			if (response) {
				this._handleResponse(response);
			}
		}
		this._hasRan = true;
	};

	private _handleError = (): false => {
		if (this.triesCount === this.MAX_TRIES_COUNT) {
			console.info(
				`The primary GQL server has failed ${this.MAX_TRIES_COUNT} times, will now try the backup server`
			);
			this.gqlUrl = backupGraphQLURL;
		} else if (this.triesCount === this.MAX_TRIES_COUNT * 2) {
			throw new Error('Max tries exceeded');
		}
		this.triesCount++;
		common.sleep(50); // Sleep a few ms here to avoid overusing network resources
		return false;
	};

	private _handleResponse = (response: AxiosResponse): void => {
		const { data } = response.data;
		const { transactions } = data;
		if (transactions.edges && transactions.edges.length) {
			const edges = Array.from(transactions.edges) as gqlTypes.GQLEdgeInterface[];
			const lastEdge = edges[edges.length - 1];
			this.edges = this.edges.concat(edges);
			this.cursor = lastEdge.cursor;
		}
		this.hasNextPage = this._parameters.includes('pageInfo.hasNextPage') && transactions.pageInfo.hasNextPage;
	};

	private _getQueryString = () => {
		const serializedTransactionData = this._getSerializedTransactionData();
		const serializedQueryParameters = this._getSerializedParameters();
		return JSON.stringify(`query {\ntransactions(\n${serializedTransactionData}) ${serializedQueryParameters}\n}`);
	};

	private _getSerializedTransactionData = (): string => {
		const data: { [key: string]: string | false } = {
			ids: this.parsedIds,
			owners: this.parsedOwners,
			tags: this.parsedTags,
			block: this.parsedBlock,
			first: this.parsedFirst,
			after: this.parsedAfter
		};
		const dataKeys = Object.keys(data).filter((key) => typeof data[key] === 'string');
		const serializedData = dataKeys.map((key) => `${key}: ${data[key]}`).join('\n');
		return serializedData;
	};

	private _getSerializedParameters = (params: any = this._getParametersObject(), depht = 0): string => {
		const paramKeys = Object.keys(params);
		let serializedParameters = '';
		if (paramKeys.length > 0) {
			serializedParameters = paramKeys
				.map((key): string => {
					const value = params[key];
					const valueChildrenKeys = Object.keys(value);
					if (valueChildrenKeys.length > 0) {
						return `${key} {${this._getSerializedParameters(value, depht + 1)}}`;
					} else {
						return `${key}`;
					}
				})
				.join('\n');
		}
		if (depht === 0 && serializedParameters) {
			serializedParameters = `{\n${serializedParameters}\n}`;
		}
		return serializedParameters;
	};

	private _getParametersObject = (): { [key: string]: any } => {
		const normalizedParameters: any = this._parameters.reduce(
			(params: any, path: string): any => pathToObjectAttributes(path, Object.assign({}, params)),
			{}
		);
		return normalizedParameters;
	};
}

function pathToObjectAttributes(path: string, object: any = {}): any {
	const nodes = path.split('.');
	let pointerObject = object;
	nodes.forEach((propertyName) => {
		if (!pointerObject[propertyName]) {
			pointerObject[propertyName] = {};
		}
		pointerObject = pointerObject[propertyName];
	});
	return object;
}

function serializedNumber(n: number) {
	return serializedRaw(n);
}

function serializedRaw(r: any): string {
	return `${r}`;
}

function serializedString(s: string): string {
	return `"${s}"`;
}

function serializedObject(o: any): string {
	return JSON.stringify(o);
}

function serializedArray<T>(a: T[], serializeItem: (i: T) => string) {
	const serialized = a.map(serializeItem).join('\n');
	return `[\n${serialized}\n]`;
}

export const NODE_ID_AND_TAGS_PARAMETERS = ['edges.node.id', 'edges.node.tags.name', 'edges.node.tags.value'];

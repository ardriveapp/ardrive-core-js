// Arweave GraphQL Interfaces
// These are commonly used in other Arweave applications.  For more information on graphQL see the following link https://gql-guide.vercel.app/
export interface GQLPageInfoInterface {
	hasNextPage: boolean;
}

// Used to determine who the owner/subittor of a transaction.
export interface GQLOwnerInterface {
	address: string;
	key: string;
}

// Payment-related data, like the mining fee, the amount paid for the transaction, who received the AR ("0" for data-only transactions), as well as the address that intially sent the AR.
// This is also reused for the Quantity object for each GQLNodeInterface
export interface GQLAmountInterface {
	winston: string;
	ar: string;
}

// Relates to the data of the underlying transaction, like its size and content type.
export interface GQLMetaDataInterface {
	size: number;
	type: string;
}

// Used to access the tags embedded in a given Arweave transaction. You can retrieve both the tag name and the value as an array.
export interface GQLTagInterface {
	name: string;
	value: string;
}

// Details specific to a transaction's block. Used to retrieve its block number, mining date, block hash, and the previous block hash.
export interface GQLBlockInterface {
	id: string;
	timestamp: number;
	height: number;
	previous: string;
}

// the full Graphql structure that can be returned for a given item in a query
export interface GQLNodeInterface {
	id: string;
	anchor: string;
	signature: string;
	recipient: string;
	owner: GQLOwnerInterface;
	fee: GQLAmountInterface;
	quantity: GQLAmountInterface; // reuse the amount interface since the values are the same
	data: GQLMetaDataInterface;
	tags: GQLTagInterface[];
	block: GQLBlockInterface;
	parent: {
		id: string;
	};
}

// The array of objects returned by a graphql query, including cursor which is used for result pagination.
// There are three components to paginatiion queries.
// First, when retrieving the GraphQL object, always make sure to retrieve the cursor. The cursor is used in queries to traverse to the next page.
// Second, specify the amount of elements to output by using the "first" key. When "first" is 5, the result set will include 5 transactions.
// And finally, specify the "after" string (i.e. the "cursor" from the previous page) to fetch the subsequent page.
export interface GQLEdgeInterface {
	cursor: string;
	node: GQLNodeInterface;
}

// The object structure returned by any graphql queru
export interface GQLTransactionsResultInterface {
	pageInfo: GQLPageInfoInterface;
	edges: GQLEdgeInterface[];
}

export default interface GQLResultInterface {
	data: {
		transactions: GQLTransactionsResultInterface;
	};
}

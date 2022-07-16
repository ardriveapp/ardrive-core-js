/// <reference types="node" />
import { BundleItem } from "./BundleItem";
import Arweave from "arweave";
import Transaction from "arweave/node/lib/transaction";
import { JWKInterface } from "./interface-jwk";
declare type ResolvesTo<T> = T | Promise<T> | ((...args: any[]) => Promise<T>);
export interface BundleInterface {
    readonly length: ResolvesTo<number>;
    readonly items: BundleItem[] | AsyncGenerator<BundleItem>;
    get(index: number | string): BundleItem | Promise<BundleItem>;
    getIds(): string[] | Promise<string[]>;
    getRaw(): ResolvesTo<Buffer>;
    toTransaction(arweave: Arweave, jwk: JWKInterface): Promise<Transaction>;
}
export {};

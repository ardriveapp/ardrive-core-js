import { Signer } from "./Signer";
interface IndexToType {
    [key: number]: {
        new (...args: any[]): Signer;
        readonly signatureLength: number;
        readonly ownerLength: number;
        verify(pk: string | Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
    };
}
export declare const indexToType: IndexToType;
export {};

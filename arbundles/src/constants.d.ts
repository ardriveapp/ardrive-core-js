export declare enum SignatureConfig {
    ARWEAVE = 1,
    ED25519 = 2,
    ETHERIUM = 3
}
interface SignatureMeta {
    sigLength: number;
    pubLength: number;
}
export declare const SIG_CONFIG: Record<SignatureConfig, SignatureMeta>;
export {};

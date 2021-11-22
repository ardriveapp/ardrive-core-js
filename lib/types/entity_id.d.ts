import { Equatable } from './equatable';
export declare class EntityID implements Equatable<EntityID> {
    protected entityId: string;
    constructor(entityId: string);
    [Symbol.toPrimitive](hint?: string): string;
    toString(): string;
    valueOf(): string;
    equals(entityId: EntityID): boolean;
    toJSON(): string;
}
export declare function EID(entityId: string): EntityID;

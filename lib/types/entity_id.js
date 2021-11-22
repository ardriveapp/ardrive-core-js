"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EID = exports.EntityID = void 0;
// RFC 4122 Section 3 requires that the characters be generated in lower case, while being case-insensitive on input.
const entityIdRegex = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
class EntityID {
    constructor(entityId) {
        this.entityId = entityId;
        if (!entityId.match(entityIdRegex)) {
            throw new Error(`Invalid entity ID '${entityId}'!'`);
        }
    }
    [Symbol.toPrimitive](hint) {
        if (hint === 'number') {
            throw new Error('Entity IDs cannot be interpreted as a number!');
        }
        return this.toString();
    }
    toString() {
        return this.entityId;
    }
    valueOf() {
        return this.entityId;
    }
    equals(entityId) {
        return this.entityId === entityId.entityId;
    }
    toJSON() {
        return this.toString();
    }
}
exports.EntityID = EntityID;
function EID(entityId) {
    return new EntityID(entityId);
}
exports.EID = EID;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertOnConflicts = exports.replaceOnConflicts = exports.skipOnConflicts = exports.emptyArFSResult = void 0;
exports.emptyArFSResult = {
    created: [],
    tips: [],
    fees: {}
};
exports.skipOnConflicts = 'skip';
exports.replaceOnConflicts = 'replace';
exports.upsertOnConflicts = 'upsert';

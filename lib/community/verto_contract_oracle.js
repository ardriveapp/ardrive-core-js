"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VertoContractReader = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 *  Oracle class responsible for retrieving and
 *  reading Smartweave Contracts from the Verto cache
 */
class VertoContractReader {
    /** Fetches smartweave contracts from the Verto cache */
    readContract(txId) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.get(`https://v2.cache.verto.exchange/${txId}`);
            const contract = response.data;
            return contract.state;
        });
    }
}
exports.VertoContractReader = VertoContractReader;

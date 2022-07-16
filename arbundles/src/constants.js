"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIG_CONFIG = exports.SignatureConfig = void 0;
var SignatureConfig;
(function (SignatureConfig) {
	SignatureConfig[SignatureConfig["ARWEAVE"] = 1] = "ARWEAVE";
})(SignatureConfig = exports.SignatureConfig || (exports.SignatureConfig = {}));
exports.SIG_CONFIG = {
	// Arweave
	[SignatureConfig.ARWEAVE]: {
		sigLength: 512,
		pubLength: 512,
	}
};
//# sourceMappingURL=constants.js.map

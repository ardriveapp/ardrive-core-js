import { expect } from 'chai';
import { createHash, JsonWebKey } from 'node:crypto';
import { validateMnemonic } from 'bip39';
import { SeedPhrase } from '../types';
import { generateSeedPhraseMnemonic, rsaJwkFromMnemonic, seedFromMnemonic } from './seed_phrase_keys';

/**
 * Wallets made from these phrases by core-js 4.5.0, through the human-crypto-keys
 * fork it installed from git. The vendored derivation must reproduce every one of
 * them exactly: an ArDrive seed phrase is the only backup many wallets have.
 *
 * jwkSha256 hashes every JWK field (sorted [name, value] pairs), so it covers the
 * private key, not just the address.
 *
 * Key generation takes 10 to 60 seconds per phrase, so CI runs the first vector and
 * the publish workflow runs all of them (SEED_PHRASE_VECTORS=all).
 */
const vectors: { phrase: string; address: string; jwkSha256: string }[] = [
	{
		phrase: 'Zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
		address: 'tQ_CtNnFaWT18xQQ4kHtjr16lYmUUlEwO0sUvbjmb7A',
		jwkSha256: '3d8ac79af9ec626e334778f7ba949fd118ec53ec2ddf7c0e6af1e0ccc9712acc'
	},
	{
		phrase: 'slender during cost problem tortoise extra deal walnut great oblige planet kid',
		address: 'FOKCJ1sz9XfFGy8KwVQczDPdavCEu6c5GkzTNfEbRI8',
		jwkSha256: '70761bb3cd6d8ea7e94a93fd4817b56c55de0867324ca27ae2d2108a11e6f0f7'
	},
	{
		phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
		address: 'l55sI4sCbT9d9AV6WKz2DQpnW4Ld0EcBAZv-CMv_HAQ',
		jwkSha256: 'f64b617b8ac9246edb7845136f28dbec2cd0bddf266769df010fd7d264dc16ef'
	},
	{
		phrase: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
		address: '4gko33o-g-_iAJ-EaBQT_MX1m3GqW380z6Nz3HuszAk',
		jwkSha256: '6e09397acef827f14fa6c8950331dcef4b71d49fdc7b27e40c517ebd67f37197'
	},
	{
		phrase: 'random words that are not a valid checksum phrase at all here',
		address: 'QP3enhdEpRjHEoTSleta-6vXhpQMiTf71tEdd9GV6pw',
		jwkSha256: '91d5d0bb82e3087b33c4782240337bf4a07909f7d89717f36a0bdbe2b5db512e'
	},
	{
		phrase: 'café naïve résumé word word word word word word word word word',
		address: 'rqW9IU2vyYakBQeoyRV8zAamoLUCWz6p0oyjtX8Cr2g',
		jwkSha256: 'd2dcc58a6119412a8260be15a20c7690a67cdd3cc4d1248b624327d47d61e39c'
	},
	{
		phrase: 'ocean ocean ocean ocean ocean ocean ocean ocean ocean ocean ocean ocean',
		address: 'iqcJ1GJddq6MMgKf2jZ5f0dry4Op107wUy7m6CL0Mzw',
		jwkSha256: '01992797f95ddb7f47521f2fd5959ddfd28a23fb53f77938a05f98b7cfe0cd05'
	},
	{
		phrase: 'panda eyebrow bullet gorilla call smoke muffin taste mesh discover soft ostrich',
		address: 'plspKBGQjglQ6iogHQqoBBlXs4aMX5lBO-Ew2Jk08qg',
		jwkSha256: '4f5dab38bf83cd2c89fa9ab6e3e4aa53afb55edf03efc51fe70e0dc1f447d69e'
	},
	{
		phrase: 'tiny   spaces between   these words one two three four five six',
		address: 'Pk2ivMpciiz4cTNQMo3EYtqUJT8JFB6yWOD6ukU48TE',
		jwkSha256: '506ac1e61a4679b9d831505a030a54ac4b01a9f709353a8176f7c78608c805fd'
	},
	{
		phrase: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
		address: 'aBzigEAvxLtHTN9344q9WV3xJhsC2EnSUff8mO6NbPY',
		jwkSha256: 'e412f2d0dcd62e579092244bffdd1fffb965dca9a04fc4837383a52839a44c4f'
	},
	{
		phrase: 'vessel ladder alter error federal sibling chat ability sun glass valve picture',
		address: 'ZQzkS3SKytLO9tBbCJ53RCjm44Od5blnwF97KqNuVyk',
		jwkSha256: 'e06d384a2dc1993c9e80428b0ac8ce3de3ac57fca816c45350aa3290fc235466'
	}
];

function jwkSha256(jwk: JsonWebKey): string {
	const fields = Object.keys(jwk)
		.sort()
		.map((name) => [name, jwk[name as keyof JsonWebKey]]);
	return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

function arweaveAddress(jwk: JsonWebKey): string {
	return createHash('sha256')
		.update(Buffer.from(jwk.n as string, 'base64url'))
		.digest('base64url');
}

describe('seed phrase keys', () => {
	it('derives the standard BIP39 seed', async () => {
		const seed = await seedFromMnemonic(vectors[2].phrase);
		expect(Buffer.from(seed).toString('hex')).to.equal(
			'5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
				'9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
		);
	});

	it('generates a valid 12-word English mnemonic', () => {
		const mnemonic = generateSeedPhraseMnemonic();
		expect(mnemonic.split(' ')).to.have.length(12);
		expect(validateMnemonic(mnemonic)).to.be.true;
		expect(() => new SeedPhrase(mnemonic)).not.to.throw();
		expect(generateSeedPhraseMnemonic()).not.to.equal(mnemonic);
	});

	const all = process.env.SEED_PHRASE_VECTORS === 'all';
	for (const vector of all ? vectors : vectors.slice(0, 1)) {
		it(`reproduces the wallet for "${vector.phrase}"`, async function () {
			this.timeout(300_000);
			const jwk = await rsaJwkFromMnemonic(vector.phrase);
			expect(arweaveAddress(jwk)).to.equal(vector.address);
			expect(jwkSha256(jwk)).to.equal(vector.jwkSha256);
		});
	}
});

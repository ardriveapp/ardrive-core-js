/**
 * On-chain ArFS Drive State tag constants.
 *
 * These MUST match what ardrive-web writes (`drive_state_entity.dart`,
 * `addEntityTagsToTransaction`) and what docs.ar.io specifies for the
 * `drive-state` entity, or an artifact published by one client is invisible to
 * the other.
 */

/** Tag names carried by a Drive State transaction. */
export const DriveStateTagName = {
	arFS: 'ArFS',
	entityType: 'Entity-Type',
	driveId: 'Drive-Id',
	driveStateId: 'Drive-State-Id',
	stateVersion: 'State-Version',
	contentType: 'Content-Type',
	blockStart: 'Block-Start',
	blockEnd: 'Block-End',
	dataStart: 'Data-Start',
	dataEnd: 'Data-End',
	entityCount: 'Entity-Count',
	cipher: 'Cipher',
	cipherIV: 'Cipher-IV'
} as const;

/** The `Entity-Type` tag value that identifies a Drive State transaction. */
export const DRIVE_STATE_ENTITY_TYPE = 'drive-state';

/**
 * The `Content-Type` of every Drive State body. Never paired with a
 * `Content-Encoding` tag: gateways echo that tag as an HTTP header, and an HTTP
 * client then inflates the body before the reader can bound it.
 */
export const DRIVE_STATE_CONTENT_TYPE = 'application/octet-stream';

/** The only cipher a Drive State body is sealed with. */
export const DRIVE_STATE_CIPHER = 'AES256-GCM';

/**
 * The SQLite `application_id` every artifact carries in its header: `ArDS` in
 * ASCII.
 */
export const DRIVE_STATE_APPLICATION_ID = 0x41724453;

/**
 * The most plaintext (the SQLite file) a reader inflates, and the bound a
 * producer stays under: a producer refuses a payload of this size or more, a
 * reader refuses one larger than it. One number for every producer and reader.
 */
export const DRIVE_STATE_MAX_PLAINTEXT_BYTES = 100 * 1024 * 1024;

/**
 * How far below an artifact's `Block-End` a reader starts its later sources.
 * `Block-End` is the producer's block height when it last synced, and an entity
 * mined just below it but indexed later is in no artifact. Matches ardrive-web
 * and core-js's own incremental sync look-back.
 */
export const DRIVE_STATE_LOOK_BACK_BLOCKS = 240;

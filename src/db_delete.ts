import { run } from './db';

////////////////////////
// DELETING FUNCTIONS //
////////////////////////
// Same as remove from sync table.  which to remove?
export const deleteFromSyncTable = (id: number) => {
	return run(`DELETE FROM Sync WHERE id = ?`, [id]);
};

// Same as delete from sync table.  which to remove?
export const removeFromSyncTable = (id: number) => {
	return run(`DELETE FROM Sync WHERE id = ?`, [id]);
};

// Deletes a file from the Sync table based on driveID
export const removeByDriveIdFromSyncTable = (id: string) => {
	return run(`DELETE FROM Sync WHERE driveId = ?`, [id]);
};

// Deletes a profile based on login
export const removeFromProfileTable = (login: string) => {
	return run(`DELETE FROM Profile WHERE login = ?`, [login]);
};

// Deletes a drive based on the drive ID
export const removeFromDriveTable = (driveId: string) => {
	return run(`DELETE FROM Drive WHERE driveId = ?`, [driveId]);
};

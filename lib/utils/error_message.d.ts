import { FolderID } from '../types';
export declare const errorMessage: {
    entityNameExists: string;
    cannotMoveToDifferentDrive: string;
    cannotMoveParentIntoChildFolder: string;
    folderCannotMoveIntoItself: string;
    cannotMoveIntoSamePlace: (type: 'File' | 'Folder', parentFolderId: FolderID) => string;
};

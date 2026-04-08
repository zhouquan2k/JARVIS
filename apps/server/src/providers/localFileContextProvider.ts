import {
    FileSystemContextProvider,
    type FileSystemContextProviderOptions
} from '../../../../packages/node/src/context/FileSystemContextProvider.ts';

export type LocalFileContextProviderOptions = FileSystemContextProviderOptions;

export class LocalFileContextProvider extends FileSystemContextProvider {}

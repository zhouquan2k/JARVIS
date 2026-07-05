import { IpcContextProvider } from './IpcContextProvider';

export function createDesktop2ContextProvider() {
    return new IpcContextProvider();
}

import { ipcMain } from 'electron';
import {
    DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL,
    DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL,
    type BrowserAutomationCookieRequest,
    type BrowserAutomationFetchRequest,
    type BrowserAutomationFetchResponse
} from '../shared/browserAutomationBridge';
import { getProviderSession } from './sessionManager';

export function registerBrowserAutomationIpc(): () => void {
    ipcMain.handle(
        DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL,
        async (_event, request: BrowserAutomationFetchRequest): Promise<BrowserAutomationFetchResponse> => {
            const session = getProviderSession(request.providerId);
            const response = await session.fetch(request.input, request.init);

            return {
                status: response.status,
                statusText: response.statusText,
                headers: Array.from(response.headers.entries()),
                bodyText: await response.text()
            };
        }
    );

    ipcMain.handle(
        DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL,
        async (_event, request: BrowserAutomationCookieRequest) => {
            const session = getProviderSession(request.providerId);
            const cookies = await session.cookies.get({
                url: request.url,
                name: request.name
            });
            const matched = cookies[0];
            return matched ? { value: matched.value } : null;
        }
    );

    return () => {
        ipcMain.removeHandler(DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL);
        ipcMain.removeHandler(DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL);
    };
}

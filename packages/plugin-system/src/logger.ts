export interface PluginLogger {
    error(message: string, error: unknown): void;
}

export const consolePluginLogger: PluginLogger = {
    error(message: string, error: unknown) {
        console.error(message, error);
    }
};

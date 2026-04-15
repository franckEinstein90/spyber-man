import { ScrapperStatus } from "./SpyberMan";


export interface ProcessEventsOptions {
    scrapperStatus: ScrapperStatus;
}

export const processEvents = async (options: ProcessEventsOptions): Promise<void> => {
    return;
} 
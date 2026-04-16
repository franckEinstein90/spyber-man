export interface ComputeEnv{

    os: {
        platform: NodeJS.Platform;
        release: string;
        arch: string;
        hostname: string;
        uptimeSeconds: number;
    };
    cpu: {
        model: string;
        cores: number;
        speedMhz: number;
        loadAverage: number[];
    };
    memory: {
        totalBytes: number;
        freeBytes: number;
    };
    gpu: {
        count: number;
        names: string[];
        detectionMethod: string;
    };
}
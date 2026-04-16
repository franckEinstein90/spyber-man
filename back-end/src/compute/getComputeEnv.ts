import { execSync } from "child_process";
import { ComputeEnv } from "./models";
import os from "os";


export const detectGpuNames = (): { names: string[]; detectionMethod: string } =>{
    try {
        const nvidiaSmi = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        if (nvidiaSmi.length > 0) {
            return { names: nvidiaSmi, detectionMethod: 'nvidia-smi' };
        }
    } catch {
        // Fall through to other detection methods.
    }

    try {
        if (os.platform() === 'linux') {
            const lspciOutput = execSync('lspci', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            })
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => /VGA|3D|Display/i.test(line));

            if (lspciOutput.length > 0) {
                return { names: lspciOutput, detectionMethod: 'lspci' };
            }
        }
    } catch {
        // No GPU info detected.
    }

    return { names: [], detectionMethod: 'none' };
}

export const getComputeEnv = async (): Promise<ComputeEnv> => {
    const cpuInfo = os.cpus();
    const gpuInfo = detectGpuNames();

    const computeEnvironment: ComputeEnv = {
    os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptimeSeconds: os.uptime(),
    },
    cpu: {
        model: cpuInfo[0]?.model ?? 'unknown',
        cores: cpuInfo.length,
        speedMhz: cpuInfo[0]?.speed ?? 0,
        loadAverage: os.loadavg(),
    },
    memory: {
        totalBytes: os.totalmem(),
        freeBytes: os.freemem(),
    },
    gpu: {
        count: gpuInfo.names.length,
        names: gpuInfo.names,
        detectionMethod: gpuInfo.detectionMethod,
    },
    };

    return computeEnvironment;
};

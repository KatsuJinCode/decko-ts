export function keepScratch(): boolean;
export function scratchDir(prefix: string): string;
export function removeScratchDir(dir: string): void;
export function cleanupScratch(): void;
export function registeredScratch(): string[];

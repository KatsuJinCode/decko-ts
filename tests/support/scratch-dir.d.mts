export const SCRATCH_OWNERSHIP_FILE: string;
export function scratchRoot(): string;
export function writeScratchOwnershipManifest(dir: string): void;
export function scratchOwnershipMatches(dir: string): boolean;
export function keepScratch(): boolean;
export function scratchDir(prefix: string): string;
export function removeScratchDir(dir: string): void;
export function cleanupScratch(): void;
export function registeredScratch(): string[];

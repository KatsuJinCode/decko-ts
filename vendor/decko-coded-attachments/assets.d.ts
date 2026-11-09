export type CodedAssetMap = Readonly<Record<string, {codename: string; extension: string; versions: Readonly<Record<string, {base64: string; sha256: string}>>}>>;
export const svgAssets: CodedAssetMap;
export const assets: CodedAssetMap;

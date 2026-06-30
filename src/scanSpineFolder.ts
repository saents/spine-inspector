import { readdirSync } from 'fs';

export type SpineFolderManifest = {
  atlas: string;
  spines: string[];
};

export function scanSpineFolder(folderPath: string): SpineFolderManifest | null {
  const files = readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  let atlas = '';
  const spines: string[] = [];

  for (const file of files) {
    const dot = file.lastIndexOf('.');
    if (dot === -1) {
      continue;
    }
    const name = file.slice(0, dot);
    const ext = file.slice(dot + 1);
    if (ext === 'atlas') {
      atlas = name;
    }
    if (ext === 'json') {
      spines.push(name);
    }
  }

  if (!atlas || spines.length === 0) {
    return null;
  }

  return { atlas, spines };
}

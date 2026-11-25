/** Wording for a dropped file. Rust reads the files (JS never sees paths); this only turns its summary into a line. */
export interface DropInfo {
  count: number;
  /** Name of the first item. */
  name: string;
  /** Lowercase extension of the first item, "folder", or "" when it has none. */
  kind: string;
  /** Total size in bytes of everything dropped (folders summed, capped in Rust). */
  bytes: number;
}

export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const KINDS: Record<string, string> = {
  pdf: 'PDF', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', svg: 'image',
  doc: 'Word doc', docx: 'Word doc', xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', ppt: 'slide deck', pptx: 'slide deck',
  txt: 'text file', md: 'text file', mp3: 'song', wav: 'audio file', m4a: 'audio file', mp4: 'video', mov: 'video', mkv: 'video',
  zip: 'zip', key: 'slide deck', pages: 'document', numbers: 'spreadsheet',
};

export function kindWord(kind: string): string {
  if (kind === 'folder') return 'folder';
  return KINDS[kind] ?? (kind ? `${kind.toUpperCase()} file` : 'file');
}

/** The article goes before the size, read aloud: "an 8 MB", "an 11 KB", "an 80 KB", "a 90 KB". */
const article = (size: string) => (/^(8|11|18)/.test(size) ? 'an' : 'a');

/** "Ooh, a 2.4 MB PDF. Want me to zip it?" */
export function dropLine(d: DropInfo): string {
  if (d.count > 1) return `Ooh, ${d.count} things, ${formatSize(d.bytes)} in all. Want me to zip them up?`;
  const w = kindWord(d.kind);
  if (d.kind === 'folder') return `Ooh, a folder called ${shortName(d.name)} (${formatSize(d.bytes)}). Want me to zip it?`;
  const size = formatSize(d.bytes);
  return `Ooh, ${article(size)} ${size} ${w}. Want me to zip it?`;
}

export function shortName(n: string, max = 28): string {
  return n.length <= max ? n : `${n.slice(0, max - 1)}…`;
}

import fs from "fs";
import path from "path";

export function getAllFilesRecursive(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of list) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) results = results.concat(getAllFilesRecursive(fullPath, baseDir));
      else results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  } catch {}
  return results;
}

export function getDirectFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
  } catch { return []; }
}

/** Extracts YYYY-MM-DD from filename like @user_caption_type_2024-09-23_03-00-43_SHORTCODE.ext */
export function extractDateFromFilename(filename: string): string {
  const m = path.basename(filename).match(/(\d{4}-\d{2}-\d{2})_\d{2}-\d{2}-\d{2}/);
  return m ? m[1] : "";
}

/** Extracts post ID (Instagram shortcode or TikTok 15+ digit ID) from a filename. */
export function extractPostId(filename: string): string | null {
  const base = path.basename(filename).replace(/\s*\(\d+\)(\.[^.]+)$/, '$1');
  const noExt = base.replace(/\.[^.]+$/, '');

  // Priority 1: TikTok — 15+ digits anywhere in filename (surrounded by _ or start/end)
  const tikMatch = noExt.match(/(?:^|_)(\d{15,})(?:_|$)/);
  if (tikMatch) return tikMatch[1];

  // Priority 2: Instagram — last _-segment that isn't a common file-type word
  const TYPE_WORDS = new Set(['meta','caption','comments','thumbs','reels','audio','video',
    'cover','item','img','thumb','report','avatar','pfp','profile','saved','rawmeta',
    'masterreport','carousel','image','photo','part']);
  const parts = noExt.split('_');
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!last || last.length < 4 || !/[a-zA-Z0-9]/.test(last)) return null;
  if (TYPE_WORDS.has(last.toLowerCase())) return null;
  return last;
}

/** Groups files by their post ID */
export function groupFilesByPostId(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    if (!/\.(json|txt|mp4|jpg|jpeg|png|csv)$/i.test(f)) continue;
    const pid = extractPostId(f);
    if (!pid) continue;
    if (!groups.has(pid)) groups.set(pid, []);
    groups.get(pid)!.push(f);
  }
  return groups;
}

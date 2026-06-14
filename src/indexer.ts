import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getDirectFiles, groupFilesByPostId, extractDateFromFilename, extractPostId } from "./fileUtils";

const DB_FILE = "vault.db";
const PROGRESS_FILE = "scan_progress.json";

// ─── Category rules ───────────────────────────────────────────
const CATEGORY_RULES: Record<string, string[]> = {
  gym:       ["gym","gymrat","workout","fitness","gains","lift","bodybuilding","physique","exercise","protein"],
  car_edit:  ["car","cars","auto","bmw","mercedes","audi","ferrari","lambo","supercar","drift","exhaust","v8","jdm","turbo"],
  anime:     ["anime","animeedit","otaku","naruto","onepiece","manga","weeb","goku","demon","jujutsu","aot"],
  couple:    ["couple","couples","love","bf","gf","boyfriend","girlfriend","relationship","bae","husband","wife"],
  dance:     ["dance","dancing","choreography","dancer","moves","twerk","reel","transition"],
  meme:      ["meme","funny","lol","lmao","comedy","humor","joke","trending","viral","skit"],
  looksmax:  ["looksmaxxing","looksmax","glow","glowup","skincare","haircut","sigma","rizz","alpha","nofap"],
  movie_edit:["movie","film","edit","cinematic","scene","series","netflix","marvel","dc","trailer"],
  music:     ["song","music","singing","vocal","cover","acoustic","beat","rap","kpop","punjabi","hindi"],
  aesthetic: ["aesthetic","dark","moody","vibes","vibe","chill","lofi","ambience","minimal"],
  fashion:   ["outfit","ootd","fashion","style","clothes","drip","fit","lookbook","saree","dress"],
  travel:    ["travel","explore","adventure","nature","mountains","beach","wanderlust","trip","vlog"],
  food:      ["food","recipe","cooking","eat","delicious","tasty","chef","kitchen"],
  gaming:    ["gaming","game","gamer","fps","minecraft","valorant","cod","fortnite","pubg"],
  motivation:["motivation","motivational","success","grind","hustle","mindset","discipline","hardwork"],
};

function autoCategorize(text: string) {
  const low = text.toLowerCase();
  const words = low.match(/\w+/g) || [];
  const matched = Object.entries(CATEGORY_RULES)
    .filter(([, kws]) => kws.some(kw => words.includes(kw) || low.includes(kw)))
    .map(([cat]) => cat);
  return matched.length ? matched : ["uncategorized"];
}
function extractTags(text: string) {
  return Array.from(new Set((text.toLowerCase().match(/#(\w+)/g) || []).map(m => m.slice(1))));
}

// ─── DB setup ─────────────────────────────────────────────────
function createDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id       TEXT UNIQUE,
      platform      TEXT,
      username      TEXT,
      nickname      TEXT,
      caption       TEXT,
      hashtags      TEXT,
      likes         INTEGER DEFAULT 0,
      views         INTEGER DEFAULT 0,
      comments      INTEGER DEFAULT 0,
      music_title   TEXT,
      music_author  TEXT,
      categories    TEXT,
      tags          TEXT,
      has_video     INTEGER DEFAULT 0,
      has_thumbnail INTEGER DEFAULT 0,
      is_carousel   INTEGER DEFAULT 0,
      video_path    TEXT,
      thumb_path    TEXT,
      folder_path   TEXT,
      post_date     TEXT DEFAULT '',
      source_file   TEXT DEFAULT '',
      scraped_date  TEXT,
      indexed_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_platform   ON posts(platform);
    CREATE INDEX IF NOT EXISTS idx_username   ON posts(username);
    CREATE INDEX IF NOT EXISTS idx_categories ON posts(categories);
    CREATE INDEX IF NOT EXISTS idx_post_date  ON posts(post_date);
    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      post_id, username, caption, hashtags, categories, tags, music_title,
      content='posts', content_rowid='id'
    );
    CREATE TABLE IF NOT EXISTS scan_status (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  // Add new columns to existing DBs safely
  for (const col of ["post_date TEXT DEFAULT ''", "source_file TEXT DEFAULT ''"]) {
    try { db.exec(`ALTER TABLE posts ADD COLUMN ${col}`); } catch {}
  }
}

// ─── File walkers ──────────────────────────────────────────────
function* walkAll(dir: string): Generator<string> {
  yield dir;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) yield* walkAll(path.join(dir, e.name));
    }
  } catch {}
}

// ─── Date extraction from filenames ──────────────────────────
function extractDate(groupFiles: string[], dir: string): string {
  for (const f of groupFiles) {
    const d = extractDateFromFilename(f);
    if (d) return d;
  }
  return "";
}

// ─── Platform detection ───────────────────────────────────────
function detectPlatform(dir: string, postId: string, files: string[]): string {
  if (/^\d{15,}$/.test(postId)) return "tiktok";
  if (files.some(f => f.includes("_reels_") || f.includes("_thumbs_"))) return "instagram";
  const metaFile = files.find(f => f.includes("_meta_") && f.endsWith(".json") && !f.includes("audio_meta"));
  if (metaFile) {
    try {
      const c = fs.readFileSync(path.join(dir, metaFile), "utf-8").slice(0, 300);
      if (c.includes("shortcode") || c.includes("edge_media")) return "instagram";
      if (c.includes("diggCount") || c.includes("playCount")) return "tiktok";
    } catch {}
  }
  return "instagram";
}

// ─── Instagram parser ─────────────────────────────────────────
function parseInstaPost(dir: string, postId: string, groupFiles: string[]) {
  const files = groupFiles;
  const metaFile    = files.find(f => f.includes("_meta_") && f.endsWith(".json") && !f.includes("audio_meta"));
  const captionFile = files.find(f => f.includes("_caption_") && f.endsWith(".txt"));
  const audioFile   = files.find(f => f.includes("_audio_meta_") && f.endsWith(".json"));
  let thumbFile     = files.find(f => f.includes("_thumbs_") && f.endsWith(".jpg")) || files.find(f => f.endsWith(".jpg") && !f.includes("avatar"));
  let videoFile     = files.find(f => f.includes("_reels_") && f.endsWith(".mp4"))  || files.find(f => f.endsWith(".mp4"));

  if (!metaFile) return null;
  let meta: any;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, metaFile), "utf-8")); } catch { return null; }

  let caption = "", likes = 0, plays = 0;
  if (captionFile) {
    try {
      const raw = fs.readFileSync(path.join(dir, captionFile), "utf-8");
      caption = raw.includes("📝 CAPTION:") ? raw.split("📝 CAPTION:")[1].replace(/=+/g, "").trim() : raw.trim();
      for (const line of raw.split("\n")) {
        if (line.includes("❤️") && line.includes("Likes")) { const m = line.split(":").pop()?.match(/[\d,]+/); if (m) likes = parseInt(m[0].replace(/,/g, "")); }
        if (line.includes("▶️") && line.includes("Plays")) { const m = line.split(":").pop()?.match(/[\d,]+/); if (m) plays = parseInt(m[0].replace(/,/g, "")); }
      }
    } catch {}
  }
  if (likes === 0) likes = parseInt(meta?.edge_media_preview_like?.count || 0);
  if (plays === 0) plays = parseInt(meta?.video_view_count || meta?.video_play_count || 0);

  const username  = meta?.owner?.username || "unknown";
  const shortcode = meta?.shortcode || postId;
  const hashtags  = caption.match(/#\w+/g) || [];
  let musicTitle = "", musicAuthor = "";
  if (audioFile) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(dir, audioFile), "utf-8"));
      musicTitle = a.title || ""; musicAuthor = typeof a.ig_artist === "object" ? a.ig_artist?.username || "" : "";
    } catch {}
  }

  return {
    post_id: shortcode, platform: "instagram", username, nickname: username,
    caption: caption.trim(), hashtags: JSON.stringify(hashtags), likes, views: plays, comments: 0,
    music_title: musicTitle, music_author: musicAuthor,
    categories: JSON.stringify(autoCategorize(`${caption} ${hashtags.join(" ")} ${musicTitle}`)),
    tags: JSON.stringify(extractTags(caption)),
    has_video: videoFile ? 1 : 0, has_thumbnail: thumbFile ? 1 : 0,
    is_carousel: files.some(f => f.includes("_item")) ? 1 : 0,
    video_path: videoFile ? path.join(dir, videoFile) : "",
    thumb_path: thumbFile ? path.join(dir, thumbFile) : "",
    folder_path: dir,
    post_date:   extractDate(files, dir),
    source_file: metaFile,
    scraped_date: "", indexed_at: new Date().toISOString(),
  };
}

// ─── TikTok parser ────────────────────────────────────────────
function parseTiktokPost(dir: string, postId: string, groupFiles: string[]) {
  const files = groupFiles;
  const metaFile =
    files.find(f => f.includes("_meta_") && f.endsWith(".json") && !f.includes("RAW") && !f.includes("audio")) ||
    files.find(f => /^meta\.json$/i.test(f)) ||
    files.find(f => /^info\.json$/i.test(f)) ||
    files.find(f => f.endsWith(".json") && !/caption|comment|audio|raw|report/i.test(f));
  const captionFile = files.find(f => f.includes("_caption_") && f.endsWith(".json")) || files.find(f => /^caption\.json$/i.test(f));
  const videoFile   = files.find(f => f.endsWith(".mp4"));
  let thumbFile     = files.find(f => !f.includes("avatar") && !f.toLowerCase().includes("cover") && f.endsWith(".jpg"))
                   || files.find(f => !f.includes("avatar") && f.endsWith(".jpg"))
                   || files.find(f => f.endsWith(".jpg"));

  if (!metaFile && !videoFile) return null;
  let meta: any = {};
  if (metaFile) { try { meta = JSON.parse(fs.readFileSync(path.join(dir, metaFile), "utf-8")); } catch {} }
  let capData: any = {};
  if (captionFile) { try { capData = JSON.parse(fs.readFileSync(path.join(dir, captionFile), "utf-8")); } catch {} }

  const stats  = meta.stats  || meta.statistics || {};
  const author = meta.author || meta.authorInfo  || {};
  const music  = meta.music  || meta.musicInfo   || {};
  const captionText = String(capData.caption || meta.desc || meta.text || meta.description || "");
  let hashtags: string[] = capData.hashtags || captionText.match(/#\w+/g) || [];
  if (!Array.isArray(hashtags)) hashtags = [String(hashtags)];

  return {
    post_id:  postId, platform: "tiktok",
    username: author.uniqueId || author.username || author.unique_id || "unknown",
    nickname: author.nickname || author.displayName || "",
    caption:  captionText.trim(), hashtags: JSON.stringify(hashtags),
    likes:    parseInt(stats.diggCount    || stats.like_count    || 0),
    views:    parseInt(stats.playCount    || stats.play_count    || 0),
    comments: parseInt(stats.commentCount || stats.comment_count || 0),
    music_title:  music.title      || "",
    music_author: music.authorName || music.author || "",
    categories: JSON.stringify(autoCategorize(`${captionText} ${hashtags.join(" ")} ${music.title || ""}`)),
    tags: JSON.stringify(extractTags(captionText)),
    has_video: videoFile ? 1 : 0, has_thumbnail: thumbFile ? 1 : 0, is_carousel: 0,
    video_path:  videoFile ? path.join(dir, videoFile) : "",
    thumb_path:  thumbFile ? path.join(dir, thumbFile) : "",
    folder_path: dir,
    post_date:   extractDate([...groupFiles, path.basename(dir)], dir),
    source_file: metaFile || "",
    scraped_date: "", indexed_at: new Date().toISOString(),
  };
}

// ─── Progress helpers ─────────────────────────────────────────
function progressBar(pct: number, width = 22): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function writeProgress(db: Database.Database, data: Record<string, string | number>) {
  const stmt = db.prepare("INSERT OR REPLACE INTO scan_status (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(data)) stmt.run(k, String(v));
  // Also write JSON file for UI polling
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...data, ts: Date.now() })); } catch {}
}

// ─── Main ─────────────────────────────────────────────────────
async function run() {
  const argv = await yargs(hideBin(process.argv))
    .option("folder", { type: "string", demandOption: true, describe: "Root folder" })
    .option("db",     { type: "string", default: DB_FILE })
    .option("rescan", { type: "boolean", default: false, describe: "Re-index already indexed posts" })
    .argv;

  const db = new Database(argv.db as string);
  createDb(db);

  const root = argv.folder as string;
  if (!fs.existsSync(root)) { console.error(`\n✗ Folder not found: ${root}`); process.exit(1); }

  const rescan = argv.rescan as boolean;

  console.log(`\n${"═".repeat(54)}`);
  console.log(` VAULT INDEXER`);
  console.log(`${"═".repeat(54)}`);
  console.log(` Folder : ${root}`);
  console.log(` Mode   : ${rescan ? "RESCAN (re-index all)" : "INCREMENTAL (skip existing)"}`);
  console.log(`${"═".repeat(54)}\n`);

  // ── Phase 1: count total dirs (fast, no file reads) ──────────
  process.stdout.write(" Pre-scanning directories...");
  let totalDirs = 0;
  for (const _ of walkAll(root)) totalDirs++;
  console.log(` found ${totalDirs.toLocaleString()} directories\n`);

  // ── Phase 2: actual indexing ──────────────────────────────────
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO posts
    (post_id,platform,username,nickname,caption,hashtags,likes,views,comments,
     music_title,music_author,categories,tags,has_video,has_thumbnail,is_carousel,
     video_path,thumb_path,folder_path,post_date,source_file,scraped_date,indexed_at)
    VALUES
    (@post_id,@platform,@username,@nickname,@caption,@hashtags,@likes,@views,@comments,
     @music_title,@music_author,@categories,@tags,@has_video,@has_thumbnail,@is_carousel,
     @video_path,@thumb_path,@folder_path,@post_date,@source_file,@scraped_date,@indexed_at)
  `);
  const ftsStmt = db.prepare(`
    INSERT OR IGNORE INTO posts_fts (rowid,post_id,username,caption,hashtags,categories,tags,music_title)
    VALUES (@rowid,@post_id,@username,@caption,@hashtags,@categories,@tags,@music_title)
  `);
  const existsStmt = db.prepare("SELECT id FROM posts WHERE post_id = ? LIMIT 1");

  let indexed = 0, skipped = 0, already = 0, dirsDone = 0;
  const startTime = Date.now();

  writeProgress(db, { status: "running", indexed: 0, total_dirs: totalDirs, started: startTime });

  db.exec("BEGIN");
  let batchCount = 0;

  for (const dir of walkAll(root)) {
    dirsDone++;

    // ── Terminal progress (updates same line) ──────────────────
    if (dirsDone % 5 === 0 || dirsDone === totalDirs) {
      const pct     = Math.round((dirsDone / totalDirs) * 100);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate    = elapsed > 0 ? (indexed / elapsed).toFixed(0) : "0";
      const eta     = elapsed > 0 && indexed > 0
        ? Math.round((totalDirs - dirsDone) / (dirsDone / elapsed)) + "s"
        : "…";
      const dirShort = path.basename(dir).slice(0, 38);
      process.stdout.write(
        `\r [${progressBar(pct)}] ${String(pct).padStart(3)}% | `+
        `${indexed} indexed | ${rate}/s | ETA ${eta} | ${dirShort.padEnd(38)}`
      );
    }

    // ── Get direct files only ──────────────────────────────────
    const directFiles = getDirectFiles(dir);

    // TikTok per-post folder: folder name ends with 15+ digit ID
    const tikFolderMatch = path.basename(dir).match(/_?(\d{15,})(?:_.*)?$/) || (path.basename(dir).match(/^\d{15,}$/) ? [null, path.basename(dir)] : null);
    if (tikFolderMatch && directFiles.length > 0) {
      const pid = tikFolderMatch[1]!;
      if (!rescan && existsStmt.get(pid)) { already++; continue; }
      const data = parseTiktokPost(dir, pid, directFiles);
      if (!data) { skipped++; continue; }
      const res = insertStmt.run(data);
      if (res.changes > 0) { ftsStmt.run({ rowid: res.lastInsertRowid, ...data }); indexed++; }
      else already++;
      if (++batchCount % 500 === 0) { db.exec("COMMIT"); db.exec("BEGIN"); writeProgress(db, { status: "running", indexed, already, total_dirs: totalDirs, dirs_done: dirsDone }); }
      continue;
    }

    // Standard file-based grouping (Instagram flat folders, TikTok flat)
    if (!directFiles.some(f => f.includes("_meta_") && f.endsWith(".json"))) continue;

    const groups = groupFilesByPostId(directFiles);
    for (const [postId, groupFiles] of groups) {
      if (!groupFiles.some(f => f.includes("_meta_") && f.endsWith(".json"))) continue;
      if (!rescan && existsStmt.get(postId)) { already++; continue; }

      const platform = detectPlatform(dir, postId, groupFiles);
      const data = platform === "tiktok"
        ? parseTiktokPost(dir, postId, groupFiles)
        : parseInstaPost(dir, postId, groupFiles);

      if (!data) { skipped++; continue; }
      const res = insertStmt.run(data);
      if (res.changes > 0) { ftsStmt.run({ rowid: res.lastInsertRowid, ...data }); indexed++; }
      else already++;

      if (++batchCount % 500 === 0) { db.exec("COMMIT"); db.exec("BEGIN"); writeProgress(db, { status: "running", indexed, already, total_dirs: totalDirs, dirs_done: dirsDone }); }
    }
  }

  db.exec("COMMIT");
  db.exec("INSERT INTO posts_fts(posts_fts) VALUES('rebuild')");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(`\n${"═".repeat(54)}`);
  console.log(` ✓ DONE in ${elapsed}s`);
  console.log(`   New indexed : ${indexed}`);
  console.log(`   Already had : ${already}`);
  console.log(`   Skipped     : ${skipped}`);
  const total: any = db.prepare("SELECT COUNT(*) as c FROM posts").get();
  console.log(`   Total in DB : ${total?.c || 0}`);
  console.log(`${"═".repeat(54)}\n`);

  writeProgress(db, { status: "done", indexed, already, skipped, total: total?.c || 0, elapsed, finished: Date.now() });
  db.close();
}

run().catch(console.error);

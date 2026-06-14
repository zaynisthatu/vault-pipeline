import express from "express";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";
import { getAllFilesRecursive } from "./src/fileUtils";

const DB_FILE  = "vault.db";
const PROGRESS_FILE = "scan_progress.json";

export function getDb() { return new Database(DB_FILE, { readonly: true }); }

function rowToDict(row: any) {
  const d = { ...row };
  for (const f of ["hashtags","categories","tags"]) {
    try { d[f] = JSON.parse(d[f] || "[]"); } catch { d[f] = []; }
  }
  return d;
}

function getPostFiles(folderPath: string, postId: string): string[] {
  return getAllFilesRecursive(folderPath).filter(f => f.includes(postId));
}

async function startServer() {
  const app  = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use("/api", (req, res, next) => {
    if (!fs.existsSync(DB_FILE)) return res.status(503).json({ error: "Run the indexer first." });
    next();
  });

  // ── STATS ──────────────────────────────────────────────────
  app.get("/api/stats", (req, res) => {
    try {
      const db = getDb();
      const stats = {
        total:       (db.prepare("SELECT COUNT(*) as c FROM posts").get() as any)?.c || 0,
        instagram:   (db.prepare("SELECT COUNT(*) as c FROM posts WHERE platform='instagram'").get() as any)?.c || 0,
        tiktok:      (db.prepare("SELECT COUNT(*) as c FROM posts WHERE platform='tiktok'").get() as any)?.c || 0,
        videos:      (db.prepare("SELECT COUNT(*) as c FROM posts WHERE has_video=1").get() as any)?.c || 0,
        carousels:   (db.prepare("SELECT COUNT(*) as c FROM posts WHERE is_carousel=1").get() as any)?.c || 0,
        total_likes: (db.prepare("SELECT SUM(likes) as c FROM posts").get() as any)?.c || 0,
        total_views: (db.prepare("SELECT SUM(views) as c FROM posts").get() as any)?.c || 0,
      };
      db.close();
      res.json(stats);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── YEARS (for filter) ─────────────────────────────────────
  app.get("/api/years", (req, res) => {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT SUBSTR(post_date,1,4) as yr, COUNT(*) as cnt
        FROM posts WHERE post_date != '' AND post_date IS NOT NULL
        GROUP BY yr ORDER BY yr DESC
      `).all();
      db.close();
      res.json(rows);
    } catch { res.json([]); }
  });

  // ── CATEGORIES ─────────────────────────────────────────────
  app.get("/api/categories", (req, res) => {
    try {
      const db = getDb();
      const rows = db.prepare("SELECT categories, COUNT(*) as cnt FROM posts GROUP BY categories").all() as any[];
      db.close();
      const catCount: Record<string, number> = {};
      for (const r of rows) {
        try { for (const c of JSON.parse(r.categories)) catCount[c] = (catCount[c] || 0) + r.cnt; } catch {}
      }
      res.json(Object.entries(catCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── POSTS ──────────────────────────────────────────────────
  app.get("/api/posts", (req, res) => {
    try {
      const db     = getDb();
      const page   = parseInt(req.query.page   as string) || 1;
      const limit  = parseInt(req.query.limit  as string) || 30;
      const offset = (page - 1) * limit;
      const platform = (req.query.platform as string) || "";
      const category = (req.query.category as string) || "";
      const search   = ((req.query.q        as string) || "").trim();
      const sort     = (req.query.sort      as string) || "likes";
      const year     = (req.query.year      as string) || "";

      const conds:   string[] = [];
      const params:  any[]    = [];

      if (platform && platform !== "all") { conds.push("platform = ?"); params.push(platform); }
      if (category && category !== "all") { conds.push(`categories LIKE ?`); params.push(`%"${category}"%`); }
      if (year)     { conds.push("post_date LIKE ?"); params.push(`${year}%`); }
      if (search) {
        conds.push("(LOWER(caption) LIKE ? OR LOWER(hashtags) LIKE ? OR LOWER(username) LIKE ? OR LOWER(categories) LIKE ? OR LOWER(music_title) LIKE ?)");
        const s = `%${search.toLowerCase()}%`;
        params.push(s, s, s, s, s);
      }

      const where   = conds.length ? "WHERE " + conds.join(" AND ") : "";
      const sortMap: Record<string, string> = {
        likes:    "likes DESC",
        views:    "views DESC",
        comments: "comments DESC",
        recent:   "post_date DESC, indexed_at DESC",
        oldest:   "post_date ASC",
        alpha:    "username ASC, caption ASC",
        random:   "RANDOM()",
      };
      const sortCol = sortMap[sort] || "likes DESC";

      const total   = (db.prepare(`SELECT COUNT(*) as c FROM posts ${where}`).get(...params) as any)?.c || 0;
      const rows    = db.prepare(`SELECT * FROM posts ${where} ORDER BY ${sortCol} LIMIT ? OFFSET ?`).all(...params, limit, offset);
      db.close();
      res.json({ posts: rows.map(rowToDict), total, page, pages: Math.ceil(total / limit) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── SCAN STATUS (for progress bar in UI) ───────────────────
  app.get("/api/scan-status", (req, res) => {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
        return res.json(data);
      }
      if (fs.existsSync(DB_FILE)) {
        const db  = getDb();
        const rows = db.prepare("SELECT key, value FROM scan_status").all() as any[];
        db.close();
        const obj: Record<string, any> = {};
        for (const r of rows) obj[r.key] = r.value;
        return res.json(obj);
      }
      res.json({ status: "idle" });
    } catch { res.json({ status: "idle" }); }
  });

  // ── COMMENTS ──────────────────────────────────────────────
  app.get("/api/comments/:post_id", (req, res) => {
    try {
      const db  = getDb();
      const row = db.prepare("SELECT folder_path, post_id FROM posts WHERE post_id=?").get(req.params.post_id) as any;
      db.close();
      if (!row || !fs.existsSync(row.folder_path)) return res.json([]);

      const files = getPostFiles(row.folder_path, row.post_id);
      const cf    = files.find(f => f.includes("_comments_") && f.endsWith(".json"));
      if (!cf) return res.json([]);

      const raw  = JSON.parse(fs.readFileSync(path.join(row.folder_path, cf), "utf-8"));
      const comments: any[] = [];

      // Normalise different comment structures
      let items: any[] = [];
      if (Array.isArray(raw)) items = raw;
      else if (Array.isArray(raw.comments)) items = raw.comments;
      else if (Array.isArray(raw.data))     items = raw.data;
      else if (raw.edges)  items = (raw.edges  as any[]).map((e: any) => e.node || e);
      else items = [raw];

      for (const c of items.slice(0, 60)) {
        if (!c || typeof c !== "object") continue;
        const text     = c.text || c.comment || c.content || c.message || "";
        const username =
          c.username || c.user?.username || c.user?.uniqueId || c.user?.unique_id ||
          c.owner?.username || c.commenter?.username || c.author?.username ||
          (typeof c.user === "string" ? c.user : null) || "unknown";
        const likes    = c.like_count || c.likes || c.comment_like_count || c.digg_count || c.diggCount || c.edge_liked_by?.count || 0;
        if (text) comments.push({ user: String(username), text: String(text), likes: parseInt(likes || 0) });
      }
      res.json(comments);
    } catch { res.json([]); }
  });

  // ── CAROUSEL ──────────────────────────────────────────────
  app.get("/api/carousel/:post_id", (req, res) => {
    try {
      const db  = getDb();
      const row = db.prepare("SELECT folder_path, platform, post_id FROM posts WHERE post_id=?").get(req.params.post_id) as any;
      db.close();
      if (!row || !fs.existsSync(row.folder_path)) return res.json([]);

      const files  = getPostFiles(row.folder_path, row.post_id).sort();
      const images: string[] = [];
      for (const f of files) {
        if (f.endsWith(".jpg") && !f.includes("avatar") && f.includes("_item")) images.push(f);
      }

      // TikTok image carousel from RAW-meta
      if (images.length === 0 && row.platform === "tiktok") {
        const rm = files.find(f => f.includes("RAW-meta_") && f.endsWith(".json"));
        if (rm) {
          try {
            const m = JSON.parse(fs.readFileSync(path.join(row.folder_path, rm), "utf-8"));
            const imgs = m?.imagePost?.images || m?.itemInfo?.itemStruct?.imagePost?.images || [];
            for (const img of imgs) { const u = img?.imageURL?.urlList?.[0] || img?.displayImage?.urlList?.[0]; if (u) images.push(u); }
          } catch {}
        }
      }
      if (images.length === 0) {
        for (const f of files) { if (f.endsWith(".jpg") && !f.includes("avatar") && !f.includes("_thumbs_")) images.push(f); }
      }
      res.json(images);
    } catch { res.json([]); }
  });

  // ── FILE SERVES ───────────────────────────────────────────
  app.get("/carousel/:post_id/:filename", (req, res) => {
    try {
      const db  = getDb();
      const row = db.prepare("SELECT folder_path FROM posts WHERE post_id=?").get(req.params.post_id) as any;
      db.close();
      if (!row) return res.status(404).send("Not found");
      const fp = path.join(row.folder_path, req.params.filename);
      if (fs.existsSync(fp)) res.sendFile(fp); else res.status(404).send("Not found");
    } catch { res.status(404).send("Not found"); }
  });

  app.get("/video/:id", (req, res) => {
    try {
      const db  = getDb();
      const row = db.prepare("SELECT video_path FROM posts WHERE id=?").get(req.params.id) as any;
      db.close();
      if (!row?.video_path || !fs.existsSync(row.video_path)) return res.status(404).send("Video not found");
      const stat = fs.statSync(row.video_path);
      const range = req.headers.range;
      if (range) {
        const parts  = range.replace(/bytes=/, "").split("-");
        const start  = parseInt(parts[0], 10);
        const end    = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": "video/mp4" });
        fs.createReadStream(row.video_path, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stat.size, "Content-Type": "video/mp4" });
        fs.createReadStream(row.video_path).pipe(res);
      }
    } catch (err: any) { res.status(500).send(err.message); }
  });

  app.get("/thumb/:id", (req, res) => {
    try {
      const db  = getDb();
      const row = db.prepare("SELECT * FROM posts WHERE id=?").get(req.params.id) as any;
      db.close();
      if (!row) return res.status(404).send("Not found");

      if (row.thumb_path && fs.existsSync(row.thumb_path) && !row.thumb_path.includes("avatar"))
        return res.sendFile(row.thumb_path);

      if (row.folder_path && fs.existsSync(row.folder_path)) {
        const files = getPostFiles(row.folder_path, row.post_id);
        const alt   = files.find(f => (f.includes("_thumbs_") || f.includes("_item")) && f.endsWith(".jpg"))
                   || files.find(f => !f.includes("avatar") && f.endsWith(".jpg"));
        if (alt) return res.sendFile(path.join(row.folder_path, alt));

        if (row.platform === "tiktok") {
          const rm = files.find(f => f.includes("RAW-meta_") && f.endsWith(".json"));
          if (rm) { try { const m = JSON.parse(fs.readFileSync(path.join(row.folder_path, rm), "utf-8")); const u = m?.video?.cover || m?.video?.dynamicCover; if (u) return res.redirect(u); } catch {} }
        }
      }
      if (row.thumb_path && fs.existsSync(row.thumb_path)) return res.sendFile(row.thumb_path);
      res.status(404).send("Thumb not found");
    } catch { res.status(404).send("Not found"); }
  });

  // ── FRONTEND ──────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist));
    app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n Server running → http://localhost:${PORT}\n`);
  });
}

startServer();

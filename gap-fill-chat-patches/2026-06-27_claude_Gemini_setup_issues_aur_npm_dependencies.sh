python3 << 'EOF'
with open('/content/app/vault-app/vault-complete/server.ts', 'r') as f:
    content = f.read()

old = '  app.get("/api/search/semantic", async (req, res) => {'
new = '''  // ── QDRANT SEMANTIC SEARCH ──────────────────────────────────
  app.get("/api/search/semantic", async (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.json({ posts: [], total: 0 });

    const limit    = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const platform = (req.query.platform as string) || "";
    const category = (req.query.category as string) || "";

    try {
      const qc = getQdrant();

      // Build filter
      const must: any[] = [];
      if (platform && platform !== "all") {
        must.push({ key: "platform", match: { value: platform } });
      }
      if (category && category !== "all") {
        must.push({ key: "categories", match: { value: category } });
      }

      // Use Qdrant text search with query (requires fastembed on server)
      // Fallback: use existing xenova embedding then query qdrant by vector
      if (!embeddingModelReady) await loadEmbeddingModel();

      const output = await embeddingModel(q, { pooling: "mean", normalize: true });
      const queryVec = Array.from(output.data as Float32Array);

      const searchParams: any = {
        collection_name: "posts",
        vector: queryVec,
        limit,
        with_payload: true,
      };
      if (must.length) searchParams.filter = { must };

      const result = await qc.search("posts", searchParams);

      if (!result.length) return res.json({ posts: [], total: 0, mode: "qdrant" });

      const postIds = result.map((r: any) => r.payload.post_id);
      const db = getDb();
      const rowMap = new Map<string, any>();
      (db.prepare(`SELECT * FROM posts WHERE post_id IN (${postIds.map(() => "?").join(",")})`).all(...postIds) as any[])
        .forEach((r: any) => rowMap.set(r.post_id, r));
      db.close();

      const ordered = result
        .filter((r: any) => rowMap.has(r.payload.post_id))
        .map((r: any) => rowToDict(rowMap.get(r.payload.post_id)));

      res.json({ posts: ordered, total: ordered.length, mode: "qdrant-bge" });
    } catch (e: any) {
      res.status(500).json({ error: e.message, posts: [] });
    }
  });

  // ── OLD SEMANTIC (disabled) ──────────────────────────────────
  app.get("/api/search/semantic_old", async (req, res) => {'''

content = content.replace('  app.get("/api/search/semantic", async (req, res) => {', new, 1)
with open('/content/app/vault-app/vault-complete/server.ts', 'w') as f:
    f.write(content)
print("Done")
EOF
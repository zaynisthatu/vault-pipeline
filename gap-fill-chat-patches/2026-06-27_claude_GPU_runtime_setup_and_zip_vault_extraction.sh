python3 << 'EOF'
with open('/content/app/vault-complete/vault-complete/server.ts', 'r') as f:
    content = f.read()

# Find the semantic search endpoint and replace it
old = '  app.get("/api/search/semantic", async (req, res) => {'

new = '''  // ── QDRANT SEMANTIC SEARCH ─────────────────────────────────
  app.get("/api/search/semantic", async (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.json({ posts: [], total: 0 });

    const limit    = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const platform = (req.query.platform as string) || "";
    const category = (req.query.category as string) || "";

    try {
      const qc = getQdrant();
      const must: any[] = [];
      if (platform && platform !== "all") must.push({ key: "platform", match: { value: platform } });
      if (category && category !== "all") must.push({ key: "categories", match: { value: category } });

      // Use existing xenova model to encode query, then search qdrant
      if (!embeddingModelReady) await loadEmbeddingModel();
      const output = await embeddingModel(q, { pooling: "mean", normalize: true });
      const queryVec = Array.from(output.data as Float32Array);

      const searchParams: any = { vector: queryVec, limit, with_payload: true };
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

      res.json({ posts: ordered, total: ordered.length, mode: "qdrant" });
    } catch (e: any) {
      // Fallback to old semantic if qdrant fails
      res.status(500).json({ error: e.message, posts: [], hint: "Qdrant not running?" });
    }
  });

  // ── OLD SEMANTIC (backup) ─────────────────────────────────────
  app.get("/api/search/semantic_old", async (req, res) => {'''

if old in content:
    content = content.replace(old, new, 1)
    with open('/content/app/vault-complete/vault-complete/server.ts', 'w') as f:
        f.write(content)
    print("Done! Semantic endpoint replaced.")
else:
    print("ERROR: pattern not found!")
EOF
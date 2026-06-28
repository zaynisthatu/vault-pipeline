with open('/content/app/vault-complete/vault-complete/server.ts', 'r') as f:
    content = f.read()

old = re.search(r'  // ── QDRANT SEMANTIC SEARCH.*?// ── OLD SEMANTIC', content, re.DOTALL)
if old:
    old_str = old.group()[:-len('  // ── OLD SEMANTIC')]
    new_str = '''  // ── QDRANT SEMANTIC SEARCH ─────────────────────────────────
  app.get("/api/search/semantic", async (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.json({ posts: [], total: 0 });

    const limit    = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const platform = (req.query.platform as string) || "";
    const category = (req.query.category as string) || "";

    try {
      const qc = getQdrant();

      if (!embeddingModelReady) await loadEmbeddingModel();
      const output = await embeddingModel(q, { pooling: "mean", normalize: true });
      const queryVec = Array.from(output.data as Float32Array);

      const filter: any = { must: [] as any[] };
      if (platform && platform !== "all") filter.must.push({ key: "platform", match: { value: platform } });
      if (category && category !== "all") filter.must.push({ key: "categories", match: { value: category } });

      const searchResult = await qc.search("posts", {
        vector: queryVec,
        limit,
        with_payload: true,
        ...(filter.must.length ? { filter } : {})
      });

      if (!searchResult.length) return res.json({ posts: [], total: 0, mode: "qdrant" });

      const postIds = searchResult.map((r: any) => r.payload.post_id);
      const db = getDb();
      const rowMap = new Map<string, any>();
      (db.prepare(`SELECT * FROM posts WHERE post_id IN (${postIds.map(() => "?").join(",")})`).all(...postIds) as any[])
        .forEach((r: any) => rowMap.set(r.post_id, r));
      db.close();

      const ordered = searchResult
        .filter((r: any) => rowMap.has(r.payload.post_id))
        .map((r: any) => rowToDict(rowMap.get(r.payload.post_id)));

      res.json({ posts: ordered, total: ordered.length, mode: "qdrant" });
    } catch (e: any) {
      res.status(500).json({ error: e.message, posts: [], hint: "Qdrant not running?" });
    }
  });

  // ── OLD SEMANTIC'''

    content = content.replace(old_str, new_str)
    with open('/content/app/vault-complete/vault-complete/server.ts', 'w') as f:
        f.write(content)
    print("✅ Fixed!")
else:
    print("❌ Pattern nahi mila — Cell 2 ka output paste karo")
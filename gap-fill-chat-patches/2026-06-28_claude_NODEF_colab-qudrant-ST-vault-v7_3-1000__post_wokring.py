# ============================================
# VAULT STARTUP CELL — har baar run karo
# ============================================
import subprocess, time, os, requests

print("1/6 Dependencies install...")
subprocess.run('pip install sentence-transformers qdrant-client -q', shell=True)

print("2/6 Meilisearch start...")
subprocess.Popen(
    'meilisearch --http-addr 127.0.0.1:7700 --no-analytics --db-path /content/app/Hf-data/meili_data',
    shell=True, stdout=open('/tmp/meili.log','w'), stderr=subprocess.STDOUT
)

print("3/6 Qdrant start...")
subprocess.Popen(
    'QDRANT__STORAGE__STORAGE_PATH=/content/app/Hf-data/qdrant_data qdrant',
    shell=True, stdout=open('/tmp/qdrant.log','w'), stderr=subprocess.STDOUT
)
time.sleep(6)

print("4/6 Vault server start...")
subprocess.Popen(
    'DATA_DIR=/content/app/Hf-data/data npm run dev --prefix /content/app/vault-complete/vault-complete',
    shell=True,
    env={**os.environ, 'DATA_DIR': '/content/app/Hf-data/data'},
    stdout=open('/tmp/server.log','w'), stderr=subprocess.STDOUT
)
time.sleep(15)

print("5/6 Qdrant vectors reload check...")
r = requests.get('http://127.0.0.1:6333/collections/posts')
info = r.json().get('result', {})
print(f"   Qdrant vectors: {info.get('points_count', 0)}")

# Agar vectors missing hain (runtime reset hone se) toh dobara generate karo
if info.get('points_count', 0) < 100:
    print("   ⚠ Vectors missing — regenerating...")
    import sqlite3
    from sentence_transformers import SentenceTransformer
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct

    model = SentenceTransformer('BAAI/bge-base-en-v1.5', device='cuda')
    conn = sqlite3.connect('/content/app/Hf-data/data/vault.db')
    conn.row_factory = sqlite3.Row
    posts = conn.execute("SELECT post_id, username, caption, hashtags, comments_text, categories, music_title FROM posts").fetchall()
    conn.close()

    texts = []
    for p in posts:
        text = " ".join(filter(None, [
            p['caption'] or '', p['hashtags'] or '',
            p['username'] or '', p['music_title'] or '',
            (p['comments_text'] or '')[:300]
        ]))
        texts.append(text.strip() or "no caption")

    embeddings = model.encode(texts, batch_size=128, show_progress_bar=True, normalize_embeddings=True)
    
    client = QdrantClient(url="http://127.0.0.1:6333", check_compatibility=False)
    try: client.delete_collection("posts")
    except: pass
    client.create_collection("posts", vectors_config=VectorParams(size=768, distance=Distance.COSINE))
    
    points = [PointStruct(id=i, vector=embeddings[i].tolist(), payload={
        "post_id": posts[i]['post_id'], "username": posts[i]['username'],
        "caption": posts[i]['caption'] or '', "categories": posts[i]['categories'] or ''
    }) for i in range(len(posts))]
    
    client.upsert(collection_name="posts", points=points)
    print(f"   ✅ {len(points)} vectors ready!")
else:
    print("   ✅ Vectors already loaded!")

print("6/6 Status check...")
time.sleep(5)
r1 = requests.get('http://localhost:7860/api/stats')
r2 = requests.get('http://localhost:7860/api/meili/status')
print(f"   Posts: {r1.json().get('total', 0)}")
print(f"   Meili docs: {r2.json().get('docs', 0)}")
print("\n🚀 VAULT READY → http://localhost:7860")
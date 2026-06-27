python3 << 'EOF'
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

print("Loading model...")
model = SentenceTransformer('BAAI/bge-base-en-v1.5', device='cpu')

print("Loading posts from SQLite...")
conn = sqlite3.connect('/content/hf-data/vault.db')
conn.row_factory = sqlite3.Row
posts = conn.execute("""
    SELECT post_id, username, caption, hashtags, comments_text, categories, music_title
    FROM posts
""").fetchall()
conn.close()
print(f"Loaded {len(posts)} posts")

print("Building text for embedding...")
texts = []
for p in posts:
    text = " ".join(filter(None, [
        p['caption'] or '',
        p['hashtags'] or '',
        p['username'] or '',
        p['music_title'] or '',
        (p['comments_text'] or '')[:500]
    ]))
    texts.append(text.strip() or "no caption")

print("Generating BGE embeddings (CPU - will take a few minutes)...")
embeddings = model.encode(texts, batch_size=32, show_progress_bar=True, normalize_embeddings=True)
print(f"Embeddings shape: {embeddings.shape}")

print("Setting up Qdrant...")
client = QdrantClient(":memory:")
client.create_collection(
    collection_name="posts",
    vectors_config=VectorParams(size=768, distance=Distance.COSINE)
)

print("Inserting into Qdrant...")
points = []
for i, p in enumerate(posts):
    points.append(PointStruct(
        id=i,
        vector=embeddings[i].tolist(),
        payload={
            "post_id": p['post_id'],
            "username": p['username'],
            "caption": p['caption'] or '',
            "categories": p['categories'] or ''
        }
    ))

client.upsert(collection_name="posts", points=points)
print(f"Inserted {len(points)} vectors into Qdrant")

print("\nTest search: 'funny meme'")
query_vec = model.encode("funny meme", normalize_embeddings=True)
results = client.search(collection_name="posts", query_vector=query_vec.tolist(), limit=3)
for r in results:
    print(f"  Score: {r.score:.3f} | @{r.payload['username']} | {r.payload['caption'][:60]}")

print("\nTest search: 'car bike motorcycle'")
query_vec2 = model.encode("car bike motorcycle", normalize_embeddings=True)
results2 = client.search(collection_name="posts", query_vector=query_vec2.tolist(), limit=3)
for r in results2:
    print(f"  Score: {r.score:.3f} | @{r.payload['username']} | {r.payload['caption'][:60]}")

EOF
# Save as test_ingest_sentiment.py
from elasticsearch import Elasticsearch
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

load_dotenv()
es = Elasticsearch(os.getenv("ELASTIC_URL"), api_key=os.getenv("ELASTIC_API_KEY"))

# Create index with correct mapping
if not es.indices.exists(index="sentiment-stream"):
    es.indices.create(index="sentiment-stream", mappings={
        "properties": {
            "timestamp":       {"type": "date"},
            "location":        {"type": "keyword"},
            "sentiment_score": {"type": "float"},
            "keywords":        {"type": "keyword"},
            "source":          {"type": "keyword"},
        }
    })
    print("Created sentiment-stream index")

docs = [
    {"timestamp": datetime.now(timezone.utc).isoformat(), "location": "gate_c", "sentiment_score": -0.72, "keywords": ["crowded", "pushing"], "source": "test"},
    {"timestamp": datetime.now(timezone.utc).isoformat(), "location": "gate_c", "sentiment_score": -0.81, "keywords": ["help", "stuck"], "source": "test"},
    {"timestamp": datetime.now(timezone.utc).isoformat(), "location": "gate_a", "sentiment_score": -0.15, "keywords": ["slow", "waiting"], "source": "test"},
    {"timestamp": datetime.now(timezone.utc).isoformat(), "location": "gate_b", "sentiment_score":  0.20, "keywords": ["exciting", "great"], "source": "test"},
]

for doc in docs:
    es.index(index="sentiment-stream", document=doc)
    print(f"Indexed: location={doc['location']} sentiment={doc['sentiment_score']}")

print("Done.")
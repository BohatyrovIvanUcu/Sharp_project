from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models import MemoryEmbedding


def test_pgvector_cosine_distance_compiles_for_postgresql() -> None:
    query_vec = [0.0] * 1024
    dist = MemoryEmbedding.embedding.cosine_distance(query_vec)
    sql = str(select(MemoryEmbedding).order_by(dist.asc()).compile(dialect=postgresql.dialect()))
    assert "<=>" in sql


def test_vector_memory_recall_surfaces_similar_past_session(client: TestClient) -> None:
    # Create session 1 and complete step 1 to store episodic memory
    s1 = client.post(
        "/api/sessions",
        json={"problem": "Боюсь почати курсову роботу з баз даних, хочу зробити все ідеально"},
    ).json()
    plan = client.post(f"/api/sessions/{s1['id']}/plan").json()
    first_step = plan["steps"][0]
    client.post(
        f"/api/sessions/{s1['id']}/steps/{first_step['id']}/complete",
        json={"elapsed_seconds": 180},
    )

    # Create session 2 on a semantically overlapping problem
    s2_resp = client.post(
        "/api/sessions",
        json={"problem": "Знову відкладаю курсову роботу з баз даних через страх чистого аркуша"},
    )
    assert s2_resp.status_code == 201
    s2 = s2_resp.json()
    assert len(s2["memory_insight"]) >= 1
    assert s2["memory_insight"][0]["similarity"] > 0.15

    # Deleting session 1 synchronously deletes its MemoryEmbedding from pgvector / memory overview
    del_resp = client.delete(f"/api/sessions/{s1['id']}")
    assert del_resp.status_code == 204
    mem_overview = client.get("/api/memory").json()
    assert mem_overview["memories"] == []

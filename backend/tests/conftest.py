import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session(monkeypatch: pytest.MonkeyPatch) -> Iterator[Session]:
    # Ensure tests never attempt external Bedrock HTTP calls unless explicitly mocked
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.setattr("app.ai.bedrock_service._invoke_converse", _raise_offline)
    monkeypatch.setattr("app.ai.bedrock_service._invoke_converse_chat", _raise_offline)
    monkeypatch.setattr("app.ai.memory_service._bedrock_runtime_client", _raise_offline)

    test_db_url = os.getenv("TEST_DATABASE_URL")
    if test_db_url:
        engine = create_engine(test_db_url)
    else:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestingSession() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def _raise_offline(*_args: object, **_kwargs: object) -> object:
    raise RuntimeError("Offline test mode")


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def _override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

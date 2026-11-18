from functools import cached_property
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # Database
    database_url: str | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "sharp"
    db_user: str = "sharp"
    db_password: str = "sharp_dev_password"
    db_null_pool: bool = False

    # API & CORS & Edge Security
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    seed: bool = False
    origin_verify_secret: str = ""
    rate_limit_enabled: bool = True
    rate_limit_llm_requests: int = 20
    rate_limit_window_seconds: int = 60

    # Cognito Auth
    cognito_region: str = "us-east-1"
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    cognito_jwks: str = ""

    # AWS Bedrock
    aws_region: str = "us-east-1"
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "us.amazon.nova-lite-v1:0"
    bedrock_embedding_model_id: str = "amazon.titan-embed-text-v2:0"
    bedrock_embedding_dim: int = 1024
    ai_fallback_enabled: bool = True

    # Optional explicit AWS keys (local dev)
    aws_access_key_id: str | None = Field(default=None)
    aws_secret_access_key: str | None = Field(default=None)
    aws_session_token: str | None = Field(default=None)

    # Monobank Acquiring & Billing Proxy
    monobank_api_token: str = ""
    monobank_api_base_url: str = "https://api.monobank.ua"
    monobank_pro_amount_kopecks: int = 99900
    monobank_pro_currency: int = 980
    app_url: str = ""
    billing_internal_secret: str = ""
    backend_internal_url: str = ""

    @model_validator(mode="after")
    def validate_production_auth(self) -> "Settings":
        if self.environment == "production" and (not self.cognito_user_pool_id or not self.cognito_client_id):
            raise RuntimeError("Production environment requires Cognito configuration.")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @cached_property
    def sqlalchemy_url(self) -> str | URL:
        if self.database_url:
            return self.database_url
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def auth_enabled(self) -> bool:
        return bool(self.cognito_user_pool_id and self.cognito_client_id)

    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"


settings = Settings()

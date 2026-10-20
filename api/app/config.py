from functools import lru_cache
from pydantic_settings import BaseSettings


DEFAULT_JWT_SECRET = "dev-only-not-for-production"
# the value shipped in .env.example: published in the repo, so as unusable as the dev default
PLACEHOLDER_JWT_SECRET = "generate-with-openssl-rand-hex-32"
KNOWN_PUBLIC_SECRETS = frozenset({DEFAULT_JWT_SECRET, PLACEHOLDER_JWT_SECRET})


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://pettech:pettech@db:5432/pettech"
    jwt_secret: str = DEFAULT_JWT_SECRET
    rabbitmq_url: str = "amqp://pettech:pettech@rabbitmq:5672//"
    app_version: str = "0.0.0"
    git_commit: str = "unknown"
    build_number: str = "0"
    upload_dir: str = "/data/uploads"
    cookie_secure: bool = False

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

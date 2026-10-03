from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://pettech:pettech@db:5432/pettech"
    jwt_secret: str = "dev-only-not-for-production"
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

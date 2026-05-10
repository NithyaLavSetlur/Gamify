from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gamify Study RPG"
    database_url: str = "sqlite:///./gamify.db"
    backend_public_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    production_frontend_url: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    secret_key: str = "change-me-local-dev"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    ticktick_client_id: str = ""
    ticktick_client_secret: str = ""
    ticktick_redirect_uri: str = "http://localhost:8000/api/integrations/ticktick/callback"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/integrations/google/callback"
    google_calendar_id: str = "primary"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()

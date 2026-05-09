from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.migrations import ensure_sqlite_columns
from app.db.session import Base, engine
from app.models import entities  # noqa: F401

settings = get_settings()

Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()] + ([settings.production_frontend_url] if settings.production_frontend_url else []),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root() -> dict:
    return {"name": settings.app_name, "status": "ready", "docs": "/docs"}

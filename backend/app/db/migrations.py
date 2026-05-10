from sqlalchemy import inspect, text

from app.db.session import engine


def ensure_database_columns() -> None:
    inspector = inspect(engine)
    if "user_profiles" not in inspector.get_table_names():
        return

    columns = {table: {col["name"] for col in inspector.get_columns(table)} for table in inspector.get_table_names()}
    statements = migration_statements(columns)

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_sqlite_columns() -> None:
    ensure_database_columns()


def migration_statements(columns: dict[str, set[str]]) -> list[str]:
    user_columns = columns.get("user_profiles", set())
    quest_columns = columns.get("quests", set())
    boss_columns = columns.get("boss_fights", set())
    is_sqlite = engine.url.drivername.startswith("sqlite")
    statements: list[str] = []

    def add_user_column(name: str, sqlite_type: str, postgres_type: str, default: str | None = None) -> None:
        if name in user_columns:
            return
        column_type = sqlite_type if is_sqlite else postgres_type
        default_sql = f" DEFAULT {default}" if default is not None else ""
        statements.append(f"ALTER TABLE user_profiles ADD COLUMN {name} {column_type}{default_sql}")

    add_user_column("combo_count", "INTEGER", "INTEGER", "0")
    add_user_column("daily_xp_goal", "INTEGER", "INTEGER", "150")
    add_user_column("weekly_xp_goal", "INTEGER", "INTEGER", "750")
    add_user_column("streak_freezes", "INTEGER", "INTEGER", "1")
    add_user_column("last_completion_at", "DATETIME", "TIMESTAMP")
    add_user_column("lock_media_url", "TEXT", "TEXT", "''")
    add_user_column("lock_media_position", "VARCHAR(20)", "VARCHAR(20)", "'right'")
    add_user_column("lock_show_timer", "BOOLEAN", "BOOLEAN", "1" if is_sqlite else "true")
    add_user_column("lock_show_stats", "BOOLEAN", "BOOLEAN", "1" if is_sqlite else "true")
    add_user_column("lock_show_tasks", "BOOLEAN", "BOOLEAN", "1" if is_sqlite else "true")
    add_user_column("lock_show_quote", "BOOLEAN", "BOOLEAN", "1" if is_sqlite else "true")

    if "difficulty" not in quest_columns:
        statements.append("ALTER TABLE quests ADD COLUMN difficulty VARCHAR(20) DEFAULT 'easy'")
    if "difficulty" not in boss_columns:
        statements.append("ALTER TABLE boss_fights ADD COLUMN difficulty VARCHAR(20) DEFAULT 'boss'")
    return statements

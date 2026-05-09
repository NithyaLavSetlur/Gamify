from sqlalchemy import inspect, text

from app.db.session import engine


def ensure_sqlite_columns() -> None:
    if not engine.url.drivername.startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "user_profiles" not in inspector.get_table_names():
        return

    columns = {table: {col["name"] for col in inspector.get_columns(table)} for table in inspector.get_table_names()}
    statements: list[str] = []
    if "combo_count" not in columns.get("user_profiles", set()):
        statements.append("ALTER TABLE user_profiles ADD COLUMN combo_count INTEGER DEFAULT 0")
    if "daily_xp_goal" not in columns.get("user_profiles", set()):
        statements.append("ALTER TABLE user_profiles ADD COLUMN daily_xp_goal INTEGER DEFAULT 150")
    if "weekly_xp_goal" not in columns.get("user_profiles", set()):
        statements.append("ALTER TABLE user_profiles ADD COLUMN weekly_xp_goal INTEGER DEFAULT 750")
    if "streak_freezes" not in columns.get("user_profiles", set()):
        statements.append("ALTER TABLE user_profiles ADD COLUMN streak_freezes INTEGER DEFAULT 1")
    if "last_completion_at" not in columns.get("user_profiles", set()):
        statements.append("ALTER TABLE user_profiles ADD COLUMN last_completion_at DATETIME")
    if "difficulty" not in columns.get("quests", set()):
        statements.append("ALTER TABLE quests ADD COLUMN difficulty VARCHAR(20) DEFAULT 'easy'")
    if "difficulty" not in columns.get("boss_fights", set()):
        statements.append("ALTER TABLE boss_fights ADD COLUMN difficulty VARCHAR(20) DEFAULT 'boss'")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

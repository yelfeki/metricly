from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve the .env file relative to this file so the path is correct regardless
# of which directory the server is launched from.
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str
    supabase_url: str = "https://xtfyecexeoflofogchyb.supabase.co"
    anthropic_api_key: str = ""
    # Optional Gmail SMTP credentials for sending email notifications.
    # Set SMTP_EMAIL and SMTP_PASSWORD in backend/.env to enable sending.
    # If not set, requests are recorded in the DB only.
    smtp_email: str = ""
    smtp_password: str = ""

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


settings = Settings()

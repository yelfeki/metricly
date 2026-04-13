from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    supabase_url: str = "https://xtfyecexeoflofogchyb.supabase.co"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

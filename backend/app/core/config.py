from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    supabase_jwt_secret: str = ""  # Project Settings → API → JWT Secret

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

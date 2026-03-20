from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sistema de Conciliacion Cointra"
    secret_key: str = "dev_secret_change_me"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///./cointra.db"
    cors_origins: str = "http://localhost:5173"

    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    mail_from: str = ""

    avansat_enabled: bool = False
    avansat_url: str = "https://oet-avansat5.intrared.net:8083/ap/interf/app/APIAvansat/v1/index.php"
    avansat_auth_header: str = ""
    avansat_aplicacion: str = "sate_cointr"
    avansat_type: str = "operacionnacional"
    avansat_user: str = ""
    avansat_pass: str = ""
    avansat_verify_ssl: bool = False
    avansat_timeout_seconds: int = 0
    avansat_cache_ttl_seconds: int = 600
    avansat_max_workers: int = 8
    avansat_db_cache_max_age_minutes: int = 180

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()

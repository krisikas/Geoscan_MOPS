"""Позволяет запускать через: python -m src"""

import argparse
import logging
from dataclasses import dataclass, field

import uvicorn

from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


@dataclass
class TransportConfig:
    """Конфигурация транспорта MCP-сервера (только HTTP)."""

    host: str = "127.0.0.1"
    port: int = 9090
    mcp_endpoint: str = "/mcp"
    log_level: str = "INFO"
    allowed_origins: list[str] = field(
        default_factory=lambda: [
            "http://localhost",
            "http://127.0.0.1",
            "http://0.0.0.0",
        ]
    )
    # Разрешённые Host header'ы (для MCP transport_security)
    allowed_hosts: list[str] = field(default_factory=list)


def parse_args() -> TransportConfig:
    """Парсинг CLI-аргументов в TransportConfig."""
    parser = argparse.ArgumentParser(description="Pioneer Vibe MCP Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9090)
    parser.add_argument("--log-level", default="INFO")
    parser.add_argument(
        "--allowed-hosts",
        nargs="*",
        default=[],
        help="Дополнительные Host header'ы (например IP SoC)",
    )

    args = parser.parse_args()
    return TransportConfig(
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        allowed_hosts=args.allowed_hosts,
    )


class OriginValidationMiddleware:
    """Middleware для валидации Origin header."""

    def __init__(self, app, allowed_origins: list[str] | None = None):
        self.app = app
        self.allowed_origins = allowed_origins or [
            "http://localhost",
            "http://127.0.0.1",
        ]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode("utf-8")

        if origin:
            origin_valid = any(
                origin == allowed or origin.startswith(allowed + ":")
                for allowed in self.allowed_origins
            )
            if not origin_valid:
                await send({
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [(b"content-type", b"text/plain")],
                })
                await send({
                    "type": "http.response.body",
                    "body": b"Forbidden: invalid Origin",
                })
                return

        return await self.app(scope, receive, send)


def create_starlette_app(mcp_server, config: TransportConfig) -> Starlette:
    """Создаёт Starlette-приложение с MCP Streamable HTTP транспортом."""
    from mcp.server.transport_security import TransportSecuritySettings

    # Собираем список разрешённых хостов (host:port формат)
    hosts = ["localhost", "127.0.0.1", "0.0.0.0"]
    if config.host not in hosts:
        hosts.append(config.host)
    hosts.extend(config.allowed_hosts)

    # MCP проверяет Host header с портом, добавляем оба варианта
    all_hosts = []
    for h in hosts:
        all_hosts.append(h)
        all_hosts.append(f"{h}:{config.port}")

    # Собираем allowed_origins с учётом доп. хостов
    origins = list(config.allowed_origins)
    for h in config.allowed_hosts:
        origins.append(f"http://{h}")
        origins.append(f"http://{h}:{config.port}")

    # Настраиваем transport_security на уровне MCP settings
    mcp_server.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=all_hosts,
        allowed_origins=origins,
    )

    app = mcp_server.streamable_http_app()
    app.add_middleware(OriginValidationMiddleware, allowed_origins=origins)
    return app


def run_http_server(mcp_server, config: TransportConfig) -> None:
    """Запускает MCP-сервер в режиме Streamable HTTP."""
    app = create_starlette_app(mcp_server, config)
    uvicorn.run(
        app,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


def main() -> None:
    """Точка входа: запуск Streamable HTTP сервера."""
    config = parse_args()
    logging.basicConfig(level=getattr(logging, config.log_level))
    from .server import mcp as mcp_server
    run_http_server(mcp_server, config)


if __name__ == "__main__":
    main()
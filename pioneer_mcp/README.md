# Pioneer MCP

MCP-сервер для управления квадрокоптером Pioneer Mini 2 через естественный язык.

Позволяет любой LLM (Claude, GPT, Gemini, локальные модели) управлять реальным дроном: взлетать, летать по точкам, снимать камерой, управлять периферией — всё через текстовые команды на естественном языке. Нейросеть сама решает какие функции вызвать, в каком порядке, и с какими параметрами.

```
Пользователь: "Проверь батарею, взлети, включи зелёные светодиоды, сделай фото, после этого сядь, помигай светодиодами и выключи их в конце"
    ↓
Нейронная сеть (LLM)
    ↓
MCP-протокол (JSON-RPC)
    ↓
pioneer-mcp (Streamable HTTP сервер)
    ↓
pioneer_sdk2 (SDK дрона)
    ↓
Pioneer Mini 2 (коптер)
```

---

## Содержание

- [Архитектура](#архитектура)
- [MCP — Model Context Protocol](#mcp--model-context-protocol)
- [Что видит агент (LLM)](#что-видит-агент-llm)
- [Глоссарий](#глоссарий)
- [Streamable HTTP транспорт](#streamable-http-транспорт)
- [Полный список MCP Tools](#полный-список-mcp-tools)
- [MCP Resources](#mcp-resources)
- [MCP Prompts](#mcp-prompts)
- [Система безопасности](#система-безопасности)
- [Камера и компьютерное зрение](#камера-и-компьютерное-зрение)
- [Внутреннее устройство (для разработчиков)](#внутреннее-устройство-для-разработчиков)
- [Структура проекта](#структура-проекта)
- [Установка и запуск (разработка)](#установка-и-запуск-разработка)
- [Подключение к MCP-клиенту](#подключение-к-mcp-клиенту)
- [Примеры промптов](#примеры-промптов)

---

## Архитектура

Проект состоит из четырёх слоёв:

```
┌─────────────────────────────────────────────────────┐
│  MCP-клиент (IDE / чат-бот / агент)                 │
│  Claude Desktop, Kiro, Cursor, custom agent...      │
└──────────────────────┬──────────────────────────────┘
                       │ JSON-RPC over HTTP
                       │ POST /mcp
┌──────────────────────▼──────────────────────────────┐
│  server.py — MCP-слой (FastMCP)                     │
│  Регистрация tools, resources, prompts              │
│  Тонкие обёртки: tool → runtime.cmd_xxx()           │
└──────────────────────┬──────────────────────────────┘
                       │ прямые вызовы Python
┌──────────────────────▼──────────────────────────────┐
│  drone_runtime.py — ядро (DroneRuntime)             │
│  Singleton. Вся логика:                             │
│  - подключение к дрону (TCP / Serial)               │
│  - safety-проверки (высота, скорость, батарея)      │
│  - формирование JSON-ответов                        │
│  - управление камерой, сервоприводом                │
│  - блокирующие вызовы через asyncio.to_thread()     │
└──────────────────────┬──────────────────────────────┘
                       │ pioneer_sdk2 API
┌──────────────────────▼──────────────────────────────┐
│  pioneer_sdk2 — SDK дрона                           │
│  Pioneer(), Camera(), ServoCamera()                 │
│  Протокол связи с автопилотом (TCP/Serial)          │
└──────────────────────┬──────────────────────────────┘
                       │ TCP / UART
                  ┌────▼────┐
                  │  Дрон   │
                  │ Pioneer │
                  │ Mini 2  │
                  └─────────┘
```

### Почему такое разделение

- **server.py** — открытый Python-файл. Содержит только маппинг `@mcp.tool() → runtime.cmd_xxx()`. Никакой логики. Нельзя скомпилировать Cython'ом из-за Pydantic/FastMCP (они используют интроспекцию Python-функций).
- **drone_runtime.py** — компилируется в `.so` через Cython. Вся бизнес-логика, safety-проверки, конфигурация, формирование ответов. Внутренние методы и атрибуты используют Python name mangling (двойное подчёркивание `__`), что делает декомпиляцию `.so` практически бесполезной.

### Async-модель

Pioneer SDK — синхронный. MCP-сервер — асинхронный (asyncio + uvicorn). Совмещение:

- **Блокирующие методы** (`arm`, `takeoff`, `land`, `reboot_board`) — вызываются через `asyncio.to_thread()`, чтобы не блокировать event loop.
- **Fire-and-forget методы** (`go_to_local_point`, `set_manual_speed`, `led_control`) — вызываются напрямую, они не блокируют.
---

## MCP — Model Context Protocol

[MCP](https://modelcontextprotocol.io/) — открытый протокол от Anthropic для взаимодействия LLM с внешними системами. Работает поверх JSON-RPC 2.0.

Три ключевых примитива:

### Tools (инструменты)
Функции, которые LLM может вызывать. Каждый tool имеет имя, описание и JSON Schema параметров. LLM сама решает когда и какой tool вызвать на основе контекста разговора.

Пример: пользователь пишет "Заведи моторы" → LLM вызывает `connect()`, затем `arm()`.

### Resources (ресурсы)
Read-only данные, доступные по URI. Аналог GET-эндпоинтов. LLM может читать их для получения контекста.

Пример: `drone://battery` возвращает `{"voltage": 4.1, "temperature": 32}`.

### Prompts (промпты)
Готовые сценарии — шаблоны сообщений, которые задают LLM определённый план действий.

Пример: промпт `preflight_check` говорит LLM: "прочитай батарею, проверь навигацию, проверь состояние, сообщи готовность".

### Как это работает вместе

1. MCP-клиент (IDE, чат-бот) подключается к серверу
2. Запрашивает список tools, resources, prompts (`tools/list`, `resources/list`, `prompts/list`)
3. Получает JSON Schema каждого tool — LLM знает какие параметры передать
4. Пользователь пишет команду на естественном языке
5. LLM анализирует контекст, выбирает нужные tools, вызывает их последовательно
6. Сервер выполняет команды на дроне, возвращает результат
7. LLM формирует ответ пользователю

---

## Что видит агент (LLM)

Когда MCP-клиент подключается к серверу, он запрашивает `tools/list`, `resources/list`, `prompts/list` и получает JSON-описания. Именно эти JSON-объекты попадают в контекст LLM — по ним модель решает какой tool вызвать, с какими параметрами, и в каком порядке.

LLM **не видит** исходный код `server.py` или `drone_runtime.py`. Она видит только то, что отдаёт MCP-протокол.

### Что видит агент: Tool

Каждый tool — это JSON-объект с именем, описанием (из docstring), схемой входных параметров (из type hints) и схемой выхода:

```json
{
  "name": "get_battery",
  "description": "Получить состояние батареи дрона.\n\nВозвращает JSON: voltage (В) и temperature (°C).\nМинимальное напряжение для полёта: 3.0 В. Рекомендуется проверять перед взлётом.\n\nТребования: дрон должен быть подключён.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "result": {
        "title": "Result",
        "type": "string"
      }
    },
    "required": ["result"],
    "title": "get_batteryOutput"
  }
}
```

Tool с параметрами выглядит так:

```json
{
  "name": "go_to_local_point_body_fixed",
  "description": "Отправить дрон к точке относительно текущей ориентации дрона (body-fixed).\n\n    В отличие от go_to_local_point, координаты задаются относительно тела дрона:\n    X — вперёд по носу дрона, Y — вправо, Z — вверх.\n    Удобно для команд типа \"лети вперёд на 2 метра\".\n\n    Параметры:\n    - x: смещение вперёд в метрах (положительное = вперёд).\n    - y: смещение вправо в метрах (положительное = вправо).\n    - z: высота в метрах. Лимит: |z| ≤ 10 м.\n    - yaw: угол рыскания в радианах (опционально).\n\n    Требования: подключён, в воздухе (IN_SKY), батарея ≥ 3.0 В, высота ≤ 10 м.\n    Fire-and-forget: не ждёт прибытия в точку.\n    ",
  "arguments": {
    "type": "object",
    "properties": {
      "x": {
        "title": "X",
        "type": "number"
      },
      "y": {
        "title": "Y",
        "type": "number"
      },
      "z": {
        "title": "Z",
        "type": "number"
      },
      "yaw": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Yaw"
      }
    },
    "required": [
      "x",
      "y",
      "z"
    ],
    "title": "go_to_local_point_body_fixedArguments"
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "result": {
        "title": "Result",
        "type": "string"
      }
    },
    "required": [
      "result"
    ],
    "title": "go_to_local_point_body_fixedOutput"
  }
}
```

Откуда берётся каждое поле:

| Поле JSON | Откуда в коде |
|-----------|---------------|
| `name` | Имя Python-функции (`def get_battery`) |
| `description` | Docstring функции (весь текст целиком) |
| `inputSchema.properties` | Type hints параметров (`x: float`, `yaw: float \| None`) |
| `inputSchema.required` | Параметры без значения по умолчанию |
| `outputSchema` | Генерируется автоматически из return type (`-> str`, `-> Image`) |

**Вывод:** чем подробнее docstring — тем лучше агент понимает когда и как использовать tool. Лимиты, требования, порядок вызовов — всё это должно быть в docstring, потому что это единственное место, откуда LLM узнаёт о правилах.

### Что видит агент: Server Instructions

При инициализации соединения сервер отправляет поле `instructions` — текстовую инструкцию, которую MCP-клиент может вставить в system prompt агента. Это глобальный контекст, который агент получает ещё до первого вызова tool:

```json
{
  "name": "pioneer-mcp",
  "version": "1.0.0",
  "instructions": "Ты управляешь квадрокоптером Pioneer Mini 2...\n\nПорядок: connect → arm → takeoff → ... → land → disconnect.\nЛимиты: высота ≤ 10 м, скорость ≤ 3 м/с...\n..."
}
```

В `instructions` описаны: жизненный цикл полёта, все лимиты безопасности, формат ответов, особенности навигации (fire-and-forget), работа камеры. Это самый надёжный способ передать агенту «правила игры», потому что instructions попадают в контекст до любого взаимодействия.

> **Важно:** не все MCP-клиенты используют `instructions`. Некоторые кастомные клиенты могут игнорировать. Поэтому критичная информация дублируется в docstrings каждого tool.

### Что видит агент: Resource

Resources — read-only данные по URI. Агент видит список доступных ресурсов:

```json
{
  "uri": "drone://battery",
  "name": "battery_resource",
  "description": "Батарея дрона: напряжение (В) и температура (°C).",
  "mimeType": "text/plain"
}
```

При чтении ресурса агент получает текстовое содержимое (JSON-строку):

```json
{
  "contents": [
    {
      "uri": "drone://battery",
      "text": "{\"voltage\": 4.1, \"temperature\": 32}",
      "mimeType": "text/plain"
    }
  ]
}
```

> Resources дублируют tool-обёртки телеметрии (`get_battery`, `get_telemetry` и т.д.), потому что не все MCP-клиенты умеют читать resources напрямую. Tools работают везде.

### Что видит агент: Prompt

Prompts — готовые сценарии. Агент видит список с именами и описаниями:

```json
{
  "name": "preflight_check",
  "description": "Предполётная проверка: батарея, навигация, состояние, готовность к взлёту."
}
```

При активации промпта агент получает шаблон сообщений — план действий:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Выполни предполётную проверку дрона перед взлётом.\n\n1. Вызови get_battery и проверь напряжение...\n2. Вызови get_flight_state...\n..."
    }
  ]
}
```

### Как агент выбирает tool

1. Пользователь пишет: "Какая батарея?"
2. MCP-клиент передаёт сообщение в LLM вместе со списком всех tools (name + description + inputSchema)
3. LLM получает список tools как часть контекста и учитывает их description при расчёте вероятностей следующего токена. Она не "выбирает" инструмент, функцию напрямую — она генерирует такую последовательность токенов, где наиболее вероятным продолжением может оказаться вызов инструмента get_battery. Если вероятность tool call выше, чем обычного текста, модель выдаёт JSON с именем инструмента и аргументами как следующий шаг.
4. LLM формирует вызов: `{"name": "get_battery", "arguments": {}}`
5. MCP-клиент отправляет `tools/call` на сервер
6. Сервер выполняет функцию, возвращает результат
7. LLM получает `{"voltage": 4.1, "temperature": 32}` и формирует ответ пользователю

Весь «интеллект» — в LLM. Сервер просто исполняет команды и возвращает результат.

---

## Глоссарий

| Термин | Описание |
|--------|----------|
| **MCP** | Model Context Protocol — открытый протокол от Anthropic для взаимодействия LLM с внешними системами. Определяет как агент обнаруживает и вызывает tools, читает resources, использует prompts. |
| **JSON-RPC 2.0** | Протокол удалённого вызова процедур поверх JSON. MCP использует его как транспортный формат: каждый запрос — JSON-объект с полями `jsonrpc`, `method`, `params`, `id`. |
| **Streamable HTTP** | Транспорт MCP, при котором сервер работает как HTTP-сервер. Клиент отправляет JSON-RPC запросы через `POST /mcp`. Поддерживает SSE для стриминга ответов. Альтернативы: stdio (локальный процесс), SSE (устаревший). |
| **Tool** | Функция, которую LLM может вызвать. Имеет имя, описание (description) и JSON Schema параметров (inputSchema). LLM сама решает когда вызвать tool на основе контекста разговора. |
| **Resource** | Read-only данные, доступные по URI (например `drone://battery`). Аналог GET-эндпоинта. LLM может читать ресурсы для получения контекста без побочных эффектов. |
| **Prompt** | Готовый сценарий — шаблон сообщений, который задаёт LLM план действий. Например, `preflight_check` говорит: "проверь батарею, навигацию, состояние". |
| **Instructions** | Текстовая инструкция сервера, передаваемая при инициализации. MCP-клиент может вставить её в system prompt агента. Содержит глобальные правила: порядок команд, лимиты, формат ответов. |
| **JSON Schema** | Стандарт описания структуры JSON-данных. В MCP используется для описания параметров tools (`inputSchema`) — LLM знает какие поля передать, их типы и обязательность. |
| **inputSchema** | JSON Schema параметров tool. Генерируется автоматически из type hints Python-функции. Например, `x: float` → `{"type": "number"}`, `yaw: float \| None = None` → `{"anyOf": [{"type": "number"}, {"type": "null"}], "default": null}`. |
| **outputSchema** | JSON Schema возвращаемого значения tool. Генерируется из return type. Для `-> str` — `{"type": "string"}`, для `-> Image` — бинарные данные (JPEG). |
| **Tool Calling** | Механизм, при котором LLM не просто генерирует текст, а продолжает последовательность токенов в формате, соответствующем вызову внешнего инструмента. Модель, опираясь на контекст и описание доступных tools, предсказывает структурированный вывод (JSON), который интерпретируется системой как вызов функции с аргументами. Ключевой момент: модель не выполняет выбор функции как отдельную операцию. С точки зрения language modeling, это обычное продолжение последовательности токенов, при котором распределение вероятностей смещается в сторону токенов, формирующих JSON-структуру вызова одного из доступных tools. |
| **Fire-and-forget** | Паттерн навигационных команд: команда отправляется дрону и сразу возвращает ответ, НЕ дожидаясь прибытия в точку. Для контроля позиции нужно отдельно вызывать `get_telemetry`. |
| **FastMCP** | Python-библиотека для создания MCP-серверов. Автоматически генерирует JSON Schema из type hints и docstrings Python-функций. |
| **ASGI** | Asynchronous Server Gateway Interface — стандарт для асинхронных Python веб-серверов. Starlette (фреймворк) + uvicorn (сервер) реализуют ASGI. |
| **SSE** | Server-Sent Events — механизм HTTP для стриминга данных от сервера к клиенту. В MCP используется для потоковой передачи ответов через Streamable HTTP. |
---

## Streamable HTTP транспорт

MCP поддерживает несколько транспортов: stdio, SSE, Streamable HTTP. Pioneer MCP использует **Streamable HTTP** — самый современный и гибкий.

### Почему Streamable HTTP, а не stdio

- **stdio** — сервер запускается как дочерний процесс клиента. Подходит для локальных инструментов (линтеры, файловые операции). Не подходит для дрона: сервер должен работать на бортовом компьютере дрона, а клиент — на ноутбуке/телефоне.
- **Streamable HTTP** — сервер работает как обычный HTTP-сервер. Клиент подключается по сети. Поддерживает SSE для стриминга, stateful-сессии, работает через прокси и файрволы.

### Как реализовано

```
__main__.py
    ├── parse_args()           → TransportConfig (host, port, log_level)
    ├── OriginValidationMiddleware  → проверка Origin header (защита от CSRF)
    ├── create_starlette_app() → Starlette app с MCP endpoint на /mcp
    └── run_http_server()      → uvicorn.run(app)
```

- **Starlette** — ASGI-фреймворк, обслуживает HTTP-запросы
- **uvicorn** — ASGI-сервер, запускает Starlette
- **FastMCP.streamable_http_app()** — создаёт Starlette-приложение с MCP-эндпоинтом
- **OriginValidationMiddleware** — проверяет Origin header, разрешает только localhost по умолчанию

Единственный эндпоинт: `POST /mcp` — принимает JSON-RPC запросы, возвращает JSON-RPC ответы.

### Пример запроса

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"arm","arguments":{}}}'
```

---

## Полный список MCP Tools

### Подключение

| Tool | Описание | Параметры |
|------|----------|-----------|
| `connect` | Подключиться к дрону | `tcp?: str`, `serial?: str`, `baudrate?: int` |
| `disconnect` | Отключиться от дрона | — |

### Управление полётом

| Tool | Описание | Параметры |
|------|----------|-----------|
| `arm` | Запустить моторы | `timeout?: int=5`, `retries?: int=0` |
| `disarm` | Остановить моторы | — |
| `takeoff` | Взлёт (с проверкой батареи) | — |
| `land` | Посадка | — |
| `return_to_home` | Возврат на точку взлёта (RTL) | — |
| `emergency_land` | Экстренная посадка (без проверок) | — |

### Навигация

| Tool | Описание | Параметры |
|------|----------|-----------|
| `go_to_local_point` | Полёт к локальной точке (LPS) | `x`, `y`, `z`, `yaw?` |
| `go_to_local_point_body_fixed` | Полёт к точке относительно тела дрона | `x`, `y`, `z`, `yaw?` |
| `go_to_global_point` | Полёт к GPS-точке | `lat`, `lon`, `alt`, `yaw?` |
| `set_velocity` | Задать скорость (глобальная СК) | `vx`, `vy`, `vz`, `yaw_rate` |
| `set_velocity_body_fixed` | Задать скорость (относительно тела) | `vx`, `vy`, `vz`, `yaw_rate` |
| `hold_position` | Зависнуть на месте | — |
| `set_yaw` | Установить угол рыскания | `angle_deg` |

### Периферия

| Tool | Описание | Параметры |
|------|----------|-----------|
| `led_control` | Управление светодиодами | `r`, `g`, `b`, `led_id?=255` |
| `grab_open` | Открыть захват | — |
| `grab_close` | Закрыть захват | — |
| `cargo_grab` | Включить магнитный захват | — |
| `cargo_release` | Выключить магнитный захват | — |

### Камера

| Tool | Описание | Параметры |
|------|----------|-----------|
| `start_camera` | Запустить камеру | `camera_type?="MAIN"` (MAIN / OPT) |
| `stop_camera` | Остановить камеру | — |
| `get_camera_frame` | Получить кадр (JPEG в чат) | `quality?=80`, `max_width?=640` |
| `stream_frame` | Отправить кадр в RTSP-поток | `stream_name?="processed"`, `fps?=30` |

`get_camera_frame` возвращает `Image` — LLM получает JPEG прямо в контекст и может описать что видит, найти объекты, оценить обстановку.

### Сервопривод и система

| Tool | Описание | Параметры |
|------|----------|-----------|
| `set_camera_angle` | Наклон камеры (-80°..+30°) | `angle`, `priority?="LOW"` |
| `reboot_board` | Перезагрузка платы автопилота | — |

### Телеметрия (tool-обёртки)

| Tool | Описание |
|------|----------|
| `get_telemetry` | Состояние, высота, ориентация, позиция, скорость |
| `get_battery` | Напряжение и температура батареи |
| `get_gps` | GPS-позиция, скорость, спутники |
| `get_sensors` | Акселерометр, гироскоп, магнитометр, дальномер |
| `get_flight_state` | Состояние полёта, навигация, подключение |
| `get_camera_status` | Статус камеры (запущена/остановлена, тип) |

---

## MCP Resources

Те же данные, что и tool-обёртки телеметрии, но доступны по URI:

| URI | Описание |
|-----|----------|
| `drone://telemetry` | Основная телеметрия |
| `drone://battery` | Батарея |
| `drone://gps` | GPS |
| `drone://sensors` | Сенсоры |
| `drone://flight_state` | Состояние полёта |
| `drone://camera` | Статус камеры |

Resources дублируют tool-обёртки, потому что не все MCP-клиенты умеют читать resources напрямую. Когда поддержка появится повсеместно — tool-обёртки можно убрать.

---

## MCP Prompts

| Prompt | Описание |
|--------|----------|
| `preflight_check` | Предполётная проверка: батарея → навигация → состояние → готовность |
| `safe_return` | Безопасное возвращение: проверка состояния → RTL или land → подтверждение |
| `fly_circle_plan` | Полёт по кругу: запрос параметров → расчёт точек → последовательный облёт |

---

## Система безопасности

Встроена в `DroneRuntime` (компилируется в `.so`, не видна снаружи).

Перед каждой полётной командой автоматически проверяется:

| Проверка | Лимит | Где срабатывает |
|----------|-------|-----------------|
| Высота | ≤ 10 м | `go_to_local_point`, `go_to_global_point` |
| Скорость | ≤ 3 м/с (вектор) | `set_velocity`, `set_velocity_body_fixed` |
| Батарея | ≥ 3.5 В | `takeoff`, все навигационные команды |
| Yaw rate | ≤ 1.82 рад/с | `set_velocity`, `set_velocity_body_fixed` |
| Состояние полёта | IN_SKY | все навигационные команды |
| Подключение | connected | все команды |

`emergency_land` — единственная команда, которая обходит все проверки. Используется в критических ситуациях.

Все ответы — JSON:
```json
{"success": true, "message": "Взлёт выполнен"}
{"success": false, "message": "Высота 15 м превышает лимит 10 м"}
```

---

## Камера и компьютерное зрение

Pioneer Mini 2 поддерживает две камеры: основную (MAIN) и оптическую (OPT).

Два драйвера (выбирается автоматически через `pioneer_sdk2` CONFIG):
- **GStreamer** — захват через shared memory (`/tmp/...`), для бортового запуска
- **RTSP** — захват по сети, для удалённого подключения

### Получение кадра в чат LLM

```
Пользователь: "Что видит камера?"
    ↓
LLM вызывает: start_camera() → get_camera_frame()
    ↓
Runtime: Camera.get_cv_frame() → cv2.resize() → cv2.imencode(JPEG)
    ↓
MCP: Image(data=jpeg_bytes, format="jpeg")
    ↓
LLM получает изображение в контекст, описывает что видит
```

### RTSP-стриминг обработанных кадров

`stream_frame` позволяет отправлять обработанные кадры обратно в RTSP-поток через `ImageViewer` (только GStreamer-драйвер). Полезно для визуализации результатов CV-обработки.

### Сервопривод камеры

`set_camera_angle` управляет наклоном камеры от -80° (вниз) до +30° (вверх). Три приоритета: HIGH, MEDIUM, LOW. Связь через Unix-сокет `/tmp/servo.sock`.

---

## Внутреннее устройство (для разработчиков)

Этот раздел описывает как код работает на уровне реализации: жизненный цикл объектов, паттерны инициализации, обработка ошибок, async-модель.

### Последовательность запуска

```
python -m src --host 0.0.0.0 --port 8080
    │
    ▼
__main__.py: main()
    │
    ├── parse_args() → TransportConfig(host, port, log_level)
    │
    ├── from .server import mcp          ← импорт server.py
    │       │
    │       ├── mcp = FastMCP(...)       ← создаётся MCP-сервер (регистрация tools/resources/prompts)
    │       └── _r = DroneRuntime()      ← создаётся singleton runtime (все поля = None)
    │
    ├── create_starlette_app(mcp, config)
    │       │
    │       ├── mcp.streamable_http_app() → Starlette app с endpoint POST /mcp
    │       └── add_middleware(OriginValidationMiddleware)
    │
    └── uvicorn.run(app)                 ← HTTP-сервер запущен, ждёт запросы
```

В момент запуска **ни один реальный объект не создан**: нет подключения к дрону, нет камеры, нет сервопривода. `DroneRuntime` существует как пустая оболочка с `None` во всех полях. Реальные объекты создаются лениво, по первому вызову соответствующего tool.

### DroneRuntime — Singleton

`DroneRuntime` реализован через `__new__` (не `__init__`). Сколько бы раз ни вызвали `DroneRuntime()` — вернётся один и тот же экземпляр:

```python
class DroneRuntime:
    _instance: DroneRuntime | None = None

    def __new__(cls) -> DroneRuntime:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.__p = None       # Pioneer — подключение к дрону
            cls._instance.__conn = False   # флаг подключения
            cls._instance.__cam = None     # Camera — видеопоток
            cls._instance.__cam_t = None   # CameraType (MAIN / OPT)
            cls._instance.__srv = None     # ServoCamera — сервопривод
            cls._instance.__iv = None      # ImageViewer — RTSP-стриминг
        return cls._instance
```

Почему singleton: MCP-сервер обслуживает множество запросов, но дрон один. Все tool-вызовы должны работать с одним и тем же подключением, одной камерой, одним сервоприводом. Singleton гарантирует это без глобальных переменных.

### Карта объектов и их жизненный цикл

В `DroneRuntime` живут 4 независимых объекта из `pioneer_sdk2`. Каждый создаётся в свой момент и по-своему:

```
Объект          Тип              Когда создаётся              Когда уничтожается
─────────────── ──────────────── ──────────────────────────── ──────────────────────────
self.__p        Pioneer          cmd_connect()                cmd_disconnect() / cmd_reboot()
self.__cam      Camera           cmd_start_camera()           cmd_stop_camera() / cmd_disconnect()
self.__srv      ServoCamera      cmd_set_camera_angle()       cmd_disconnect() (= None)
self.__iv       ImageViewer      cmd_stream_frame()           cmd_disconnect()
```

Ни один из них не создаётся в конструкторе. Все — lazy-init при первом вызове.

#### `self.__p` — Pioneer (подключение к дрону)

Создаётся в `cmd_connect()` через `asyncio.to_thread(Pioneer, ...)` — конструктор `Pioneer` блокирующий (устанавливает TCP/Serial соединение), поэтому выносится в отдельный поток.

```python
# cmd_connect — создание
self.__p = await asyncio.to_thread(Pioneer, serial=serial, tcp=_tcp, baudrate=_br)
self.__conn = True

# cmd_disconnect — уничтожение
await asyncio.to_thread(self.__p.close_connection)
self.__p = None
self.__conn = False
```

`self.__p` — центральный объект. Через него идут все команды дрону: `arm()`, `takeoff()`, `land()`, `go_to_local_point()`, `get_battery_status()`, `get_orientation()` и т.д. Без него работают только камера и сервопривод.

`self.__conn` — булевый флаг, дублирующий состояние подключения. Нужен потому что `self.__p` может быть не-None, но соединение уже потеряно (см. `__hexc`).

#### `self.__cam` — Camera (видеопоток)

Создаётся в `cmd_start_camera()`. Перед созданием вызывается `_ensure_camera_imports()` — отложенный импорт.

```python
# cmd_start_camera — создание
_ensure_camera_imports()          # импорт Camera, CameraType (один раз)
self.__stop_cam()                 # остановить предыдущую камеру если была
ct = _CameraType[camera_type]    # "MAIN" → CameraType.MAIN
self.__cam = _Camera(ct)          # создание Camera
self.__cam_t = ct                 # запоминаем тип
```

Камера **не зависит от подключения к дрону** (`self.__p`). Можно вызвать `start_camera` без `connect` — камера работает через свой собственный канал (GStreamer shared memory или RTSP).

`self.__cam_t` хранит тип камеры (MAIN/OPT) для отображения в `res_camera()`.

#### `self.__srv` — ServoCamera (сервопривод)

Создаётся при первом вызове `cmd_set_camera_angle()`:

```python
if self.__srv is None:
    self.__srv = ServoCamera()    # подключение через Unix-сокет /tmp/servo.sock
```

`ServoCamera` не зависит ни от `Pioneer`, ни от `Camera`. Общается с сервоприводом через отдельный Unix-сокет. Создаётся один раз и переиспользуется.

#### `self.__iv` — ImageViewer (RTSP-стриминг)

Создаётся при первом вызове `cmd_stream_frame()`:

```python
if self.__iv is None:
    _ensure_camera_imports()
    if _ImageViewer is None:
        return self.__err("ImageViewer недоступен (только gstreamer)")
    self.__iv = _ImageViewer()
```

`ImageViewer` доступен только при GStreamer-драйвере камеры. При RTSP-драйвере `_ImageViewer` будет `None` (импорт не упадёт, но класс не найдётся).

### Отложенный импорт камеры

`Camera`, `CameraType` и `ImageViewer` не импортируются на верхнем уровне модуля. Вместо этого используется функция `_ensure_camera_imports()`:

```python
_Camera = None
_CameraType = None
_ImageViewer = None

def _ensure_camera_imports():
    global _Camera, _CameraType, _ImageViewer
    if _Camera is not None:
        return                              # уже импортировано
    try:
        from pioneer_sdk2 import Camera, CameraType
        _Camera = Camera
        _CameraType = CameraType
    except ImportError:
        raise RuntimeError("Камера недоступна")
    try:
        from pioneer_sdk2 import ImageViewer
        _ImageViewer = ImageViewer           # может не быть — это нормально
    except ImportError:
        pass
```

Зачем: `Camera` тянет за собой GStreamer-биндинги или RTSP-клиент. Если сервер запущен на машине без камеры (например, для тестирования tool-описаний), импорт `Camera` упадёт. Отложенный импорт позволяет серверу запуститься и обслуживать не-камерные tools даже без GStreamer.

`ImageViewer` импортируется отдельным try/except — он есть только в GStreamer-сборке. Его отсутствие не ошибка, просто `stream_frame` вернёт `{"success": false}`.

### Обработка ошибок и потеря соединения

Все публичные методы (`cmd_*`) обёрнуты в try/except и **никогда не бросают исключения наружу**. Вместо этого возвращают JSON-строку с `{"success": false, "message": "..."}`.

Специальный случай — потеря соединения. Метод `__hexc` вызывается в каждом except-блоке:

```python
def __hexc(self, exc: Exception) -> None:
    _lg.error("Ошибка Pioneer: %s", exc)
    if self.__p is not None and self.__p.messenger is None:
        self.__conn = False
        _lg.warning("Соединение с дроном потеряно")
```

`Pioneer.messenger` — внутренний объект SDK, отвечающий за TCP/Serial соединение. Если он `None` — соединение разорвано (дрон выключился, обрыв сети, таймаут). `__hexc` детектирует это и сбрасывает `self.__conn = False`, после чего все последующие команды будут возвращать "Дрон не подключён" через `__chk()`.

### Цепочка safety-проверок

Перед каждой командой выполняется цепочка проверок. Каждая проверка — отдельный метод, возвращающий `None` (ок) или JSON-строку с ошибкой:

```python
# Пример: cmd_go_to_local_point_bf
for c in (self.__chk(), self.__chk_sky(), self.__chk_alt(z), self.__chk_bat()):
    if c:
        return c    # первая непройденная проверка → сразу возврат ошибки
```

| Метод | Что проверяет | Возвращает при ошибке |
|-------|---------------|----------------------|
| `__chk()` | `self.__conn == True` | "Дрон не подключён" |
| `__chk_sky()` | `fly_state == IN_SKY` | "Дрон не в воздухе, выполните arm и takeoff" |
| `__chk_alt(z)` | `abs(z) ≤ __MAX_ALT` (10 м) | "Высота X м превышает лимит 10 м" |
| `__chk_spd(vx,vy,vz)` | `√(vx²+vy²+vz²) ≤ __MAX_SPD` (3 м/с) | "Скорость X м/с превышает лимит 3 м/с" |
| `__chk_bat()` | `voltage ≥ __MIN_BAT` (3.0 В) | "Напряжение батареи X В ниже минимума 3.0 В" |

Проверки комбинируются по-разному для разных команд:

| Команда | Проверки |
|---------|----------|
| `takeoff` | `__chk` → `__chk_bat` |
| `go_to_local_point_bf` | `__chk` → `__chk_sky` → `__chk_alt` → `__chk_bat` |
| `set_velocity` | `__chk` → `__chk_sky` → yaw_rate → `__chk_spd` → `__chk_bat` |
| `emergency_land` | `__chk` (только подключение, остальное пропускается) |
| `led_control` | `__chk` (только подключение) |
| `start_camera` | ничего (камера независима от дрона) |

### Async-модель: блокирующие vs неблокирующие вызовы

Pioneer SDK полностью синхронный. MCP-сервер работает в asyncio event loop (uvicorn). Если вызвать блокирующий метод SDK напрямую из async-функции — event loop заблокируется и сервер перестанет отвечать на другие запросы.

Решение: `asyncio.to_thread()` для блокирующих операций.

```python
# Блокирующие — через to_thread (ждут ответа от автопилота):
self.__p = await asyncio.to_thread(Pioneer, serial=serial, tcp=_tcp, baudrate=_br)
r = await asyncio.to_thread(self.__p.arm, timeout, retries)
r = await asyncio.to_thread(self.__p.takeoff)
r = await asyncio.to_thread(self.__p.land)
r = await asyncio.to_thread(self.__p.reboot_board)
await asyncio.to_thread(self.__p.close_connection)

# Неблокирующие — напрямую (отправляют команду и сразу возвращают):
self.__p.go_to_local_point_body_fixed(x, y, z, yaw)
self.__p.set_manual_speed(vx, vy, vz, yaw_rate)
self.__p.led_control(led_id, r, g, b)
self.__p.disarm()
self.__p.rtl()
self.__p.set_yaw(angle_deg)
```

Критерий: если метод SDK ждёт подтверждения от автопилота (ACK) — он блокирующий. Если просто отправляет UDP/TCP пакет — неблокирующий.

### Формат ответов

Все `cmd_*` методы возвращают JSON-строку через два хелпера:

```python
def __ok(self, msg: str, data: dict | None = None) -> str:
    r = {"success": True, "message": msg}
    if data is not None:
        r["data"] = data
    return json.dumps(r, ensure_ascii=False)

def __err(self, msg: str) -> str:
    return json.dumps({"success": False, "message": msg}, ensure_ascii=False)
```

Примеры:
```json
{"success": true, "message": "Моторы запущены"}
{"success": true, "message": "Команда полёта к точке (body-fixed) отправлена", "data": {"x": 1.0, "y": 0.0, "z": 1.5, "yaw": null}}
{"success": false, "message": "Высота 15 м превышает лимит 10.0 м"}
{"success": false, "message": "Дрон не подключён"}
```

`ensure_ascii=False` — чтобы кириллица в сообщениях не экранировалась в `\uXXXX`.

Телеметрийные методы (`res_*`) возвращают JSON напрямую, без обёртки `success/message`:
```json
{"voltage": 4.1, "temperature": 32}
{"error": "Дрон не подключён"}
```

### Name mangling и защита от декомпиляции

Все внутренние атрибуты и методы используют двойное подчёркивание (`__`):

```python
self.__p           # → _DroneRuntime__p
self.__conn        # → _DroneRuntime__conn
self.__MAX_ALT     # → _DroneRuntime__MAX_ALT
self.__chk_bat()   # → _DroneRuntime__chk_bat()
```

Python автоматически переименовывает их в `_DroneRuntime__xxx` (name mangling). В скомпилированном `.so` (Cython) эти имена превращаются в нечитаемые символы C — декомпиляция `.so` не даст осмысленного кода.

Публичные методы (`cmd_*`, `res_*`, `get_frame_jpeg`, `connected`) — без двойного подчёркивания, потому что они вызываются из `server.py`.

### Связь server.py ↔ drone_runtime.py

`server.py` — тонкий маппинг. Каждый `@mcp.tool()` — это async-функция из одной строки, которая делегирует вызов в `DroneRuntime`:

```python
_r = DroneRuntime()    # singleton, создаётся при импорте server.py

@mcp.tool()
async def arm(timeout: int = 5, retries: int = 0) -> str:
    """Запустить моторы дрона. ..."""       ← docstring → description для LLM
    return await _r.cmd_arm(timeout, retries)  ← делегация в runtime
```

FastMCP автоматически:
1. Берёт имя функции (`arm`) → `name` в JSON
2. Берёт docstring → `description` в JSON
3. Берёт type hints параметров (`timeout: int = 5`) → `inputSchema` в JSON Schema
4. Регистрирует функцию как обработчик `tools/call` с `name="arm"`

`server.py` не содержит никакой логики — ни проверок, ни try/except, ни формирования ответов. Всё это в `drone_runtime.py`.

Исключение — `get_camera_frame`: здесь `server.py` оборачивает `bytes` в `Image(data=..., format="jpeg")`, потому что `Image` — это MCP-тип из `fastmcp`, и он не должен просачиваться в runtime.

---

## Структура проекта

```
pioneer-mcp/
├── src/
│   ├── __init__.py          # пустой, нужен для пакета
│   ├── __main__.py          # точка входа, Streamable HTTP транспорт, CLI-аргументы
│   ├── server.py            # MCP-слой: регистрация tools/resources/prompts
│   └── drone_runtime.py     # ядро: вся логика (компилируется в .so)
├── scripts/
│   ├── setup_conda.sh       # создание conda-окружения
│   └── setup_uv.sh          # создание uv-окружения
└── README.md
```

### После Cython-сборки (дистрибутив)

```
src/
├── __init__.py                                    # Python (открытый)
├── __main__.py                                    # Python (открытый, точка входа)
├── server.py                                      # Python (открытый, тонкие обёртки)
└── drone_runtime.cpython-312-x86_64-linux-gnu.so  # скомпилированный (закрытый)
```

---

## Установка и запуск (разработка)

### Требования

- Python ≥ 3.12
- gcc / g++ (для Cython-компиляции)
- pioneer_sdk2 (SDK дрона)

### Через conda

```bash
./scripts/setup_conda.sh pioneer-mcp-dev 3.12
conda activate pioneer-mcp-dev
python3 -m src --host 127.0.0.1 --port 8080
```

### Через uv

```bash
./scripts/setup_uv.sh 3.12
source .venv/bin/activate
python3 -m src --host 127.0.0.1 --port 8080
```

### Вручную

```bash
python3 -m venv --prompt pioneer-mcp .venv
source .venv/bin/activate
pip install mcp uvicorn starlette pioneer_sdk2 opencv-python numpy
python3 -m src --host 127.0.0.1 --port 8080
```

Если запуск производится на Mini2, то команда запуска следующая:

```bash
python3 -m src --host 0.0.0.0 --port 8423 --allowed-hosts 10.42.0.1
```

### CLI-аргументы

| Аргумент | По умолчанию | Описание |
|----------|-------------|----------|
| `--host` | `127.0.0.1` | Адрес для прослушивания |
| `--port` | `8080` | Порт |
| `--log-level` | `INFO` | Уровень логирования (DEBUG, INFO, WARNING, ERROR) |

---

### Name mangling

Все внутренние атрибуты и методы `DroneRuntime` используют двойное подчёркивание:

```python
self.__p          # Pioneer instance
self.__conn       # connection state
self.__MAX_ALT    # altitude limit
self.__chk_bat()  # battery check
```

Python превращает их в `_DroneRuntime__p`, `_DroneRuntime__chk_bat` и т.д. В скомпилированном `.so` эти имена не видны в читаемом виде.

## Подключение к MCP-клиенту

## Если MCP-сервер запущен на хосте:

### Cursor

В `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Kiro / VS Code

В `.kiro/settings/mcp.json` (или `~/.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Claude Desktop

В `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

## Если MCP-сервер запущен на Mini2

Команда для запуска на Mini2:

```bash
python3 -m src --host 0.0.0.0 --port 8423 --allowed-hosts 10.42.0.1
```

На хосте в LM Studio пишем:

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://10.42.0.1:8423/mcp"
    },
  }
}
```

### Любой MCP-клиент

Streamable HTTP endpoint: `POST http://<host>:<port>/mcp`

### LM Studio

[LM Studio](https://lmstudio.ai/) позволяет запускать локальные LLM (Llama, Mistral, Qwen и др.) и подключать к ним MCP-серверы. Это значит, что дроном можно управлять полностью оффлайн, без облачных API — модель крутится на твоём GPU.

1. Открой LM Studio, загрузи модель с поддержкой tool calling (например, `Qwen3.5`, `Mistral`).

2. Перейди в раздел **Developer**.

3. Вверху найти иконку `mcp.json`, нажми на нёё и в открывшемся окне введи:

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

или

```json
{
  "mcpServers": {
    "pioneer-mcp": {
      "url": "http://10.42.0.1:8423/mcp"
    },
  }
}
```

4. Убедись, что pioneer-mcp запущен.

5. В чате LM Studio, в правом sidebar, появятся tools из pioneer-mcp. Модель сможет вызывать `arm`, `takeoff`, `get_camera_frame` и т.д.

**Важно:** Важно: не все локальные модели корректно поддерживают tool calling. Оптимальной является модель, которая сочетает vision, tool calling и reasoning. На практике была проверена Qwen3.5-9B — она стабильно работает с инструментами, поддерживает обработку изображений, корректно понимает JSON Schema и при этом полностью помещается в видеопамять бюджетной видеокарты (~6.55 GB с квантизацей Q4_K_M). При наличии большего объёма видеопамяти имеет смысл выбирать более крупные и мощные модели, при условии сохранения поддержки vision, tool calling и reasoning. Чем больше модель — тем надёжнее tool calling. Для управления дроном рекомендуется минимум 7B параметров.

---

## Примеры промптов

Вот что можно писать в чат LLM, подключённой к pioneer-mcp. Модель сама разберётся какие tools вызвать.

> **⚠️ Важно о сложных промптах.**
> Результат выполнения напрямую зависит от качества промпта и способностей модели. Простые и односложные команды (`покажи батарею`, `подключись` и т.д.) проверены и работают стабильно на всех протестированных моделях. Сложные многошаговые сценарии (спирали, патрулирование, аэросъёмка по сетке) требуют модель с сильным reasoning и надёжным tool calling — не каждая модель корректно разложит такой промпт на последовательность вызовов. 

**⚠️ Не все сложные промпты из списка ниже были проверены на реальном дроне.** Перед использованием сложных сценариев необходимо:
> 1. Протестировать промпт на конкретной модели (разные LLM ведут себя по-разному).
> 2. Сначала попросить модель показать план действий без выполнения ("не выполняй, просто покажи план").
> 3. Убедиться что модель не пропускает safety-критичные шаги (проверка батареи, состояния полёта).
> 4. Проверить в безопасной зоне перед реальным полётом.
>
> Чем сложнее промпт — тем важнее выбор модели. Для многошаговых миссий рекомендуются модели от 14B+ параметров с подтверждённой поддержкой tool calling.

### Простые (для начала)

```
Подключись к дрону
```

```
Какая батарея?
```

```
Покажи телеметрию
```

```
Включи красные светодиоды
```

```
Помигай лэдками
```

### Бытовые

```
Взлети, повернись на 90 градусов и сядь обратно
```

```
Лети вперёд на 2 метра и вернись назад
```

```
Поднимись на 1.5 метра и а потом сядь
```

```
Подключись к минику по serial "/dev/ttyUSB0" 115200. Получи телеметрию и выведи RPY
```

```
Посмотри камерой вниз и скажи что видишь
```

```
Сделай фотку и опиши что на ней
```

```
Открой захват, подожди 3 секунды, закрой
```

### Средние (миссии)

```
Выполни предполётную проверку. Если всё ок — взлети на 2 метра, 
сделай квадрат 1x1 метр и сядь.
```

```
Облети комнату по периметру: точки (0,0,1.5), (2,0,1.5), (2,2,1.5), (0,2,1.5). 
После каждой точки жди 2 секунды и делай фото.
```

```
Подключись, проверь батарею. Если напряжение выше 3.8В — взлети и сделай 
круг радиусом 1 метр. Если ниже — скажи что лететь опасно.
```

```
Взлети, наклони камеру вниз на -60 градусов, сделай снимок, 
потом наклони на 0 и сделай ещё один. Сравни два кадра.
```

### Школьные / образовательные

```
Я учу физику. Подними дрон на 1 метр, потом на 2, потом на 3. 
После каждого подъёма покажи высоту с датчика. 
Я хочу понять как работает барометр.
```

```
Покажи мне как работает система координат дрона. 
Лети на 1 метр по X, потом на 1 метр по Y, потом на 1 по Z. 
После каждого перемещения покажи текущую позицию.
```

```
Объясни что такое yaw, pitch и roll. 
Покажи текущие значения ориентации дрона и поверни его на 45 градусов по yaw.
```

```
Сделай эксперимент: взлети, задай скорость 0.5 м/с вперёд на 2 секунды, 
потом останови. Покажи пройденное расстояние по данным LPS. 
Совпадает ли с расчётом 0.5 * 2 = 1 метр?
```

### Продвинутые

```
Выполни полёт по спирали: начни с радиуса 0.5м на высоте 1м, 
увеличивай радиус на 0.1м каждые 30 градусов, 
одновременно поднимаясь на 0.05м за шаг. 3 полных витка.
```

```
Реализуй patrol-режим: лети между точками A(0,0,1.5) и B(3,0,1.5) 
туда-обратно. На каждой точке делай фото и проверяй батарею. 
Если батарея ниже 3.6В — возвращайся домой.
```

```
Калибровка магнитометра: взлети на 1м, медленно поворачивайся 
(yaw_rate = 0.3 рад/с) и каждые 30 градусов читай показания магнитометра. 
Построй таблицу: угол → (mx, my, mz). Сделай полный оборот 360°.
```

```
Протестируй точность навигации: лети в точку (1, 0, 1), 
подожди стабилизации, прочитай реальную позицию из LPS. 
Повтори для точек (0, 1, 1), (-1, 0, 1), (0, -1, 1). 
Посчитай среднюю ошибку позиционирования в метрах.
```

```
Сравни два режима навигации: сначала лети в точку (2, 0, 1.5) через 
go_to_local_point, замерь время. Потом вернись и лети туда же через 
set_velocity с постоянной скоростью 0.5 м/с, замерь время. 
Какой способ точнее?
```

### Научные / исследовательские

```
Проведи аэросъёмку зоны 3x3 метра с шагом 1 метр (сетка 4x4 точки). 
На каждой точке: зависни, наклони камеру на -80°, сделай снимок. 
Высота полёта 2 метра. Покажи все 16 снимков.
```

```
Исследование воздушных потоков: взлети на 1.5м, зависни на 30 секунд. 
Каждую секунду читай акселерометр и гироскоп. 
В конце покажи максимальные отклонения по каждой оси — 
это покажет турбулентность в помещении.
```

```
Оцени время автономного полёта: взлети, зависни на месте. 
Каждые 10 секунд читай напряжение батареи. 
Когда напряжение упадёт на 0.1В от начального — сядь. 
Покажи график разряда (время → напряжение) и экстраполируй 
полное время полёта до 3.5В.
```

### Программерские

```
Напиши мне последовательность вызовов tools чтобы дрон 
нарисовал в воздухе букву "П": два вертикальных столба и перекладина сверху. 
Размер буквы 2x2 метра. Не выполняй, просто покажи план.
```

```
Дебаг: подключись, прочитай ВСЮ телеметрию (телеметрия, батарея, GPS, 
сенсоры, состояние полёта, статус камеры). Выведи всё в одном 
структурированном отчёте. Отметь аномалии если есть.
```

```
Стресс-тест навигации: отправь 10 команд go_to_local_point подряд 
с интервалом 0.5 секунды в случайные точки в радиусе 1 метра. 
Проверь что дрон не крашнулся и вернулся в исходную позицию.
```

```
Мониторинг: каждые 5 секунд читай батарею, высоту и позицию. 
Выводи в формате CSV. Продолжай пока я не скажу стоп.
```

### Экстремальные

```
СЯДЬ НЕМЕДЛЕННО
```

```
Экстренная посадка, всё выключи
```

```
Дрон улетает, верни его домой СЕЙЧАС
```

---

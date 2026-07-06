FROM --platform=linux/amd64 python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglu1-mesa \
    libcurl4 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

    
RUN curl -sSL https://install.python-poetry.org | python3 -
ENV PATH="/root/.local/bin:$PATH"

COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi --no-root

COPY metashape*.whl /tmp/

RUN mv /tmp/metashape*.whl /tmp/metashape-2.3.1-cp310-abi3-linux_x86_64.whl && \
    pip install /tmp/metashape-2.3.1-cp310-abi3-linux_x86_64.whl && \
    rm /tmp/metashape-2.3.1-cp310-abi3-linux_x86_64.whl

COPY src ./src

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

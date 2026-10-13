FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root user; /data is the volume-mounted photo + DB store.
RUN useradd --create-home --uid 10001 apiuser \
    && mkdir -p /data \
    && chown -R apiuser:apiuser /data /srv

USER apiuser

VOLUME ["/data"]
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

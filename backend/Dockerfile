# Use lightweight Python base image
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm


COPY . .

EXPOSE 8080

# Run with Gunicorn
CMD ["gunicorn", "run:app", "--bind", "0.0.0.0:8080", "--workers", "4", "--threads", "4", "--timeout", "600"]

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
COPY discover.py index.html /app/
WORKDIR /data
EXPOSE 8085
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8085/health',timeout=4)"
ENTRYPOINT ["python", "/app/discover.py"]

FROM python:3.12-alpine
WORKDIR /app
COPY chat_server.py .
ENV PYTHONUNBUFFERED=1 DB_PATH=/data/chat.db PORT=8087
VOLUME /data
EXPOSE 8087
CMD ["python", "chat_server.py"]

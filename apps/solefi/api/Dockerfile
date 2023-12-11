FROM python:3.9.7

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

COPY . .

RUN python3 -m pip install -r requirements.txt

CMD [ "/bin/sh", "docker-entrypoint.sh" ]

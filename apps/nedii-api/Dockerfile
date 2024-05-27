FROM python:3.12.1

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

COPY . .

RUN python3 -m pip install -r requirements.txt

RUN rm -f /etc/localtime \
    && ln -sv /usr/share/zoneinfo/America/Denver /etc/localtime \
    && echo "America/Denver" > /etc/timezone

CMD [ "/bin/sh", "docker-entrypoint.sh" ]

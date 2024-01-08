FROM golang:1.21.4-alpine

WORKDIR /app
COPY . .

RUN go mod download
RUN go mod verify
RUN go build -o app

EXPOSE 3000
CMD ["./app"]
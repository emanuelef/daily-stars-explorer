FROM golang:1.21.1-alpine as builder
WORKDIR /app
COPY app ./app
COPY position ./position
COPY client ./client
COPY mongo ./mongo
COPY utils ./utils
COPY go.mod .
COPY go.sum .
RUN go mod download
RUN go build -o air-tr ./app/main.go

FROM alpine:latest AS runner
WORKDIR /app
COPY app/CBAD29136431F1561C2FD46073567A72.txt .
ENV OTEL_SERVICE_NAME=AirTr
ENV OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io:443
ENV OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=NMqf4vWfg4QkgHjeIBRj7d
COPY --from=builder /app/air-tr .
EXPOSE 8099
ENTRYPOINT ["./air-tr"]
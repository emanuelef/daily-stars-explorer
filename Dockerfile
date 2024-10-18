FROM node:14.17.0-alpine AS website
WORKDIR /app
COPY website /app/website
RUN cd website && npm install && npm run build

FROM golang:1.23.2-alpine AS builder
WORKDIR /app
COPY main.go .
COPY cache ./cache
COPY otel_instrumentation ./otel_instrumentation
COPY session ./session
COPY news ./news
COPY go.mod .
COPY go.sum .
RUN go mod download
RUN go build -o gh_stats_app ./main.go

FROM alpine:latest AS runner
WORKDIR /home/app
COPY --from=builder /app/gh_stats_app .
COPY --from=website /app/website/dist ./website/dist
EXPOSE 8080
ENTRYPOINT ["./gh_stats_app"]
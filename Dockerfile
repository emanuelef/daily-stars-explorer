FROM node:23-alpine AS website
ENV VITE_HOST=""
WORKDIR /build
COPY website .
RUN npm install && npm run build
RUN ls -la /build/dist

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
COPY --from=website /build/dist ./website/dist
EXPOSE 8080
ENTRYPOINT ["./gh_stats_app"]
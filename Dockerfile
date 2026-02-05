FROM node:24-alpine AS website
ENV VITE_HOST=""
WORKDIR /build
COPY website .
RUN npm install --force && npm run build
RUN ls -la /build/dist

FROM golang:1.26-rc-alpine AS builder
WORKDIR /app
# Copy go.mod and go.sum first to cache dependencies
COPY go.mod go.sum ./
RUN go mod download
# Then copy source code
COPY main.go .
COPY cache ./cache
COPY config ./config
COPY handlers ./handlers
COPY news ./news
COPY otel_instrumentation ./otel_instrumentation
COPY routes ./routes
COPY session ./session
COPY types ./types
COPY utils ./utils
RUN go build -o gh_stats_app ./main.go

FROM alpine:latest AS runner
WORKDIR /home/app
COPY --from=builder /app/gh_stats_app .
COPY --from=website /build/dist ./website/dist
EXPOSE 8080
ENTRYPOINT ["./gh_stats_app"]
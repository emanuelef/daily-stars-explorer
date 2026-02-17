# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:25-alpine AS website
ENV VITE_HOST=""
WORKDIR /build
# Copy package files first to cache npm install
COPY website/package.json website/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install --force --prefer-offline --no-audit --no-fund
# Then copy source code (changes here won't invalidate npm install cache)
COPY website .
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.26.0-alpine AS builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
# Copy go.mod and go.sum first to cache dependencies
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download
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
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o gh_stats_app ./main.go

FROM alpine:latest AS runner
WORKDIR /home/app
COPY --from=builder /app/gh_stats_app .
COPY --from=website /build/dist ./website/dist
EXPOSE 8080
ENTRYPOINT ["./gh_stats_app"]

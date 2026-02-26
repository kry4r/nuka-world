FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o nuka ./cmd/nuka

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/nuka .
COPY --from=builder /app/configs ./configs
COPY --from=builder /app/migrations ./migrations
EXPOSE 3210
CMD ["./nuka"]

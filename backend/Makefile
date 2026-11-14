.PHONY: up down run test lint build migrate-new

up: ## Start db + api with hot reload
	docker compose up --build

down: ## Stop the dev stack
	docker compose down

run: ## Run the API locally (needs DATABASE_URL, see .env.example)
	go run ./cmd/api

test: ## Run unit tests with the race detector
	go test -race ./...

lint: ## Run golangci-lint
	golangci-lint run ./...

build: ## Build the API binary
	CGO_ENABLED=0 go build -o bin/api ./cmd/api

migrate-new: ## Create a new migration: make migrate-new name=create_users
	@test -n "$(name)" || (echo "usage: make migrate-new name=<snake_case_name>" && exit 1)
	docker run --rm -v "$(CURDIR)/migrations:/migrations" migrate/migrate:v4.20.1 \
		create -ext sql -dir /migrations -seq $(name)

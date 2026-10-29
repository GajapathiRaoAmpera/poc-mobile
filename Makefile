# poc-mobile — run `make` or `make help` to list targets.
.DEFAULT_GOAL := help
.PHONY: help install env add start start-clear android ios typecheck lint test test-watch \
        test-file doctor fix-deps check clean

help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

## --- Setup ---
install: ## Install deps (npm ci, from lockfile)
	npm ci

env: ## Create .env.local from .env.example (won't overwrite)
	@test -f .env.local && echo ".env.local already exists" || (cp .env.example .env.local && echo "Created .env.local — use your LAN IP, not localhost")

add: ## Add an SDK-compatible package: make add P=expo-camera
	@test -n "$(P)" || (echo "Usage: make add P=<package>" && exit 1)
	npx expo install $(P)

## --- Run (development build, not Expo Go) ---
start: ## Start the Metro dev server
	npm start

start-clear: ## Start Metro with a cleared cache
	npx expo start --clear

android: ## Build + run on Android device/emulator
	npm run android

ios: ## Build + run on iOS simulator (macOS only)
	npm run ios

## --- Quality ---
typecheck: ## TypeScript check
	npm run typecheck

lint: ## ESLint (src)
	npx eslint src

test: ## Jest tests
	npm test

test-watch: ## Jest in watch mode
	npx jest --watch

test-file: ## Run one test file: make test-file F=src/__tests__/x.test.ts
	@test -n "$(F)" || (echo "Usage: make test-file F=path/to/file.test.ts" && exit 1)
	npx jest $(F)

doctor: ## Diagnose dependency/config issues
	npx expo-doctor

fix-deps: ## Fix SDK-incompatible package versions
	npx expo install --fix

check: typecheck lint test doctor ## All checks from the README (pre-push check)

clean: ## Remove Expo/Metro caches
	rm -rf .expo node_modules/.cache

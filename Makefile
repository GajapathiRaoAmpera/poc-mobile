# poc-mobile (Flutter) — run `make` or `make help` to list targets.
.DEFAULT_GOAL := help
.PHONY: help install env run apk icons analyze test check clean

DEFINES := --dart-define-from-file=.env.local

help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'

install: ## Fetch packages
	flutter pub get

env: ## Create .env.local from .env.example (won't overwrite)
	@test -f .env.local && echo ".env.local already exists" || (cp .env.example .env.local && echo "Created .env.local — use your LAN IP, not localhost")

run: ## Run on the connected device/emulator (debug)
	flutter run $(DEFINES)

apk: ## Point the app at this laptop's current Wi-Fi IP and build the release APK
	@IP=$$(ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($$i=="src") print $$(i+1)}'); \
	printf 'API_URL=http://%s:8000\nWEB_URL=http://%s:3000\n' $$IP $$IP > .env.local; \
	echo "Building APK for http://$$IP:8000"
	flutter build apk --release $(DEFINES)
	@echo "APK: build/app/outputs/flutter-apk/app-release.apk"

icons: ## Regenerate launcher icons from assets/
	dart run flutter_launcher_icons

analyze: ## Static analysis
	flutter analyze

test: ## Unit tests
	flutter test

check: analyze test ## All checks (pre-push)

clean: ## Remove build outputs
	flutter clean

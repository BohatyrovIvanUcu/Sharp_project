.PHONY: help up start down logs test lint aws-deploy aws-backend-migrate aws-frontend-publish aws-destroy

-include .env
export

AWS_REGION ?= us-east-1
PROJECT_NAME ?= sharp
ARCH ?= arm64
DOCKER_PLATFORM := $(if $(filter arm64,$(ARCH)),linux/arm64,linux/amd64)

help:
	@echo "Sharp commands:"
	@echo "  make start                  - Start PostgreSQL (pgvector), FastAPI backend, and React frontend via Docker Compose"
	@echo "  make up                     - Start stack and watch for file changes"
	@echo "  make down                   - Stop Docker Compose services"
	@echo "  make test                   - Run backend (pytest) and frontend (vitest) tests"
	@echo "  make lint                   - Run ruff, tsc, eslint, and terraform fmt checks"
	@echo "  make aws-deploy             - Provision Cognito, Aurora Serverless v2, Lambda + Bedrock VPCE, CloudFront via Terraform"
	@echo "  make aws-backend-migrate    - Run Alembic migrations (including pgvector extension) in AWS Lambda"
	@echo "  make aws-frontend-publish   - Build and upload frontend bundle to S3 + invalidate CloudFront"
	@echo "  make aws-destroy            - Tear down all Terraform-managed AWS infrastructure"

.env:
	cp .env.example .env

start: .env
	docker compose up --build --wait

up: .env
	docker compose up --build --wait
	docker compose watch

down:
	docker compose down

logs:
	docker compose logs -f

test:
	cd backend && uv run pytest -v
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run typecheck && npm run lint
	terraform -chdir=infra fmt -check

aws-deploy:
	@aws sts get-caller-identity >/dev/null
	@terraform -chdir=infra init
	@echo "=== Step 1/5: Provisioning ECR & Cognito ==="
	@terraform -chdir=infra apply -auto-approve \
		-var="region=$(AWS_REGION)" \
		-var="project_name=$(PROJECT_NAME)" \
		-var="architecture=$(ARCH)" \
		-var="image_uri=placeholder" \
		-target=aws_ecr_repository.backend \
		-target=aws_ecr_lifecycle_policy.backend \
		-target=aws_cognito_user_pool.main \
		-target=aws_cognito_user_pool_domain.main \
		-target=aws_cognito_user_pool_client.main
	@echo "=== Step 2/5: Building & Pushing Lambda Container Image ==="
	@ECR_URL=$$(terraform -chdir=infra output -raw ecr_repository_url) && \
		IMAGE_TAG=$$(date -u +%Y%m%d%H%M%S) && \
		aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $${ECR_URL%/*} && \
		docker build --platform $(DOCKER_PLATFORM) --provenance=false --sbom=false --load -f backend/Dockerfile.lambda -t $$ECR_URL:$$IMAGE_TAG -t $$ECR_URL:latest backend && \
		docker push $$ECR_URL:$$IMAGE_TAG && \
		docker push $$ECR_URL:latest && \
		POOL_ID=$$(terraform -chdir=infra output -raw cognito_user_pool_id) && \
		JWKS=$$(curl -fsSL "https://cognito-idp.$(AWS_REGION).amazonaws.com/$$POOL_ID/.well-known/jwks.json" | tr -d '\n') && \
		echo "=== Step 3/5: Applying Full Infrastructure (Aurora Serverless v2 + Bedrock VPCE + Lambda + CloudFront) ===" && \
		terraform -chdir=infra apply -auto-approve \
			-var="region=$(AWS_REGION)" \
			-var="project_name=$(PROJECT_NAME)" \
			-var="architecture=$(ARCH)" \
			-var="image_uri=$$ECR_URL:$$IMAGE_TAG" \
			-var="cognito_jwks=$$JWKS"
	@$(MAKE) aws-backend-migrate
	@$(MAKE) aws-frontend-publish
	@echo "=== Deployment Complete ==="
	@echo "Live HTTPS URL: $$(terraform -chdir=infra output -raw site_url)"

aws-backend-migrate:
	@echo "=== Step 4/5: Running Database Migrations & pgvector Setup in AWS Lambda ==="
	@FN=$$(terraform -chdir=infra output -raw lambda_function_name) && \
		aws lambda invoke --region $(AWS_REGION) --cli-read-timeout 120 --function-name $$FN --cli-binary-format raw-in-base64-out --payload '{"action":"migrate"}' /tmp/sharp-migrate.json >/dev/null && \
		cat /tmp/sharp-migrate.json && echo "" && \
		python3 -c 'import json; d=json.load(open("/tmp/sharp-migrate.json")); assert d.get("status")=="migrated", d'

aws-frontend-publish:
	@echo "=== Step 5/5: Updating Cognito OAuth Callback URLs, Building Frontend & Publishing to S3 / CloudFront ==="
	@SITE_URL=$$(terraform -chdir=infra output -raw site_url) && \
		terraform -chdir=infra apply -auto-approve \
			-var="region=$(AWS_REGION)" \
			-var="project_name=$(PROJECT_NAME)" \
			-var="architecture=$(ARCH)" \
			-var="image_uri=placeholder" \
			-var="app_url=$$SITE_URL" \
			-target=aws_cognito_identity_provider.google \
			-target=aws_cognito_user_pool_client.main && \
		POOL_ID=$$(terraform -chdir=infra output -raw cognito_user_pool_id) && \
		CLIENT_ID=$$(terraform -chdir=infra output -raw cognito_client_id) && \
		DOMAIN=$$(terraform -chdir=infra output -raw cognito_domain) && \
		GOOGLE_ENABLED=$$(terraform -chdir=infra output -raw cognito_google_enabled) && \
		BUCKET=$$(terraform -chdir=infra output -raw frontend_bucket) && \
		DIST_ID=$$(terraform -chdir=infra output -raw cloudfront_distribution_id) && \
		cd frontend && \
		VITE_COGNITO_REGION=$(AWS_REGION) \
		VITE_COGNITO_USER_POOL_ID=$$POOL_ID \
		VITE_COGNITO_CLIENT_ID=$$CLIENT_ID \
		VITE_COGNITO_DOMAIN=$$DOMAIN \
		VITE_COGNITO_GOOGLE=$$GOOGLE_ENABLED \
		VITE_API_URL= \
		npm run build && \
		aws s3 sync dist "s3://$$BUCKET" --delete && \
		aws cloudfront create-invalidation --distribution-id $$DIST_ID --paths "/*" >/dev/null

aws-destroy:
	terraform -chdir=infra destroy \
		-var="region=$(AWS_REGION)" \
		-var="project_name=$(PROJECT_NAME)" \
		-var="architecture=$(ARCH)" \
		-var="image_uri=placeholder"

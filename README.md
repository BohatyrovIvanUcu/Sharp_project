# Sharp — Interactive Cognitive Anti-Procrastination Tool

> **Mission:** *Help you think, never replace your thinking.*  
> Sharp is a dehumanized cognitive instrument designed to break start paralysis and prevent "cognitive helplessness." Unlike generic chatbots that hand out ready-made essays or code, Sharp refuses to do the work for you. Instead, it guides you through a tight 3-question Socratic blitz with clickable hypothesis buttons, matches past cognitive blockers via **pgvector** memory, and locks you into a progressive micro-step **Pomodoro** execution plan.

---

## Key Features

1. **Interactive Socratic Workspace (Not Just a Chat Box)**
   - **3-Phase Anti-Procrastination Pipeline:** Problem Intake → Socratic Blitz (hard cap of 3 crisp questions) → Progressive Micro-Step Plan + Pomodoro Timer.
   - **Anti-Solution Guardrail:** Prompts such as *"Write the lab code for me"* trigger a refusal barrier and redirect the user into decomposing the problem themselves.
   - **1-Click Hypothesis Buttons (Hotkeys `1`–`4`):** Overcome blank-page paralysis with structured clickable options or short custom input.
   - **Progressive Step Unlock & Stuck Splitter:** Only Step #1 (a 2–5 min physical action) is unlocked initially. Clicking **"Stuck"** splits that step via AWS Bedrock into 1–3 minute micro-actions.

2. **Curated Thinking & Decomposition Library (`/api/frameworks`)**
   - Includes 6 structured frameworks: **Socratic Inquiry**, **5 Whys**, **First Principles**, **Inversion (Pre-Mortem)**, **2-Minute Kickstart**, and **Feynman Gap Finder**.
   - Bedrock system prompts dynamically embed the active framework overlay; users can inspect the cognitive mechanism or switch frameworks mid-session.

3. **Modular System Prompts & pgvector Episodic Memory**
   - **`PromptComposer` (4 layers):** `Core Constitution` + `Framework Overlay` + `pgvector Memory & Cognitive Profile` + `Phase Tool Schema`.
   - **Amazon Titan Embeddings v2 + Aurora `pgvector`:** Every completed start is embedded into a 1024-dim vector so future sessions surface *Memory Insights* from similar past blockers.

4. **Bilingual UI (UA / EN)**
   - Interface switches seamlessly between Ukrainian (default) and English; the AI automatically responds in the language of the user's task.

---

## Repository Structure

```text
.
├── backend/              # FastAPI + SQLAlchemy 2 + Alembic + pgvector + AWS Bedrock + Mangum
│   ├── app/
│   │   ├── ai/           # Curated frameworks, 4-layer PromptComposer, Bedrock Converse & Titan v2 memory
│   │   ├── routers/      # /api/health, /api/me, /api/frameworks, /api/sessions, /api/memory
│   │   ├── models.py     # User, ThinkingSession, SessionTurn, ActionStep, MemoryEmbedding (Vector 1024)
│   │   ├── auth.py       # Cognito JWT verification (with local dev fallback)
│   │   └── lambda_handler.py
│   ├── alembic/          # Schema migrations + CREATE EXTENSION vector
│   ├── tests/            # Pytest suite (Socratic flow, guardrails, step lock, pgvector memory)
│   ├── Dockerfile
│   └── Dockerfile.lambda
├── frontend/             # React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query
│   ├── src/
│   │   ├── components/   # PomodoroStepRunner, FrameworkLibraryView, MemoryProfileView, FrameworkDialog
│   │   ├── pages/        # WorkspacePage, LoginPage, SignUpPage, ConfirmPage
│   │   └── lib/          # Typed API client, Cognito browser auth, UA/EN i18n
│   ├── Dockerfile
│   └── nginx.conf
├── infra/                # Terraform IaC for cost-optimized AWS deployment (us-east-1)
│   ├── auth.tf           # Amazon Cognito User Pool + App Client
│   ├── backend.tf        # Private VPC (no NAT), Aurora Serverless v2 (min 0 ACU), Bedrock VPCE, Lambda + ECR
│   ├── frontend.tf       # Private S3 + CloudFront (serves SPA + proxies /api/* to Lambda Function URL)
│   ├── variables.tf
│   ├── outputs.tf
│   └── versions.tf
├── compose.yaml          # Local stack: pgvector/pgvector:pg16 + FastAPI + React/Nginx
├── Makefile              # Local dev, test, lint, and AWS Terraform deploy automation
└── README.md
```

---

## Cloud Architecture (AWS Low-Cost Serverless)

```mermaid
flowchart LR
    U[Browser] -->|HTTPS| CF[CloudFront CDN]
    U -->|Sign-up / Sign-in| COG[Amazon Cognito]
    CF -->|/* static SPA| S3[(Private S3 Bucket)]
    CF -->|/api/* proxy| URL[Lambda Function URL]
    subgraph VPC["Private VPC (2 AZs, $0 NAT Gateway)"]
        URL --> L[AWS Lambda arm64<br/>FastAPI + Mangum]
        L -->|:5432| DB[(Aurora Serverless v2<br/>PostgreSQL 16 + pgvector<br/>MinCapacity = 0 ACU)]
        L -->|HTTPS :443| VPCE[VPC Interface Endpoint<br/>bedrock-runtime]
    end
    VPCE --> BR[AWS Bedrock<br/>Nova Lite + Titan Embed v2]
```

**Cost optimization:**
- **Zero NAT Gateway & Zero ALB:** Lambda runs in private subnets and accesses Bedrock via a PrivateLink VPC Interface Endpoint while Aurora Serverless v2 auto-pauses at `0 ACU` after 5 minutes of idle time (`DB_NULL_POOL=true`).
- **Offline-verifiable JWTs:** Cognito JWKS are injected into Lambda environment variables at deploy time so token verification requires zero outbound internet calls.
- **Same-origin CloudFront routing:** CloudFront routes `/api/*` directly to the Lambda Function URL over HTTPS, avoiding CORS preflight overhead.

---

## Quick Start (Local Development)

### Option 1: Docker Compose (Recommended)

```bash
# 1. Create .env once if it does not exist yet
cp -n .env.example .env

# 2. Start PostgreSQL (pgvector), FastAPI backend, and React frontend
make start
# or in detached background mode:
docker compose up -d --build --wait
```

- **App UI:** http://localhost:3000 (or `http://localhost:<FRONTEND_PORT>` if customized in `.env`, e.g. `http://localhost:3002` in the local setup). Auth runs in local dev mode when `COGNITO_USER_POOL_ID` is empty — any email/password opens the workspace.
- **API Docs (Swagger):** http://localhost:8000/api/docs (or `http://localhost:<BACKEND_PORT>/api/docs`).
- **Stop containers when done** (preserves local PostgreSQL data):
  ```bash
  make down
  # or: docker compose down
  ```

### Option 2: Run Backend & Frontend Directly

1. Start PostgreSQL with `pgvector`:
   ```bash
   docker compose up -d db
   ```
2. Run backend:
   ```bash
   cd backend
   uv sync
   DATABASE_URL=postgresql+psycopg://sharp:sharp_dev_password@localhost:5432/sharp uv run alembic upgrade head
   SEED=true DATABASE_URL=postgresql+psycopg://sharp:sharp_dev_password@localhost:5432/sharp uv run python -m app.seed
   DATABASE_URL=postgresql+psycopg://sharp:sharp_dev_password@localhost:5432/sharp uv run uvicorn app.main:app --reload
   ```
3. Run frontend:
   ```bash
   cd frontend
   npm install
   npm run dev   # http://localhost:5173
   ```

---

## Tests & Quality Checks

```bash
# Run all tests
make test

# Run linters, typecheck, and Terraform format check
make lint
```

Or run individually:
```bash
cd backend && uv run ruff check . && uv run pytest -v
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd infra && terraform fmt -check && terraform init -backend=false && terraform validate
```

---

## Deploy to AWS

Prerequisites: AWS CLI configured with permissions for Cognito, ECR, VPC, RDS Aurora, Lambda, IAM, S3, CloudFront, and Bedrock model access enabled in `us-east-1` (`us.amazon.nova-lite-v1:0` and `amazon.titan-embed-text-v2:0`), plus Docker and Terraform `>= 1.7`.

```bash
make aws-deploy
```

This single command:
1. Provisions ECR & Amazon Cognito User Pool.
2. Builds the `arm64` Lambda container image (`backend/Dockerfile.lambda`) and pushes it to ECR.
3. Applies the full Terraform stack (VPC, Aurora Serverless v2 with `min_capacity=0`, Bedrock VPC Endpoint, Lambda, S3, CloudFront).
4. Invokes Lambda with `{"action": "migrate"}` to enable `pgvector` and run Alembic migrations.
5. Builds `frontend/` with Cognito environment variables, uploads it to S3, invalidates CloudFront, and prints the live HTTPS URL.

To destroy all AWS resources when finished:

```bash
make aws-destroy
```

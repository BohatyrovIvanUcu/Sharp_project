data "aws_availability_zones" "available" {
  state = "available"
}

# =====================================================================
# ECR Repository for Backend Lambda Container Image
# =====================================================================
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# =====================================================================
# Private VPC (2 AZs for Aurora, zero NAT gateways = $0/month)
# =====================================================================
resource "aws_vpc" "main" {
  cidr_block           = "10.30.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  availability_zone = data.aws_availability_zones.available.names[0]
  cidr_block        = "10.30.1.0/24"

  tags = {
    Name = "${var.project_name}-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  availability_zone = data.aws_availability_zones.available.names[1]
  cidr_block        = "10.30.2.0/24"

  tags = {
    Name = "${var.project_name}-private-2"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

resource "aws_route_table_association" "private_1" {
  subnet_id      = aws_subnet.private_1.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_2" {
  subnet_id      = aws_subnet.private_2.id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend-sg"
  description = "Lambda egress to Aurora PostgreSQL and Bedrock VPC Endpoint"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}

resource "aws_security_group" "db" {
  name        = "${var.project_name}-db-sg"
  description = "Allow PostgreSQL only from backend Lambda"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }
}

resource "aws_security_group" "bedrock_vpce" {
  name        = "${var.project_name}-bedrock-vpce-sg"
  description = "Allow HTTPS to Bedrock Runtime VPC Endpoint from backend Lambda"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_group_ids  = [aws_security_group.bedrock_vpce.id]
}

# =====================================================================
# Aurora Serverless v2 (PostgreSQL 16 + pgvector, scales to 0 ACU)
# =====================================================================
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]
}

resource "aws_rds_cluster" "db" {
  cluster_identifier      = "${var.project_name}-db"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  engine_version          = var.db_engine_version
  database_name           = var.db_name
  master_username         = var.db_username
  master_password         = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  storage_encrypted       = true
  deletion_protection     = true
  backup_retention_period = 1
  skip_final_snapshot     = true

  serverlessv2_scaling_configuration {
    min_capacity             = var.db_min_capacity
    max_capacity             = var.db_max_capacity
    seconds_until_auto_pause = var.db_seconds_until_auto_pause
  }
}

resource "aws_rds_cluster_instance" "db_1" {
  identifier          = "${var.project_name}-db-1"
  cluster_identifier  = aws_rds_cluster.db.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.db.engine
  engine_version      = aws_rds_cluster.db.engine_version
  publicly_accessible = false
}

# =====================================================================
# AWS Lambda (FastAPI + Mangum + Bedrock + pgvector)
# =====================================================================
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/lambda/${var.project_name}-backend"
  retention_in_days = 14
}

resource "aws_iam_role" "backend" {
  name = "${var.project_name}-backend-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backend_vpc" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "backend_bedrock" {
  name = "${var.project_name}-bedrock-access"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/${replace(var.bedrock_model_id, "/^(us|eu|apac)\\./", "")}",
        "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.bedrock_model_id}",
        "arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_embedding_model_id}",
      ]
    }]
  })
}

resource "aws_lambda_function" "backend" {
  function_name = "${var.project_name}-backend"
  package_type  = "Image"
  image_uri     = var.image_uri
  role          = aws_iam_role.backend.arn
  architectures = [var.architecture]
  memory_size   = 512
  timeout       = 60

  depends_on = [
    aws_rds_cluster_instance.db_1,
    aws_cloudwatch_log_group.backend,
  ]

  vpc_config {
    subnet_ids         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
    security_group_ids = [aws_security_group.backend.id]
  }

  environment {
    variables = {
      DB_HOST                    = aws_rds_cluster.db.endpoint
      DB_PORT                    = tostring(aws_rds_cluster.db.port)
      DB_NAME                    = var.db_name
      DB_USER                    = var.db_username
      DB_PASSWORD                = random_password.db.result
      DB_NULL_POOL               = "true"
      ENVIRONMENT                = "production"
      ORIGIN_VERIFY_SECRET       = random_password.origin_verify.result
      CORS_ORIGINS               = join(",", var.cors_origins)
      SEED                       = var.seed
      COGNITO_REGION             = var.region
      COGNITO_USER_POOL_ID       = aws_cognito_user_pool.main.id
      COGNITO_CLIENT_ID          = aws_cognito_user_pool_client.main.id
      COGNITO_JWKS               = var.cognito_jwks
      BEDROCK_REGION             = var.region
      BEDROCK_MODEL_ID           = var.bedrock_model_id
      BEDROCK_EMBEDDING_MODEL_ID = var.bedrock_embedding_model_id
    }
  }
}

resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "backend_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.backend.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "backend_invoke" {
  statement_id             = "FunctionURLAllowInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.backend.function_name
  principal                = "*"
  invoked_via_function_url = true
}

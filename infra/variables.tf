variable "region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for all resources (CloudFront, Bedrock, Cognito, Lambda, Aurora)"
}

variable "project_name" {
  type        = string
  default     = "sharp"
  description = "Prefix applied to AWS resource names"
}

variable "architecture" {
  type        = string
  default     = "arm64"
  description = "Lambda container architecture (arm64 or x86_64)"
}

variable "image_uri" {
  type        = string
  description = "ECR image URI for the backend Lambda container"
}

variable "cognito_jwks" {
  type        = string
  default     = ""
  description = "JSON string of Cognito JWKS public keys so VPC Lambda verifies JWT offline"
}

variable "cors_origins" {
  type        = list(string)
  default     = ["http://localhost:3000", "http://localhost:3002", "http://localhost:5173"]
  description = "Allowed CORS origins for direct Lambda Function URL calls"
}

variable "bedrock_model_id" {
  type        = string
  default     = "us.amazon.nova-lite-v1:0"
  description = "AWS Bedrock foundation model ID for Socratic diagnosis & planning"
}

variable "bedrock_embedding_model_id" {
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
  description = "AWS Bedrock embedding model ID for pgvector memory"
}

variable "db_name" {
  type    = string
  default = "sharp"
}

variable "db_engine_version" {
  type        = string
  default     = "16.15"
  description = "Aurora PostgreSQL engine version supporting Serverless v2 auto-pause"
}

variable "db_username" {
  type    = string
  default = "sharp"
}

variable "db_min_capacity" {
  type        = number
  default     = 0
  description = "Minimum Aurora Serverless v2 ACUs (0 enables auto-pause after idle)"
}

variable "db_max_capacity" {
  type    = number
  default = 1
}

variable "db_seconds_until_auto_pause" {
  type    = number
  default = 300
}

variable "seed" {
  type    = string
  default = "true"
}

variable "app_url" {
  type        = string
  default     = ""
  description = "Primary HTTPS site URL (CloudFront) for Cognito OAuth callback/logout URLs"
}

variable "google_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "monobank_api_token" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Monobank Acquiring X-Token (sandbox or merchant token)"
}

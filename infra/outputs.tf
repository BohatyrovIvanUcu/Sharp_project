output "site_url" {
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
  description = "Primary HTTPS URL of Sharp (SPA + /api/*)"
}

output "api_url" {
  value       = aws_lambda_function_url.backend.function_url
  description = "Direct AWS Lambda Function URL"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "lambda_function_name" {
  value = aws_lambda_function.backend.function_name
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cognito_region" {
  value = var.region
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.main.id
}

output "cognito_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "cognito_google_enabled" {
  value = local.google_enabled ? "true" : "false"
}

output "aurora_endpoint" {
  value = aws_rds_cluster.db.endpoint
}

output "api_gateway_url" {
  description = "URL of the API Gateway endpoint"
  value       = "${aws_api_gateway_deployment.api_deployment.invoke_url}/${var.environment}"
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution for the web UI"
  value       = aws_cloudfront_distribution.web_distribution.domain_name
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.user_pool.id
}

output "cognito_app_client_id" {
  description = "ID of the Cognito App Client"
  value       = aws_cognito_user_pool_client.client.id
}

output "parquet_data_bucket" {
  description = "Name of the S3 bucket for Parquet data"
  value       = aws_s3_bucket.parquet_data.bucket
}

output "web_hosting_bucket" {
  description = "Name of the S3 bucket for web hosting"
  value       = aws_s3_bucket.web_hosting.bucket
}

output "glue_database_name" {
  description = "Name of the Glue database"
  value       = aws_glue_catalog_database.chatbot_database.name
}

output "glue_crawler_name" {
  description = "Name of the Glue crawler"
  value       = aws_glue_crawler.parquet_crawler.name
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for conversation history"
  value       = aws_dynamodb_table.conversation_history.name
}

output "athena_workgroup_name" {
  description = "Name of the Athena workgroup"
  value       = aws_athena_workgroup.chatbot_workgroup.name
}

output "elasticache_endpoint" {
  description = "Endpoint of the ElastiCache cluster"
  value       = "${aws_elasticache_cluster.results_cache.cache_nodes.0.address}:${aws_elasticache_cluster.results_cache.cache_nodes.0.port}"
}

output "lambda_functions" {
  description = "ARNs of the Lambda functions"
  value = {
    query_processor = aws_lambda_function.query_processor.arn
    sql_executor    = aws_lambda_function.sql_executor.arn
    result_formatter = aws_lambda_function.result_formatter.arn
    memory_manager  = aws_lambda_function.memory_manager.arn
  }
}

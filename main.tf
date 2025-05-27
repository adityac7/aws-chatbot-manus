provider "aws" {
  region = var.aws_region
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0.0"
}

# S3 Buckets
resource "aws_s3_bucket" "parquet_data" {
  bucket = "${var.project_name}-parquet-data-${var.environment}"

  tags = {
    Name        = "${var.project_name}-parquet-data"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "query_results" {
  bucket = "${var.project_name}-query-results-${var.environment}"

  tags = {
    Name        = "${var.project_name}-query-results"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "web_hosting" {
  bucket = "${var.project_name}-web-hosting-${var.environment}"

  tags = {
    Name        = "${var.project_name}-web-hosting"
    Environment = var.environment
  }
}

# S3 Bucket Policies
resource "aws_s3_bucket_policy" "parquet_data_policy" {
  bucket = aws_s3_bucket.parquet_data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = {
          Service = "athena.amazonaws.com"
        }
        Action    = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource  = [
          aws_s3_bucket.parquet_data.arn,
          "${aws_s3_bucket.parquet_data.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "query_results_policy" {
  bucket = aws_s3_bucket.query_results.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = {
          Service = "athena.amazonaws.com"
        }
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource  = [
          aws_s3_bucket.query_results.arn,
          "${aws_s3_bucket.query_results.arn}/*"
        ]
      }
    ]
  })
}

# AWS Glue Database
resource "aws_glue_catalog_database" "chatbot_database" {
  name = "${var.project_name}_database_${var.environment}"
}

# AWS Glue Crawler
resource "aws_glue_crawler" "parquet_crawler" {
  name          = "${var.project_name}-parquet-crawler-${var.environment}"
  role          = aws_iam_role.glue_role.arn
  database_name = aws_glue_catalog_database.chatbot_database.name

  s3_target {
    path = "s3://${aws_s3_bucket.parquet_data.bucket}"
  }

  schema_change_policy {
    delete_behavior = "LOG"
    update_behavior = "UPDATE_IN_DATABASE"
  }

  configuration = jsonencode({
    Version = 1.0
    CrawlerOutput = {
      Partitions = { AddOrUpdateBehavior = "InheritFromTable" }
    }
  })

  tags = {
    Name        = "${var.project_name}-parquet-crawler"
    Environment = var.environment
  }
}

# Lake Formation Resources
resource "aws_lakeformation_resource" "parquet_data_resource" {
  arn = aws_s3_bucket.parquet_data.arn
}

resource "aws_lakeformation_permissions" "parquet_data_permissions" {
  principal   = aws_iam_role.lambda_role.arn
  permissions = ["SELECT", "DESCRIBE"]

  table_with_columns {
    database_name = aws_glue_catalog_database.chatbot_database.name
    name          = "*"
    wildcard      = true
  }
}

# Athena Workgroup
resource "aws_athena_workgroup" "chatbot_workgroup" {
  name = "${var.project_name}-workgroup-${var.environment}"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${aws_s3_bucket.query_results.bucket}/athena-results/"
    }
  }

  tags = {
    Name        = "${var.project_name}-workgroup"
    Environment = var.environment
  }
}

# DynamoDB Table for Conversation History
resource "aws_dynamodb_table" "conversation_history" {
  name           = "${var.project_name}-conversation-history-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "UserId"
  range_key      = "ConversationId"

  attribute {
    name = "UserId"
    type = "S"
  }

  attribute {
    name = "ConversationId"
    type = "S"
  }

  ttl {
    attribute_name = "ExpirationTime"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.project_name}-conversation-history"
    Environment = var.environment
  }
}

# SQS Queue for Query Processing
resource "aws_sqs_queue" "query_queue" {
  name                      = "${var.project_name}-query-queue-${var.environment}"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
  visibility_timeout_seconds = 60

  tags = {
    Name        = "${var.project_name}-query-queue"
    Environment = var.environment
  }
}

# ElastiCache for Results Caching
resource "aws_elasticache_subnet_group" "cache_subnet_group" {
  name       = "${var.project_name}-cache-subnet-group-${var.environment}"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_cluster" "results_cache" {
  cluster_id           = "${var.project_name}-results-cache-${var.environment}"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  engine_version       = "6.x"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.cache_subnet_group.name
  security_group_ids   = [aws_security_group.cache_security_group.id]

  tags = {
    Name        = "${var.project_name}-results-cache"
    Environment = var.environment
  }
}

# Security Group for ElastiCache
resource "aws_security_group" "cache_security_group" {
  name        = "${var.project_name}-cache-sg-${var.environment}"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-cache-sg"
    Environment = var.environment
  }
}

# Cognito User Pool
resource "aws_cognito_user_pool" "user_pool" {
  name = "${var.project_name}-user-pool-${var.environment}"

  username_attributes      = ["email"]
  auto_verify_attributes   = ["email"]
  
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true

    string_attribute_constraints {
      min_length = 7
      max_length = 256
    }
  }

  tags = {
    Name        = "${var.project_name}-user-pool"
    Environment = var.environment
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name                         = "${var.project_name}-client-${var.environment}"
  user_pool_id                 = aws_cognito_user_pool.user_pool.id
  generate_secret              = false
  refresh_token_validity       = 30
  prevent_user_existence_errors = "ENABLED"
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
}

# API Gateway
resource "aws_api_gateway_rest_api" "chatbot_api" {
  name        = "${var.project_name}-api-${var.environment}"
  description = "API Gateway for Chatbot"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "${var.project_name}-api"
    Environment = var.environment
  }
}

# API Gateway Authorizer
resource "aws_api_gateway_authorizer" "cognito_authorizer" {
  name                   = "cognito-authorizer"
  rest_api_id            = aws_api_gateway_rest_api.chatbot_api.id
  type                   = "COGNITO_USER_POOLS"
  provider_arns          = [aws_cognito_user_pool.user_pool.arn]
  identity_source        = "method.request.header.Authorization"
}

# API Gateway Resources and Methods
resource "aws_api_gateway_resource" "query_resource" {
  rest_api_id = aws_api_gateway_rest_api.chatbot_api.id
  parent_id   = aws_api_gateway_rest_api.chatbot_api.root_resource_id
  path_part   = "query"
}

resource "aws_api_gateway_method" "query_post" {
  rest_api_id   = aws_api_gateway_rest_api.chatbot_api.id
  resource_id   = aws_api_gateway_resource.query_resource.id
  http_method   = "POST"
  authorization_type = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito_authorizer.id
}

resource "aws_api_gateway_integration" "query_lambda_integration" {
  rest_api_id             = aws_api_gateway_rest_api.chatbot_api.id
  resource_id             = aws_api_gateway_resource.query_resource.id
  http_method             = aws_api_gateway_method.query_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.query_processor.invoke_arn
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "api_deployment" {
  depends_on = [
    aws_api_gateway_integration.query_lambda_integration
  ]

  rest_api_id = aws_api_gateway_rest_api.chatbot_api.id
  stage_name  = var.environment

  lifecycle {
    create_before_destroy = true
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "web_distribution" {
  origin {
    domain_name = aws_s3_bucket.web_hosting.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.web_hosting.bucket}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.oai.cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.web_hosting.bucket}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.project_name}-web-distribution"
    Environment = var.environment
  }
}

resource "aws_cloudfront_origin_access_identity" "oai" {
  comment = "OAI for ${var.project_name} web hosting"
}

# S3 Bucket Policy for CloudFront
resource "aws_s3_bucket_policy" "web_hosting_policy" {
  bucket = aws_s3_bucket.web_hosting.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${aws_cloudfront_origin_access_identity.oai.id}"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web_hosting.arn}/*"
      }
    ]
  })
}

# Lambda Functions
resource "aws_lambda_function" "query_processor" {
  function_name    = "${var.project_name}-query-processor-${var.environment}"
  filename         = "${path.module}/lambda/query_processor.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/query_processor.zip")
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      SQS_QUEUE_URL = aws_sqs_queue.query_queue.url
      DYNAMODB_TABLE = aws_dynamodb_table.conversation_history.name
      BEDROCK_MODEL_ID = var.bedrock_model_id
    }
  }

  tags = {
    Name        = "${var.project_name}-query-processor"
    Environment = var.environment
  }
}

resource "aws_lambda_function" "sql_executor" {
  function_name    = "${var.project_name}-sql-executor-${var.environment}"
  filename         = "${path.module}/lambda/sql_executor.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/sql_executor.zip")
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 60
  memory_size      = 512

  environment {
    variables = {
      ATHENA_WORKGROUP = aws_athena_workgroup.chatbot_workgroup.name
      ATHENA_DATABASE = aws_glue_catalog_database.chatbot_database.name
      RESULTS_BUCKET = aws_s3_bucket.query_results.bucket
    }
  }

  tags = {
    Name        = "${var.project_name}-sql-executor"
    Environment = var.environment
  }
}

resource "aws_lambda_function" "result_formatter" {
  function_name    = "${var.project_name}-result-formatter-${var.environment}"
  filename         = "${path.module}/lambda/result_formatter.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/result_formatter.zip")
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      REDIS_HOST = aws_elasticache_cluster.results_cache.cache_nodes.0.address
      REDIS_PORT = aws_elasticache_cluster.results_cache.cache_nodes.0.port
    }
  }

  tags = {
    Name        = "${var.project_name}-result-formatter"
    Environment = var.environment
  }
}

resource "aws_lambda_function" "memory_manager" {
  function_name    = "${var.project_name}-memory-manager-${var.environment}"
  filename         = "${path.module}/lambda/memory_manager.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/memory_manager.zip")
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.conversation_history.name
      MAX_CONVERSATIONS = 30
    }
  }

  tags = {
    Name        = "${var.project_name}-memory-manager"
    Environment = var.environment
  }
}

# Lambda Event Source Mapping
resource "aws_lambda_event_source_mapping" "sqs_mapping" {
  event_source_arn = aws_sqs_queue.query_queue.arn
  function_name    = aws_lambda_function.sql_executor.function_name
  batch_size       = 1
}

# IAM Roles
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-lambda-role"
    Environment = var.environment
  }
}

resource "aws_iam_role" "glue_role" {
  name = "${var.project_name}-glue-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "glue.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-glue-role"
    Environment = var.environment
  }
}

# IAM Policies
resource "aws_iam_policy" "lambda_policy" {
  name        = "${var.project_name}-lambda-policy-${var.environment}"
  description = "Policy for Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.parquet_data.arn,
          "${aws_s3_bucket.parquet_data.arn}/*",
          aws_s3_bucket.query_results.arn,
          "${aws_s3_bucket.query_results.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetDatabase",
          "glue:GetDatabases"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.query_queue.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = aws_dynamodb_table.conversation_history.arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticache:DescribeCacheClusters"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_policy" "glue_policy" {
  name        = "${var.project_name}-glue-policy-${var.environment}"
  description = "Policy for Glue crawler"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.parquet_data.arn,
          "${aws_s3_bucket.parquet_data.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "glue:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# Attach IAM Policies
resource "aws_iam_role_policy_attachment" "lambda_policy_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}

resource "aws_iam_role_policy_attachment" "glue_policy_attachment" {
  role       = aws_iam_role.glue_role.name
  policy_arn = aws_iam_policy.glue_policy.arn
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "query_processor_logs" {
  name              = "/aws/lambda/${aws_lambda_function.query_processor.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-query-processor-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "sql_executor_logs" {
  name              = "/aws/lambda/${aws_lambda_function.sql_executor.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-sql-executor-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "result_formatter_logs" {
  name              = "/aws/lambda/${aws_lambda_function.result_formatter.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-result-formatter-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "memory_manager_logs" {
  name              = "/aws/lambda/${aws_lambda_function.memory_manager.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-memory-manager-logs"
    Environment = var.environment
  }
}

# Auto Scaling for Lambda Concurrency
resource "aws_appautoscaling_target" "lambda_target" {
  max_capacity       = 20
  min_capacity       = 5
  resource_id        = "function:${aws_lambda_function.query_processor.function_name}"
  scalable_dimension = "lambda:function:ProvisionedConcurrency"
  service_namespace  = "lambda"
}

resource "aws_appautoscaling_policy" "lambda_policy" {
  name               = "${var.project_name}-lambda-scaling-policy-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.lambda_target.resource_id
  scalable_dimension = aws_appautoscaling_target.lambda_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.lambda_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "LambdaProvisionedConcurrencyUtilization"
    }
    target_value = 0.75
  }
}

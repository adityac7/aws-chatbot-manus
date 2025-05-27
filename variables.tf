variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project, used as prefix for all resources"
  type        = string
  default     = "text-to-sql-chatbot"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_id" {
  description = "VPC ID where resources will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for resources that require subnets"
  type        = list(string)
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID to use for text-to-SQL conversion"
  type        = string
  default     = "anthropic.claude-v2"
}

variable "max_concurrent_queries" {
  description = "Maximum number of concurrent queries supported"
  type        = number
  default     = 20
}

variable "max_conversation_history" {
  description = "Maximum number of conversations to retain per user"
  type        = number
  default     = 30
}

variable "enable_auto_scaling" {
  description = "Enable auto scaling for Lambda functions"
  type        = bool
  default     = true
}

variable "lambda_min_capacity" {
  description = "Minimum capacity for Lambda auto scaling"
  type        = number
  default     = 5
}

variable "lambda_max_capacity" {
  description = "Maximum capacity for Lambda auto scaling"
  type        = number
  default     = 20
}

variable "elasticache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

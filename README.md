# Terraform AWS Chatbot with Text-to-SQL Capability

This Terraform project sets up a complete AWS infrastructure for a chatbot that can query large Parquet datasets (5-10GB) using text-to-SQL capabilities. The architecture is optimized for performance, cost, and scalability, supporting 100+ users with 20 concurrent queries and conversation memory retention.

## Architecture Features

- **Parquet Data Format**: Optimized columnar storage for efficient querying
- **Conversation Memory**: Retains last 30 conversations per user
- **Concurrency Support**: Handles 20 concurrent questions
- **Scalability**: Auto-scaling and load balancing for 100+ users
- **Performance Optimization**: Caching, queuing, and columnar data access
- **Cost Optimization**: Serverless architecture with auto-scaling

## Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform v1.0.0 or newer
- Node.js and npm for UI development and Lambda packaging
- Parquet data ready for upload (5-10GB)
- AWS account with access to Bedrock (may require requesting access)

## AWS Resources Created

- **S3 Buckets**: For Parquet data, query results, and web hosting
- **AWS Glue**: For cataloging the Parquet data
- **Lake Formation**: For data governance and access control
- **Amazon Athena**: For SQL querying capabilities
- **Amazon Bedrock**: For text-to-SQL conversion
- **AWS Lambda**: For query processing, SQL execution, result formatting, and memory management
- **SQS**: For query queue management
- **DynamoDB**: For conversation history storage
- **ElastiCache**: For results caching
- **API Gateway**: For REST API endpoints
- **Cognito**: For user authentication
- **CloudFront**: For content delivery
- **CloudWatch**: For monitoring and logging

## Deployment Instructions

1. Update the `variables.tf` file with your specific configuration
2. Package Lambda functions:
   ```
   npm install archiver
   node package_lambdas.js
   ```
3. Initialize Terraform:
   ```
   terraform init
   ```
4. Preview the changes:
   ```
   terraform plan
   ```
5. Deploy the infrastructure:
   ```
   terraform apply
   ```
6. Upload your Parquet data to the created S3 bucket
7. Run the AWS Glue crawler to catalog your data
8. Deploy the React UI:
   ```
   cd ui/chatbot-ui
   npm install
   npm run build
   aws s3 sync build/ s3://YOUR_WEB_HOSTING_BUCKET/
   ```

## Post-Deployment Steps

After successful deployment:

1. Update the UI environment variables with the outputs from Terraform
2. Upload your Parquet data to the S3 bucket created by Terraform
3. Run the Glue crawler to create the table schema
4. Test the API endpoint with sample queries
5. Access the UI through the CloudFront distribution URL

## UI Features

- User authentication via Cognito
- Natural language query input
- Conversation history with last 30 conversations
- Real-time query status updates
- Tabular results display
- Responsive design for all devices

## Lambda Functions

- **Query Processor**: Converts natural language to SQL using Bedrock
- **SQL Executor**: Executes SQL queries against Athena
- **Result Formatter**: Formats and caches query results
- **Memory Manager**: Manages conversation history in DynamoDB

## Cost Considerations

This architecture includes several AWS services that incur costs:
- S3 storage costs for your data
- Athena query execution costs
- Bedrock API usage costs
- Lambda invocation costs
- API Gateway request costs
- DynamoDB storage and read/write costs
- ElastiCache costs

Monitor your usage to avoid unexpected charges.

## Security Considerations

- Fine-grained access control with IAM and Lake Formation
- User authentication with Cognito
- Secure API access with API Gateway
- Data encryption at rest and in transit

## Customization

You can customize this solution by:
- Modifying the Lambda functions to support different query patterns
- Extending the UI with additional features
- Adding more data sources through Glue
- Implementing additional security measures

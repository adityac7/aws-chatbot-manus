from diagrams import Diagram, Cluster, Edge
from diagrams.aws.storage import S3
from diagrams.aws.analytics import Athena, Glue, LakeFormation
from diagrams.aws.compute import Lambda, LambdaFunction
from diagrams.aws.network import APIGateway, ElasticLoadBalancing
from diagrams.aws.security import Cognito, IAM
from diagrams.aws.ml import Rekognition
from diagrams.aws.network import CloudFront
from diagrams.aws.general import Users
from diagrams.onprem.client import User
from diagrams.aws.database import ElastiCache
from diagrams.aws.management import AutoScaling
from diagrams.aws.integration import SQS
from diagrams.aws.management import CloudwatchEventTimeBased as CloudWatch

# Create the diagram
with Diagram("AWS Chatbot with Text-to-SQL Architecture (Parquet Optimized)", show=False, filename="architecture_diagram_optimized", outformat="png"):
    
    # User and Frontend
    with Cluster("User Interface"):
        user = User("End User")
        ui = Lambda("React UI")
        
        user >> ui
    
    # API and Authentication Layer
    with Cluster("API & Auth Layer"):
        api_gateway = APIGateway("API Gateway")
        auth = Cognito("Cognito")
        elb = ElasticLoadBalancing("Load Balancer")
        
        ui >> api_gateway
        ui >> auth
        api_gateway >> elb
    
    # Compute and Processing Layer
    with Cluster("Processing Layer"):
        auto_scaling = AutoScaling("Auto Scaling")
        
        with Cluster("Query Processing"):
            query_lambda = LambdaFunction("Query Processor")
            sqs = SQS("Query Queue")
            
        with Cluster("SQL Execution"):
            sql_lambda = LambdaFunction("SQL Executor")
            
        with Cluster("Result Handling"):
            result_lambda = LambdaFunction("Result Formatter")
            cache = ElastiCache("Results Cache")
        
        elb >> auto_scaling
        auto_scaling >> query_lambda
        query_lambda >> sqs
        sqs >> sql_lambda
        sql_lambda >> result_lambda
        result_lambda >> cache
        cache >> api_gateway
    
    # Monitoring
    with Cluster("Monitoring & Logging"):
        cloudwatch = CloudWatch("CloudWatch")
        
        query_lambda >> cloudwatch
        sql_lambda >> cloudwatch
        result_lambda >> cloudwatch
    
    # AI/ML Layer
    with Cluster("AI/ML Layer"):
        bedrock = Rekognition("Amazon Bedrock")
        
        query_lambda >> bedrock
        bedrock >> sql_lambda
    
    # Data Layer
    with Cluster("Data Layer"):
        athena = Athena("Athena")
        lake_formation = LakeFormation("Lake Formation")
        glue_db = Glue("Glue Database")
        glue_crawler = Glue("Glue Crawler")
        s3_data = S3("Parquet Data Bucket")
        s3_results = S3("Query Results Bucket")
        iam = IAM("Fine-grained Access")
        
        sql_lambda >> athena
        athena >> lake_formation
        lake_formation >> s3_data
        athena >> s3_results
        glue_crawler >> s3_data
        glue_crawler >> glue_db
        athena >> glue_db
        lake_formation >> iam
        iam >> s3_data
    
    # Content Delivery
    with Cluster("Content Delivery"):
        cdn = CloudFront("CloudFront")
        s3_web = S3("Web Hosting Bucket")
        
        cdn >> s3_web
        ui >> cdn

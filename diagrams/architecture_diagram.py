from diagrams import Diagram, Cluster, Edge
from diagrams.aws.storage import S3
from diagrams.aws.analytics import Athena, Glue
from diagrams.aws.compute import Lambda
from diagrams.aws.network import APIGateway
from diagrams.aws.security import Cognito
from diagrams.aws.ml import Rekognition
from diagrams.aws.network import CloudFront
from diagrams.aws.general import Users
from diagrams.onprem.client import User

# Create the diagram
with Diagram("AWS Chatbot with Text-to-SQL Architecture", show=False, filename="architecture_diagram", outformat="png"):
    
    # User and Frontend
    with Cluster("User Interface"):
        user = User("End User")
        ui = Lambda("React UI")
        
        user >> ui
    
    # API and Authentication Layer
    with Cluster("API & Auth Layer"):
        api = APIGateway("API Gateway")
        auth = Cognito("Cognito")
        
        ui >> api
        ui >> auth
    
    # Compute and Processing Layer
    with Cluster("Processing Layer"):
        query_lambda = Lambda("Query Processor")
        sql_lambda = Lambda("SQL Executor")
        result_lambda = Lambda("Result Formatter")
        
        api >> query_lambda
        query_lambda >> sql_lambda
        sql_lambda >> result_lambda
        result_lambda >> api
    
    # AI/ML Layer
    with Cluster("AI/ML Layer"):
        bedrock = Rekognition("Amazon Bedrock")
        
        query_lambda >> bedrock
        bedrock >> sql_lambda
    
    # Data Layer
    with Cluster("Data Layer"):
        athena = Athena("Athena")
        glue_db = Glue("Glue Database")
        glue_crawler = Glue("Glue Crawler")
        s3_data = S3("CSV Data Bucket")
        s3_results = S3("Query Results Bucket")
        
        sql_lambda >> athena
        athena >> s3_data
        athena >> s3_results
        glue_crawler >> s3_data
        glue_crawler >> glue_db
        athena >> glue_db
    
    # Content Delivery
    with Cluster("Content Delivery"):
        cdn = CloudFront("CloudFront")
        s3_web = S3("Web Hosting Bucket")
        
        cdn >> s3_web
        ui >> cdn

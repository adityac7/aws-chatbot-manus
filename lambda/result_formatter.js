// Lambda function for Result Formatter
exports.handler = async (event) => {
  const AWS = require('aws-sdk');
  const s3 = new AWS.S3();
  const redis = require('redis');
  const { promisify } = require('util');
  
  try {
    const { userId, conversationId, resultLocation } = event;
    
    // Parse S3 path
    const s3Path = resultLocation.replace('s3://', '');
    const bucketName = s3Path.split('/')[0];
    const objectKey = s3Path.substring(bucketName.length + 1);
    
    // Get results from S3
    const s3Params = {
      Bucket: bucketName,
      Key: objectKey
    };
    
    const s3Response = await s3.getObject(s3Params).promise();
    const resultData = JSON.parse(s3Response.Body.toString());
    
    // Connect to Redis
    const redisClient = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    });
    
    const redisGet = promisify(redisClient.get).bind(redisClient);
    const redisSet = promisify(redisClient.set).bind(redisClient);
    
    // Format results for presentation
    const formattedResult = {
      userId,
      conversationId,
      columns: resultData.columns,
      rows: resultData.rows,
      resultCount: resultData.resultCount,
      executionTime: resultData.executionTime,
      formattedTime: new Date().toISOString()
    };
    
    // Cache results in Redis
    const cacheKey = `result:${userId}:${conversationId}`;
    await redisSet(cacheKey, JSON.stringify(formattedResult), 'EX', 3600); // Cache for 1 hour
    
    // Update DynamoDB with result information
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const updateParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        UserId: userId,
        ConversationId: conversationId
      },
      UpdateExpression: 'set ResultCount = :rc, ExecutionTime = :et, ResultStatus = :rs',
      ExpressionAttributeValues: {
        ':rc': resultData.resultCount,
        ':et': resultData.executionTime,
        ':rs': 'COMPLETED'
      }
    };
    
    await dynamodb.update(updateParams).promise();
    
    // Close Redis connection
    redisClient.quit();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Results formatted successfully',
        conversationId,
        resultCount: resultData.resultCount
      })
    };
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error formatting results',
        error: error.message
      })
    };
  }
};

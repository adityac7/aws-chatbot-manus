// Lambda function for Query Processor
exports.handler = async (event) => {
  const AWS = require('aws-sdk');
  const sqs = new AWS.SQS();
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  const bedrock = new AWS.BedrockRuntime();
  
  try {
    // Parse the incoming request
    const body = JSON.parse(event.body);
    const { query, userId } = body;
    
    // Generate a unique conversation ID
    const conversationId = Date.now().toString();
    
    // Retrieve conversation history for context
    const historyParams = {
      TableName: process.env.DYNAMODB_TABLE,
      KeyConditionExpression: "UserId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId
      },
      Limit: 30,
      ScanIndexForward: false // Get most recent conversations first
    };
    
    const historyResult = await dynamodb.query(historyParams).promise();
    const conversationHistory = historyResult.Items || [];
    
    // Format conversation history for context
    const formattedHistory = conversationHistory.map(item => {
      return {
        role: "user",
        content: item.Query,
        timestamp: item.Timestamp
      };
    });
    
    // Prepare prompt for Bedrock
    const prompt = {
      prompt: `
        You are a SQL query generator. Convert the following natural language query to SQL.
        The data is stored in Parquet format with the following schema:
        - vtionid: string (user identifier)
        - package: string (app package name)
        - date: string (format: DD-MM-YYYY)
        - duration_sum: integer (total duration in seconds)
        - event_count: integer (number of events)
        - event_time_range: string (time range format: HH:MM - HH:MM)
        - day_of_week: string (e.g., Monday, Tuesday)
        - app_name: string (application name)
        - cat: string (category)
        - genre: string (genre or type)
        
        Previous conversation history:
        ${JSON.stringify(formattedHistory)}
        
        User query: ${query}
        
        Return only the SQL query without any explanation.
      `,
      max_tokens_to_sample: 1000,
      temperature: 0.1,
      top_p: 0.9,
    };
    
    // Call Bedrock to convert text to SQL
    const bedrockParams = {
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(prompt)
    };
    
    const bedrockResponse = await bedrock.invokeModel(bedrockParams).promise();
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const sqlQuery = responseBody.completion.trim();
    
    // Send the SQL query to SQS for execution
    const sqsParams = {
      MessageBody: JSON.stringify({
        userId,
        conversationId,
        query,
        sqlQuery,
        timestamp: Date.now()
      }),
      QueueUrl: process.env.SQS_QUEUE_URL
    };
    
    await sqs.sendMessage(sqsParams).promise();
    
    // Store the query in conversation history
    const dynamoParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        UserId: userId,
        ConversationId: conversationId,
        Query: query,
        SqlQuery: sqlQuery,
        Timestamp: Date.now(),
        ExpirationTime: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    };
    
    await dynamodb.put(dynamoParams).promise();
    
    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Query submitted successfully',
        conversationId
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
        message: 'Error processing query',
        error: error.message
      })
    };
  }
};

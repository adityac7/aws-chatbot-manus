// Lambda function for Memory Manager
exports.handler = async (event) => {
  const AWS = require('aws-sdk');
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  
  try {
    const { userId, conversationId, action } = event;
    
    // Handle different actions
    switch (action) {
      case 'getHistory':
        return await getConversationHistory(userId);
      
      case 'pruneHistory':
        return await pruneConversationHistory(userId);
      
      case 'storeResult':
        const { query, result } = event;
        return await storeConversationResult(userId, conversationId, query, result);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error managing conversation memory',
        error: error.message
      })
    };
  }
};

// Get conversation history for a user
async function getConversationHistory(userId) {
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    KeyConditionExpression: 'UserId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    },
    Limit: parseInt(process.env.MAX_CONVERSATIONS, 10),
    ScanIndexForward: false // Get most recent conversations first
  };
  
  const result = await dynamodb.query(params).promise();
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      conversations: result.Items,
      count: result.Count
    })
  };
}

// Prune conversation history to keep only the most recent ones
async function pruneConversationHistory(userId) {
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  
  // Get all conversations for the user
  const queryParams = {
    TableName: process.env.DYNAMODB_TABLE,
    KeyConditionExpression: 'UserId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    },
    ScanIndexForward: false // Get most recent conversations first
  };
  
  const result = await dynamodb.query(queryParams).promise();
  
  // If we have more than MAX_CONVERSATIONS, delete the oldest ones
  const maxConversations = parseInt(process.env.MAX_CONVERSATIONS, 10);
  
  if (result.Items.length > maxConversations) {
    const conversationsToDelete = result.Items.slice(maxConversations);
    
    // Delete each conversation that exceeds the limit
    for (const conversation of conversationsToDelete) {
      const deleteParams = {
        TableName: process.env.DYNAMODB_TABLE,
        Key: {
          UserId: userId,
          ConversationId: conversation.ConversationId
        }
      };
      
      await dynamodb.delete(deleteParams).promise();
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: `Pruned ${conversationsToDelete.length} old conversations`,
        remainingCount: maxConversations
      })
    };
  }
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'No pruning needed',
      currentCount: result.Items.length,
      maxConversations
    })
  };
}

// Store conversation result
async function storeConversationResult(userId, conversationId, query, result) {
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: {
      UserId: userId,
      ConversationId: conversationId,
      Query: query,
      Result: result,
      Timestamp: Date.now(),
      ExpirationTime: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    }
  };
  
  await dynamodb.put(params).promise();
  
  // After storing, check if we need to prune old conversations
  await pruneConversationHistory(userId);
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Conversation stored successfully',
      conversationId
    })
  };
}

// Lambda function for SQL Executor
exports.handler = async (event) => {
  const AWS = require('aws-sdk');
  const athena = new AWS.Athena();
  const s3 = new AWS.S3();
  
  try {
    // Process SQS message
    const sqsRecord = event.Records[0];
    const messageBody = JSON.parse(sqsRecord.body);
    const { userId, conversationId, sqlQuery } = messageBody;
    
    // Execute SQL query using Athena
    const queryParams = {
      QueryString: sqlQuery,
      QueryExecutionContext: {
        Database: process.env.ATHENA_DATABASE
      },
      ResultConfiguration: {
        OutputLocation: `s3://${process.env.RESULTS_BUCKET}/athena-results/${userId}/${conversationId}/`
      },
      WorkGroup: process.env.ATHENA_WORKGROUP
    };
    
    // Start query execution
    const startQueryResponse = await athena.startQueryExecution(queryParams).promise();
    const queryExecutionId = startQueryResponse.QueryExecutionId;
    
    // Wait for query to complete
    let queryStatus = '';
    let attempts = 0;
    const maxAttempts = 20; // Maximum number of attempts
    
    do {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between checks
      
      const queryExecution = await athena.getQueryExecution({ QueryExecutionId: queryExecutionId }).promise();
      queryStatus = queryExecution.QueryExecution.Status.State;
      
      attempts++;
    } while (queryStatus === 'QUEUED' || queryStatus === 'RUNNING' && attempts < maxAttempts);
    
    if (queryStatus === 'FAILED') {
      throw new Error(`Athena query failed: ${queryExecution.QueryExecution.Status.StateChangeReason}`);
    }
    
    if (queryStatus === 'CANCELLED') {
      throw new Error('Athena query was cancelled');
    }
    
    // Get query results
    const queryResultsParams = {
      QueryExecutionId: queryExecutionId,
      MaxResults: 1000 // Adjust based on expected result size
    };
    
    const queryResults = await athena.getQueryResults(queryResultsParams).promise();
    
    // Process and format results
    const columns = queryResults.ResultSet.ResultSetMetadata.ColumnInfo.map(col => col.Name);
    const rows = queryResults.ResultSet.Rows.slice(1).map(row => {
      const rowData = {};
      row.Data.forEach((data, index) => {
        rowData[columns[index]] = data.VarCharValue;
      });
      return rowData;
    });
    
    // Prepare result for the next Lambda
    const resultData = {
      userId,
      conversationId,
      queryExecutionId,
      columns,
      rows,
      resultCount: rows.length,
      executionTime: new Date().toISOString()
    };
    
    // Store results in S3
    const s3Params = {
      Bucket: process.env.RESULTS_BUCKET,
      Key: `processed-results/${userId}/${conversationId}/result.json`,
      Body: JSON.stringify(resultData),
      ContentType: 'application/json'
    };
    
    await s3.putObject(s3Params).promise();
    
    // Invoke the Result Formatter Lambda
    const lambda = new AWS.Lambda();
    const invokeParams = {
      FunctionName: process.env.RESULT_FORMATTER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        userId,
        conversationId,
        resultLocation: `s3://${process.env.RESULTS_BUCKET}/processed-results/${userId}/${conversationId}/result.json`
      })
    };
    
    await lambda.invoke(invokeParams).promise();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'SQL query executed successfully',
        resultLocation: `s3://${process.env.RESULTS_BUCKET}/processed-results/${userId}/${conversationId}/result.json`
      })
    };
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error executing SQL query',
        error: error.message
      })
    };
  }
};

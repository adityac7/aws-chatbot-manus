// Lambda function packaging script
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Create lambda directories if they don't exist
const lambdaDir = path.join(__dirname, 'lambda');
if (!fs.existsSync(lambdaDir)) {
  fs.mkdirSync(lambdaDir, { recursive: true });
}

// Function to create zip files for Lambda functions
function zipLambdaFunction(functionName) {
  const sourceFile = path.join(__dirname, 'lambda', `${functionName}.js`);
  const outputFile = path.join(__dirname, 'lambda', `${functionName}.zip`);
  
  // Create a file to stream archive data to
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level
  });
  
  // Listen for all archive data to be written
  output.on('close', function() {
    console.log(`${functionName}.zip created successfully (${archive.pointer()} bytes)`);
  });
  
  // Catch warnings and errors
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.warn(err);
    } else {
      throw err;
    }
  });
  
  archive.on('error', function(err) {
    throw err;
  });
  
  // Pipe archive data to the file
  archive.pipe(output);
  
  // Add the source file to the archive
  archive.file(sourceFile, { name: 'index.js' });
  
  // Add package.json with dependencies
  const packageJson = {
    name: functionName,
    version: '1.0.0',
    description: `Lambda function for ${functionName}`,
    main: 'index.js',
    dependencies: {
      'aws-sdk': '^2.1000.0'
    }
  };
  
  // Add redis dependency for result_formatter
  if (functionName === 'result_formatter') {
    packageJson.dependencies.redis = '^3.1.2';
  }
  
  archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
  
  // Finalize the archive
  archive.finalize();
}

// Zip all Lambda functions
const lambdaFunctions = [
  'query_processor',
  'sql_executor',
  'result_formatter',
  'memory_manager'
];

lambdaFunctions.forEach(zipLambdaFunction);

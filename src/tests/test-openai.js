const axios = require('axios');
require('dotenv').config();

async function testOpenAI() {
    try {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
        const apiKey = process.env.AZURE_OPENAI_API_KEY;
        
        console.log(`Testing connection to Azure OpenAI...`);
        console.log(`Endpoint: ${endpoint}`);
        console.log(`Deployment: ${deploymentName}`);
        console.log(`API Key exists: ${!!apiKey}`);
        
        const url = `${endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=2024-12-01-preview`;
        
        console.log(`URL: ${url}`);
        
        const response = await axios.post(
            url,
            {
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "Hello, world!" }
                ],
                temperature: 0.7,
                max_tokens: 100
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                }
            }
        );
        
        console.log('Success! Response:');
        console.log(response.data.choices[0].message.content);
        console.log('Token usage:', response.data.usage);
    } catch (error) {
        console.error('Error testing Azure OpenAI:');
        console.error(error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testOpenAI();
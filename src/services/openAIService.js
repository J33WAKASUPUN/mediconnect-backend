const axios = require('axios');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

class OpenAIService {
    constructor() {
        this.apiKey = process.env.AZURE_OPENAI_API_KEY;
        this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        // Make absolutely sure we use the working API version
        this.apiVersion = '2024-12-01-preview'; 
        this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
        
        logger.debug(`OpenAI Service Configuration:`);
        logger.debug(`Endpoint: ${this.endpoint}`);
        logger.debug(`Deployment Name: ${this.deploymentName}`);
        logger.debug(`API Version: ${this.apiVersion}`);
    }

    async generateResponse(messages, temperature = 0.7, maxTokens = 800) {
        try {
            // Using the exact URL format that worked in your test
            const url = `${this.endpoint}openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
            
            logger.info(`Making Azure OpenAI API call at ${getCurrentUTC()}`);
            logger.debug(`URL: ${url}`);

            const response = await axios.post(
                url,
                {
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    top_p: 0.95,
                    frequency_penalty: 0,
                    presence_penalty: 0
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    }
                }
            );

            return {
                content: response.data.choices[0].message.content,
                usage: response.data.usage,
                model: response.data.model
            };
        } catch (error) {
            logger.error(`Azure OpenAI error: ${error.message} at ${getCurrentUTC()}`);

            if (error.response) {
                logger.error(`Response status: ${error.response.status}`);
                logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
                logger.error(`Request URL: ${error.config.url}`);
            }

            throw new Error(error.response?.data?.error?.message || 'Failed to generate AI response');
        }
    }

    async healthChat(userMessage, userType = 'patient', conversationHistory = []) {
        const systemMessage = {
            role: "system",
            content: `You're a health assistant for MediConnect serving both patients and medical professionals. ${userType === 'professional'
                ? 'Use technical medical terminology appropriate for healthcare providers.'
                : 'Use simple explanations appropriate for patients.'
                } Provide evidence-based information, avoid diagnoses/prescriptions, and recommend consulting healthcare providers for serious concerns.`
        };

        const formattedHistory = conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const userMsg = { role: 'user', content: userMessage };
        const messages = [systemMessage, ...formattedHistory, userMsg];

        return this.generateResponse(messages, 0.3);
    }

    async analyzeDocument(documentText, documentType = 'general') {
        const maxChars = 4000;
        const truncatedText = documentText.length > maxChars
            ? documentText.substring(0, maxChars) + "... [content truncated]"
            : documentText;

        let systemPrompt;

        switch (documentType) {
            case 'lab_report':
                systemPrompt = "Analyze this lab report. Identify abnormal values and provide a brief explanation. Be concise.";
                break;
            case 'prescription':
                systemPrompt = "Analyze this medication prescription briefly. List medications, dosages, and key instructions.";
                break;
            case 'medical_notes':
                systemPrompt = "Summarize these clinical notes concisely. Focus on key findings, diagnoses, and follow-up actions.";
                break;
            default:
                systemPrompt = "Provide a brief analysis of this medical document. Focus on key medical information.";
        }

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Please analyze:\n\n${truncatedText}` }
        ];

        return this.generateResponse(messages, 0.2, 1000);
    }

    async checkSymptoms(symptoms, patientInfo = {}) {
        const { age, gender, medicalHistory = [] } = patientInfo;

        let patientContext = '';
        if (age) patientContext += `Patient age: ${age}. `;
        if (gender) patientContext += `Patient gender: ${gender}. `;
        if (medicalHistory.length) patientContext += `Medical history: ${medicalHistory.join(', ')}. `;

        const messages = [
            {
                role: "system",
                content: "You are a preliminary symptom assessment tool. Provide possible explanations for symptoms and suggest when medical attention is appropriate. Always clarify you're not diagnosing and recommend consulting a healthcare provider."
            },
            {
                role: "user",
                content: `${patientContext}\n\nSymptoms: ${symptoms}\n\nWhat could these symptoms indicate? When should I seek medical attention?`
            }
        ];

        return this.generateResponse(messages, 0.4);
    }

    async analyzeImage(imageBuffer, prompt) {
        try {
            // Use the URL format that worked in the test
            const url = `${this.endpoint}openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

            const base64Image = Buffer.from(imageBuffer).toString('base64');

            const messages = [
                {
                    role: "system",
                    content: "You are a medical assistant that specializes in analyzing medical images and providing helpful information. Always be clear about limitations and never make definitive diagnoses."
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt || "What can you tell me about this medical image?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ];

            logger.info(`Making Azure OpenAI image analysis call at ${getCurrentUTC()}`);

            const response = await axios.post(
                url,
                {
                    messages,
                    temperature: 0.3,
                    max_tokens: 800
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    }
                }
            );

            return {
                content: response.data.choices[0].message.content,
                usage: response.data.usage
            };
        } catch (error) {
            logger.error(`Azure OpenAI image analysis error: ${error.message} at ${getCurrentUTC()}`);

            if (error.response) {
                logger.error(`Response status: ${error.response.status}`);
                logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }

            throw new Error(error.response?.data?.error?.message || 'Failed to analyze image');
        }
    }

    async analyzeDocumentWithImage(documentText, imageBuffer = null) {
        try {
            // Use the URL format that worked in the test
            const url = `${this.endpoint}openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

            const messages = [
                {
                    role: "system",
                    content: "You are a medical document analysis assistant. Analyze both text and images from medical documents to provide clear explanations."
                }
            ];

            const userContent = [
                {
                    type: "text",
                    text: `Please analyze this medical document:\n\n${documentText}`
                }
            ];

            if (imageBuffer) {
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                userContent.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                    }
                });
            }

            messages.push({
                role: "user",
                content: userContent
            });

            logger.info(`Making Azure OpenAI document+image analysis call at ${getCurrentUTC()}`);

            const response = await axios.post(
                url,
                {
                    messages,
                    temperature: 0.2,
                    max_tokens: 1000
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    }
                }
            );

            return {
                content: response.data.choices[0].message.content,
                usage: response.data.usage
            };
        } catch (error) {
            logger.error(`Azure OpenAI document+image analysis error: ${error.message} at ${getCurrentUTC()}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to analyze document with image');
        }
    }
}

module.exports = new OpenAIService();
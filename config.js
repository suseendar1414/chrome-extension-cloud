// config.js
const CONFIG = {
    OPENAI: {
        API_KEY: 'API-key',
        BASE_URL: 'https://api.openai.com/v1',
        MODEL: 'gpt-4',
        TEMPERATURE: 0.7
    },
    AWS: {
        DEFAULT_REGION: 'us-east-1'
    }
};

// Make it globally available
window.CONFIG = CONFIG;
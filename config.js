// config.js
const CONFIG = {
    OPENAI: {
        API_KEY: 'sk-svcacct-WmI7Crg06cBy7UzYcLv_fdth2mTxvASndNEw3nk_IW4o3LG6YJUB7HpVh_utMQmC0MITz-HPGJzMkEBT3BlbkFJco9Frd_GgL4g6XGS-5EVy2nxoXYSrO27WAzKUrTJS1lf7Dahf1qUBOOdsHh7czF2moUYdHeCR94oRAA',
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
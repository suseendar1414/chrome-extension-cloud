let aiSession = null;
let summarizer = null;
let awsData = null;
let cleanup = false;

async function initAI() {
    try {
        if (!chrome.aiOriginTrial?.languageModel) {
            throw new Error('AI language model not available - make sure origin trial is properly set up');
        }
        if (!self.ai?.summarizer) {
            throw new Error('Summarizer API not available');
        }
        
        const capabilities = await chrome.aiOriginTrial.languageModel.capabilities();
        if (capabilities.available === "no") {
            throw new Error("AI model not available on this device - check system requirements");
        }

        const [langModel, sumModel] = await Promise.all([
            chrome.aiOriginTrial.languageModel.create({
                systemPrompt: "You are an AWS infrastructure expert assistant.",
                monitor(m) {
                    m.addEventListener("downloadprogress", (e) => {
                        const progress = document.getElementById('downloadProgress');
                        const progressText = document.getElementById('progressText');
                        const percent = Math.round((e.loaded / e.total) * 100);
                        progress.value = percent;
                        progressText.textContent = `Downloading AI model: ${percent}%`;
                    });
                }
            }),
            self.ai.summarizer.create({
                type: 'key-points',
                format: 'markdown',
                length: 'short'
            })
        ]);

        return { langModel, sumModel };
    } catch (error) {
        console.error('AI initialization error:', error);
        throw error;
    }
}

async function getRecentLogs(cloudwatch) {
    const params = {
        logGroupName: '/aws/lambda',
        startTime: new Date().getTime() - (24 * 60 * 60 * 1000), // Last 24 hours
        limit: 100,
        orderBy: 'LastEventTime',
        descending: true
    };

    try {
        const logs = await cloudwatch.getLogEvents(params).promise();
        return logs.events.map(event => ({
            timestamp: new Date(event.timestamp).toISOString(),
            message: event.message
        })).join('\n');
    } catch (error) {
        console.error('CloudWatch Logs Error:', error);
        throw error;
    }
}

document.getElementById('connect').addEventListener('click', async () => {
    const resultDiv = document.getElementById('result');
    try {
        const credentials = {
            accessKeyId: document.getElementById('accessKey').value.trim(),
            secretAccessKey: document.getElementById('secretKey').value.trim(),
            region: document.getElementById('region').value
        };

        resultDiv.textContent = 'Initializing...';

        const { langModel, sumModel } = await initAI();
        aiSession = langModel;
        summarizer = sumModel;

        AWS.config.update(credentials);
        document.getElementById('showLogs').style.display = 'block';
        resultDiv.textContent = 'Connected! Ready to analyze.';
    } catch (error) {
        resultDiv.textContent = `Error: ${error.message}`;
    }
});

document.getElementById('showLogs').addEventListener('click', async () => {
    try {
        const cloudwatch = new AWS.CloudWatch();
        const logs = await getRecentLogs(cloudwatch);
        const logsArea = document.getElementById('logsArea');
        logsArea.value = logs;
        logsArea.style.display = 'block';
        document.getElementById('summarizeLogs').style.display = 'block';
    } catch (error) {
        document.getElementById('result').textContent = `Error fetching logs: ${error.message}`;
    }
});

document.getElementById('summarizeLogs').addEventListener('click', async () => {
    try {
        const logs = document.getElementById('logsArea').value;
        if (!logs) return;

        const resultDiv = document.getElementById('result');
        resultDiv.textContent = 'Summarizing logs...';

        const summary = await summarizer.summarize(logs, {
            context: 'These are AWS CloudWatch logs containing system events and errors.'
        });

        resultDiv.textContent = summary;
    } catch (error) {
        document.getElementById('result').textContent = `Error summarizing: ${error.message}`;
    }
});

document.getElementById('ask').addEventListener('click', async () => {
    const question = document.getElementById('question').value;
    const resultDiv = document.getElementById('result');

    if (!awsData || !question || !aiSession) {
        resultDiv.textContent = 'Please connect to AWS first.';
        return;
    }

    try {
        const prompt = `
            AWS Infrastructure Data:
            ${JSON.stringify(awsData, null, 2)}
            Question: ${question}
        `;

        resultDiv.textContent = 'Analyzing...';
        const stream = aiSession.promptStreaming(prompt);
        let result = '';
        let previousChunk = '';

        for await (const chunk of stream) {
            const newChunk = chunk.startsWith(previousChunk)
                ? chunk.slice(previousChunk.length)
                : chunk;
            result += newChunk;
            resultDiv.textContent = result;
            previousChunk = chunk;
        }
    } catch (error) {
        resultDiv.textContent = `Error: ${error.message}`;
    }
});

window.addEventListener('unload', async () => {
    if (cleanup) return;
    cleanup = true;

    try {
        if (aiSession) {
            await aiSession.destroy();
        }
        if (summarizer) {
            // Clean up summarizer if needed
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
});


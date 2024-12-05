// Constants and configuration

let openaiClient = null;
let awsData = null;

// OpenAI Service initialization
async function initOpenAI() {
    try {
        openaiClient = {
            async createCompletion(messages) {
                const response = await fetch(`${CONFIG.OPENAI.BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${CONFIG.OPENAI.API_KEY}`
                    },
                    body: JSON.stringify({
                        model: CONFIG.OPENAI.MODEL,
                        messages,
                        temperature: CONFIG.OPENAI.TEMPERATURE,
                        stream: true
                    })
                });

                if (!response.ok) {
                    throw new Error('OpenAI API request failed');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                return {
                    async* [Symbol.asyncIterator]() {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop();

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const data = line.slice(6);
                                    if (data === '[DONE]') return;
                                    try {
                                        const parsed = JSON.parse(data);
                                        if (parsed.choices[0].delta.content) {
                                            yield parsed.choices[0].delta.content;
                                        }
                                    } catch (e) {
                                        console.error('Error parsing SSE:', e);
                                    }
                                }
                            }
                        }
                    }
                };
            }
        };
        return openaiClient;
    } catch (error) {
        console.error('OpenAI initialization error:', error);
        throw error;
    }
}

// AWS Data Fetching
async function fetchAWSData() {
    try {
        const services = {
            ec2: new AWS.EC2(),
            lambda: new AWS.Lambda(),
            rds: new AWS.RDS(),
            ecs: new AWS.ECS(),
            elasticache: new AWS.ElastiCache()
        };

        const [instances, functions, databases, clusters, caches] = await Promise.all([
            services.ec2.describeInstances().promise().catch(e => ({ Reservations: [] })),
            services.lambda.listFunctions().promise().catch(e => ({ Functions: [] })),
            services.rds.describeDBInstances().promise().catch(e => ({ DBInstances: [] })),
            services.ecs.listClusters().promise().catch(e => ({ clusterArns: [] })),
            services.elasticache.describeCacheClusters().promise().catch(e => ({ CacheClusters: [] }))
        ]);

        return {
            ec2: {
                instances: instances.Reservations.flatMap(r => r.Instances).map(i => ({
                    id: i.InstanceId,
                    type: i.InstanceType,
                    state: i.State.Name,
                    name: i.Tags?.find(t => t.Key === 'Name')?.Value || 'Unnamed'
                }))
            },
            lambda: {
                functions: functions.Functions.map(f => ({
                    name: f.FunctionName,
                    runtime: f.Runtime
                }))
            },
            rds: {
                databases: databases.DBInstances.map(db => ({
                    identifier: db.DBInstanceIdentifier,
                    engine: db.Engine
                }))
            },
            ecs: {
                clusters: clusters.clusterArns
            },
            elasticache: {
                clusters: caches.CacheClusters.map(c => ({
                    id: c.CacheClusterId,
                    engine: c.Engine
                }))
            }
        };
    } catch (error) {
        console.error('Error fetching AWS data:', error);
        throw error;
    }
}

// State management
class AppState {
    constructor() {
        this.openaiClient = null;
        this.awsData = null;
        this.isConnected = false;
    }

    static getInstance() {
        if (!AppState.instance) {
            AppState.instance = new AppState();
        }
        return AppState.instance;
    }
}

// OpenAI Service
class OpenAIService {
    constructor(config) {
        this.config = config;
    }

    async createStreamingCompletion(messages) {
        const response = await fetch(`${this.config.BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.API_KEY}`
            },
            body: JSON.stringify({
                model: this.config.MODEL,
                messages,
                temperature: this.config.TEMPERATURE,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        return this.handleStreamResponse(response);
    }

    async *handleStreamResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') return;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices[0].delta.content) {
                                yield parsed.choices[0].delta.content;
                            }
                        } catch (e) {
                            console.error('SSE parsing error:', e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}

// AWS Service
class AWSService {
    constructor() {
        this.regionMap = {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'af-south-1': 'Africa (Cape Town)',
            'ap-east-1': 'Asia Pacific (Hong Kong)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ap-northeast-3': 'Asia Pacific (Osaka)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-southeast-3': 'Asia Pacific (Jakarta)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'Europe (Frankfurt)',
            'eu-west-1': 'Europe (Ireland)',
            'eu-west-2': 'Europe (London)',
            'eu-west-3': 'Europe (Paris)',
            'eu-north-1': 'Europe (Stockholm)',
            'eu-south-1': 'Europe (Milan)',
            'me-south-1': 'Middle East (Bahrain)',
            'sa-east-1': 'South America (São Paulo)'
        };
    }

    async initialize(credentials) {
        AWS.config.update({
            accessKeyId: credentials.accessKey,
            secretAccessKey: credentials.secretKey,
            region: credentials.region
        });
    }

    async fetchInfrastructureData() {
        const services = {
            ec2: new AWS.EC2(),
            lambda: new AWS.Lambda(),
            rds: new AWS.RDS(),
            ecs: new AWS.ECS(),
            elasticache: new AWS.ElastiCache()
        };

        try {
            const [ec2Data, lambdaData, rdsData, ecsData, elasticacheData] = await Promise.all([
                this.fetchEC2Data(services.ec2),
                this.fetchLambdaData(services.lambda),
                this.fetchRDSData(services.rds),
                this.fetchECSData(services.ecs),
                this.fetchElastiCacheData(services.elasticache)
            ]);

            return this.consolidateData(ec2Data, lambdaData, rdsData, ecsData, elasticacheData);
        } catch (error) {
            console.error('Error fetching infrastructure data:', error);
            throw error;
        }
    }

    async fetchEC2Data(ec2) {
        try {
            const { Reservations } = await ec2.describeInstances().promise();
            return Reservations
                .flatMap(r => r.Instances)
                .filter(i => i.State.Name === 'running')
                .map(i => ({
                    id: i.InstanceId,
                    type: i.InstanceType,
                    state: i.State.Name,
                    az: i.Placement.AvailabilityZone,
                    privateIp: i.PrivateIpAddress,
                    publicIp: i.PublicIpAddress,
                    name: i.Tags?.find(t => t.Key === 'Name')?.Value || 'Unnamed'
                }));
        } catch (error) {
            console.error('EC2 fetch error:', error);
            return [];
        }
    }

    async fetchLambdaData(lambda) {
        try {
            const { Functions } = await lambda.listFunctions().promise();
            return Functions.map(f => ({
                name: f.FunctionName,
                runtime: f.Runtime,
                memory: f.MemorySize,
                timeout: f.Timeout,
                lastModified: f.LastModified
            }));
        } catch (error) {
            console.error('Lambda fetch error:', error);
            return [];
        }
    }

    async fetchRDSData(rds) {
        try {
            const { DBInstances } = await rds.describeDBInstances().promise();
            return DBInstances.map(db => ({
                identifier: db.DBInstanceIdentifier,
                engine: db.Engine,
                status: db.DBInstanceStatus,
                size: db.DBInstanceClass
            }));
        } catch (error) {
            console.error('RDS fetch error:', error);
            return [];
        }
    }

    async fetchECSData(ecs) {
        try {
            const { clusterArns } = await ecs.listClusters().promise();
            return clusterArns;
        } catch (error) {
            console.error('ECS fetch error:', error);
            return [];
        }
    }

    async fetchElastiCacheData(elasticache) {
        try {
            const { CacheClusters } = await elasticache.describeCacheClusters().promise();
            return CacheClusters.map(c => ({
                id: c.CacheClusterId,
                engine: c.Engine,
                status: c.CacheClusterStatus
            }));
        } catch (error) {
            console.error('ElastiCache fetch error:', error);
            return [];
        }
    }

    consolidateData(ec2Data, lambdaData, rdsData, ecsData, elasticacheData) {
        const timestamp = new Date().toISOString();
        return {
            timestamp,
            region: AWS.config.region,
            services: {
                ec2: { instances: ec2Data, count: ec2Data.length },
                lambda: { functions: lambdaData, count: lambdaData.length },
                rds: { instances: rdsData, count: rdsData.length },
                ecs: { clusters: ecsData, count: ecsData.length },
                elasticache: { clusters: elasticacheData, count: elasticacheData.length }
            },
            summary: {
                totalServices: [ec2Data, lambdaData, rdsData, ecsData, elasticacheData]
                    .reduce((acc, curr) => acc + (curr.length > 0 ? 1 : 0), 0)
            }
        };
    }
}

class CloudWatchLogsService {
    constructor() {
        this.cloudwatch = new AWS.CloudWatchLogs();
    }

    async getLogGroups() {
        try {
            const response = await this.cloudwatch.describeLogGroups().promise();
            return response.logGroups || [];
        } catch (error) {
            console.error('Error fetching log groups:', error);
            throw error;
        }
    }

    async getRecentLogs(logGroupName, timeWindow = 3600000) { // Default 1 hour
        try {
            const endTime = new Date().getTime();
            const startTime = endTime - timeWindow;

            const streams = await this.cloudwatch.describeLogStreams({
                logGroupName,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 5
            }).promise();

            const logPromises = streams.logStreams.map(stream => 
                this.cloudwatch.getLogEvents({
                    logGroupName,
                    logStreamName: stream.logStreamName,
                    startTime,
                    endTime
                }).promise()
            );

            const logsData = await Promise.all(logPromises);
            
            // Combine and sort all events by timestamp
            const allEvents = logsData
                .flatMap(data => data.events)
                .sort((a, b) => a.timestamp - b.timestamp);

            return allEvents.map(event => ({
                timestamp: new Date(event.timestamp).toISOString(),
                message: event.message
            }));
        } catch (error) {
            console.error('Error fetching logs:', error);
            throw error;
        }
    }

    formatLogsForDisplay(logs) {
        return logs.map(log => 
            `[${log.timestamp}] ${log.message}`
        ).join('\n');
    }

    generateAnalysisPrompt(logs) {
        return [
            {
                role: "system",
                content: `You are an expert at analyzing AWS CloudWatch logs. Focus on:
                    - Error patterns and their frequencies
                    - Performance issues
                    - Security-related events
                    - Unusual activity patterns
                    Provide a concise summary highlighting the most important findings.`
            },
            {
                role: "user",
                content: `Analyze these CloudWatch logs and provide a summary of key findings:\n\n${logs}`
            }
        ];
    }
}

class UIController {
    constructor() {
        this.state = {
            isConnected: false,
            awsData: null,
            openaiClient: null
        };
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('connect').addEventListener('click', () => this.handleConnect());
        document.getElementById('ask').addEventListener('click', () => this.handleAnalyze());
        document.getElementById('showLogs').addEventListener('click', () => this.handleShowLogs());
        document.getElementById('summarizeLogs').addEventListener('click', () => this.handleSummarizeLogs());
    }

    async handleConnect() {
        const credentials = {
          accessKey: document.getElementById('accessKey').value.trim(),
          secretKey: document.getElementById('secretKey').value.trim(),
          region: document.getElementById('region').value
        };
    
        try {
          AWS.config.update({
            accessKeyId: credentials.accessKey,
            secretAccessKey: credentials.secretKey,
            region: credentials.region
          });
    
          // Test connection
          const sts = new AWS.STS();
          await sts.getCallerIdentity().promise();
    
          this.state.isConnected = true;
          this.state.credentials = credentials;
          this.updateUIAfterConnection();
          this.showMessage('Connected successfully', 'success');
        } catch (error) {
          this.showMessage(`Connection error: ${error.message}`, 'error');
        }
      }

    async handleAnalyze() {
        const question = document.getElementById('question').value;
        if (!question || !this.state.isConnected) {
            this.showMessage('Please connect to AWS and enter a question', 'error');
            return;
        }

        try {
            const awsService = new AWSService();
            this.state.awsData = await awsService.fetchInfrastructureData();
            const stream = await this.createCompletion(question);
            await this.handleStream(stream);
        } catch (error) {
            this.showMessage(`Analysis error: ${error.message}`, 'error');
        }
    }

    async createCompletion(question) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI.API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.OPENAI.MODEL,
                messages: [
                    { role: "system", content: "You are an AWS infrastructure expert assistant." },
                    { role: "user", content: `AWS Infrastructure:\n${JSON.stringify(this.state.awsData)}\n\nQuestion: ${question}` }
                ],
                stream: true
            })
        });

        if (!response.ok) throw new Error('OpenAI API request failed');
        return response.body;
    }

    async handleStream(stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        const resultDiv = document.getElementById('result');
        let text = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices[0].delta.content) {
                                text += parsed.choices[0].delta.content;
                                resultDiv.textContent = text;
                            }
                        } catch (e) {
                            console.error('Error parsing SSE:', e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }


    updateUIAfterConnection() {
        try {
          console.log('updateUIAfterConnection started');
          
          // Show all sections
          ['querySection', 'logsSection', 'dashboardContainer'].forEach(id => {
            const element = document.getElementById(id);
            console.log(`Showing element ${id}:`, !!element);
            if (element) {
              element.classList.remove('hidden');
            }
          });
      
          // Initialize dashboard
          const dashboardElement = document.getElementById('awsDashboard');
          console.log('Dashboard element found:', !!dashboardElement);
          console.log('React available:', !!window.React);
          console.log('ReactDOM available:', !!window.ReactDOM);
          console.log('AWSDashboard available:', !!window.AWSDashboard);
      
          if (dashboardElement && window.React && window.ReactDOM && window.AWSDashboard) {
            console.log('Creating React root');
            const root = ReactDOM.createRoot(dashboardElement);
            root.render(React.createElement(window.AWSDashboard));
            console.log('Dashboard rendered');
          } else {
            console.error('Missing required dependencies:', {
              dashboardElement: !!dashboardElement,
              React: !!window.React,
              ReactDOM: !!window.ReactDOM,
              AWSDashboard: !!window.AWSDashboard
            });
          }
        } catch (error) {
          console.error('Error in updateUIAfterConnection:', error);
        }
      }
      

    showMessage(message, type) {
        const resultDiv = document.getElementById('result');
        resultDiv.textContent = message;
        resultDiv.className = type;
        resultDiv.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const uiController = new UIController(new AppState());
});
    

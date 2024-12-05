// Enhanced AWS Dashboard with Cost Optimization Features
const AWSDashboard = () => {
  const [state, setState] = React.useState({
    loading: true,
    error: null,
    infraData: null,
    costData: null,
    recommendations: []
  });

  React.useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const services = {
        ec2: new AWS.EC2(),
        costExplorer: new AWS.CostExplorer(),
      };

      // Fetch EC2 data
      const ec2Data = await services.ec2.describeInstances().promise();
      const instances = (ec2Data.Reservations || []).flatMap(r => r.Instances || []);

      // Fetch cost data for last 30 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const costData = await services.costExplorer.getCostAndUsage({
        TimePeriod: { Start: startDate, End: endDate },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost']
      }).promise();

      // Generate recommendations
      const recommendations = generateRecommendations(instances);

      setState({
        loading: false,
        infraData: { ec2: instances },
        costData: costData.ResultsByTime,
        recommendations,
        error: null
      });

    } catch (err) {
      console.error('Error fetching data:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message
      }));
    }
  };

  const generateRecommendations = (instances) => {
    const recommendations = [];

    // EC2 Instance Optimization
    instances.forEach(instance => {
      // Check for instances that might be oversized
      if (instance.InstanceType.startsWith('t3.') || instance.InstanceType.startsWith('m5.')) {
        recommendations.push({
          type: 'cost_optimization',
          service: 'EC2',
          priority: 'medium',
          title: `Consider rightsizing instance ${instance.InstanceId}`,
          description: 'Instance might be oversized based on type. Monitor CPU/memory usage to optimize size.',
          potential_savings: '20-30%'
        });
      }

      // Check for missing tags
      if (!instance.Tags || instance.Tags.length === 0) {
        recommendations.push({
          type: 'governance',
          service: 'EC2',
          priority: 'high',
          title: `Missing tags on instance ${instance.InstanceId}`,
          description: 'Add tags for better cost allocation and resource management',
          potential_savings: 'N/A'
        });
      }
    });

    return recommendations;
  };

  if (state.loading) {
    return React.createElement('div', { className: 'dashboard-loading' },
      'Loading AWS infrastructure and cost data...'
    );
  }

  if (state.error) {
    return React.createElement('div', { className: 'dashboard-error' },
      'Error loading data: ', state.error
    );
  }

  // Create metric card
  const MetricCard = ({ title, value, subtitle, className = '' }) => {
    return React.createElement('div', { className: `metric-card ${className}` },
      React.createElement('h3', { className: 'metric-title' }, title),
      React.createElement('div', { className: 'metric-value' }, value),
      React.createElement('div', { className: 'metric-subtitle' }, subtitle)
    );
  };

  // Create recommendation card
  const RecommendationCard = ({ recommendation }) => {
    return React.createElement('div', {
      className: `recommendation-card ${
        recommendation.priority === 'high' ? 'bg-red-50' :
        recommendation.priority === 'medium' ? 'bg-yellow-50' : 'bg-blue-50'
      }`
    },
      React.createElement('div', { className: 'recommendation-header' },
        React.createElement('h4', null, recommendation.title)
      ),
      React.createElement('p', { className: 'recommendation-description' }, recommendation.description),
      React.createElement('div', { className: 'recommendation-footer' },
        React.createElement('span', { className: 'recommendation-service' }, recommendation.service),
        recommendation.potential_savings !== 'N/A' &&
        React.createElement('span', { className: 'potential-savings' },
          'Potential savings: ', recommendation.potential_savings
        )
      )
    );
  };

  // Calculate monthly cost if available
  const monthlyCost = state.costData?.[0]?.Total?.UnblendedCost?.Amount || 0;

  return React.createElement('div', { className: 'dashboard space-y-6' },
    // Metrics Section
    React.createElement('div', { className: 'metrics-grid' },
      React.createElement(MetricCard, {
        title: 'Monthly Cost',
        value: `$${parseFloat(monthlyCost).toFixed(2)}`,
        subtitle: 'Current month spend'
      }),
      React.createElement(MetricCard, {
        title: 'EC2 Instances',
        value: state.infraData.ec2.length,
        subtitle: 'Running instances'
      }),
      React.createElement(MetricCard, {
        title: 'Optimization Actions',
        value: state.recommendations.length,
        subtitle: 'Recommended actions'
      })
    ),

    // Recommendations Section
    React.createElement('div', { className: 'recommendations-section' },
      React.createElement('h3', { className: 'section-title' }, 
        'Cost Optimization Recommendations'
      ),
      state.recommendations.length > 0 ?
        React.createElement('div', { className: 'recommendations-grid' },
          state.recommendations.map((recommendation, index) =>
            React.createElement(RecommendationCard, {
              key: index,
              recommendation: recommendation
            })
          )
        ) :
        React.createElement('div', { className: 'no-recommendations' },
          'No optimization recommendations at this time'
        )
    )
  );
};

// Make it globally available
window.AWSDashboard = AWSDashboard;
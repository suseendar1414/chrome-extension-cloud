const CostBreakdown = ({ services }) => {
  return React.createElement('div', { className: 'cost-breakdown' },
    React.createElement('h3', { className: 'section-title' }, 'Top Services by Cost'),
    React.createElement('div', { className: 'service-costs' },
      services.slice(0, 5).map((service, index) =>
        React.createElement('div', { 
          key: index,
          className: 'service-cost-item'
        },
          React.createElement('span', { className: 'service-name' }, service.service),
          React.createElement('span', { className: 'service-cost' }, 
            `$${service.cost.toFixed(2)}`
          )
        )
      )
    )
  );
};

const AWSDashboard = () => {
  const [state, setState] = React.useState({
    loading: true,
    error: null,
    costData: null,
    activeResources: [], // Add this
    unusedResources: [],
    monthlyTrend: [],
    serviceCosts: []
  });

  React.useEffect(() => {
    fetchAllData();
  }, []);

  // Define helper function
  const findActiveAndUnusedResources = (instances) => {
    const active = [];
    const unused = [];
    
    instances.forEach(instance => {
      if (instance.State.Name === 'running') {
        active.push({
          type: 'EC2 Instance',
          id: instance.InstanceId,
          name: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId,
          instanceType: instance.InstanceType,
          state: instance.State.Name
        });
      } else if (instance.State.Name === 'stopped') {
        const volumes = instance.BlockDeviceMappings || [];
        const volumeCost = volumes.length * 0.10; // Approximate EBS cost
        
        unused.push({
          type: 'EC2 Instance',
          id: instance.InstanceId,
          name: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId,
          reason: 'Stopped instance with attached EBS volumes',
          estimatedMonthlyCost: volumeCost
        });
      }
    });

    return { active, unused };
  };

  const fetchAllData = async () => {
    try {
      console.log('Starting data fetch...');
      const services = {
        ec2: new AWS.EC2(),
        costExplorer: new AWS.CostExplorer()
      };

      const now = new Date();
      const endDate = now.toISOString().split('T')[0];
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];

      console.log('Date ranges:', { startDate, endDate, prevMonthStart });

      const [monthlyData, serviceData, ec2Data] = await Promise.all([
        services.costExplorer.getCostAndUsage({
          TimePeriod: { Start: prevMonthStart, End: endDate },
          Granularity: 'MONTHLY',
          Metrics: ['UnblendedCost']
        }).promise().catch(err => {
          console.error('Monthly trend fetch error:', err);
          return { ResultsByTime: [] };
        }),
        services.costExplorer.getCostAndUsage({
          TimePeriod: { Start: startDate, End: endDate },
          Granularity: 'MONTHLY',
          GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
          Metrics: ['UnblendedCost']
        }).promise().catch(err => {
          console.error('Service costs fetch error:', err);
          return { ResultsByTime: [{ Groups: [] }] };
        }),
        services.ec2.describeInstances().promise().catch(err => {
          console.error('EC2 data fetch error:', err);
          return { Reservations: [] };
        })
      ]);

      const monthlyTrend = monthlyData.ResultsByTime.map(period => ({
        date: period.TimePeriod.Start,
        cost: parseFloat(period.Total?.UnblendedCost?.Amount || 0)
      }));

      const serviceCosts = serviceData.ResultsByTime
        .flatMap(period => period.Groups)
        .filter(group => group && group.Metrics.UnblendedCost.Amount > 0)
        .map(group => ({
          service: group.Keys[0],
          cost: parseFloat(group.Metrics.UnblendedCost.Amount)
        }))
        .sort((a, b) => b.cost - a.cost);

      const currentCost = monthlyTrend[monthlyTrend.length - 1]?.cost || 0;
      const previousCost = monthlyTrend[monthlyTrend.length - 2]?.cost || 0;
      const costChange = previousCost ? ((currentCost - previousCost) / previousCost) * 100 : 0;

      const instances = (ec2Data.Reservations || []).flatMap(r => r.Instances || []);
      const { active, unused } = findActiveAndUnusedResources(instances);

      console.log('Active resources:', active);
      console.log('Unused resources:', unused);

      setState({
        loading: false,
        monthlyTrend,
        serviceCosts,
        activeResources: active,
        unusedResources: unused,
        currentCost,
        costChange,
        error: null
      });

    } catch (err) {
      console.error('Error in fetchAllData:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message
      }));
    }
  };

  if (state.loading) {
    return React.createElement('div', { className: 'dashboard-loading' },
      'Loading cost and resource data...'
    );
  }

  if (state.error) {
    return React.createElement('div', { className: 'dashboard-error' },
      'Error loading data: ', state.error
    );
  }

  const MetricCard = ({ title, value, subtitle, trend = null }) => {
    return React.createElement('div', { className: 'metric-card' },
      React.createElement('h3', { className: 'metric-title' }, title),
      React.createElement('div', { className: 'metric-value' }, value),
      trend !== null && React.createElement('div', { 
        className: `metric-trend ${trend >= 0 ? 'text-red-500' : 'text-green-500'}` 
      }, `${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend).toFixed(1)}%`),
      React.createElement('div', { className: 'metric-subtitle' }, subtitle)
    );
  };

  return React.createElement('div', { className: 'dashboard space-y-6' },     
    React.createElement('div', { className: 'metrics-grid' },       
      React.createElement(MetricCard, {         
        title: 'Monthly Cost',         
        value: `$${state.currentCost?.toFixed(2)}`,         
        subtitle: 'Current month',         
        trend: state.costChange       
      }),       
      React.createElement(MetricCard, {         
        title: 'Top Service',         
        value: state.serviceCosts[0]?.service || 'N/A',         
        subtitle: `$${(state.serviceCosts[0]?.cost || 0).toFixed(2)}`       
      }),       
      React.createElement(MetricCard, {         
        title: 'Active Resources',         
        value: state.activeResources?.length?.toString() || '0',         
        subtitle: 'Running instances'       
      }),       
      React.createElement(MetricCard, {         
        title: 'Unused Resources',         
        value: state.unusedResources?.length?.toString() || '0',         
        subtitle: 'Optimization opportunities'       
      })     
    ),
    // Add the CostBreakdown component here
    React.createElement(CostBreakdown, { 
      services: state.serviceCosts 
    })
  ); 
};


// Make it globally available
window.AWSDashboard = AWSDashboard;
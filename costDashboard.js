// costDashboard.js
const AWSDashboard = () => {
  console.log('AWSDashboard component initializing...');

  const [state, setState] = React.useState({
    loading: true,
    error: null,
    infraData: null
  });

  React.useEffect(() => {
    console.log('useEffect triggered');
    fetchInfraData();
  }, []);

  const fetchInfraData = async () => {
    console.log('Fetching infra data...');
    try {
      const ec2 = new AWS.EC2();
      console.log('EC2 service initialized');

      const ec2Data = await ec2.describeInstances().promise();
      console.log('EC2 data received:', ec2Data);

      setState({
        loading: false,
        infraData: {
          ec2: (ec2Data.Reservations || []).flatMap(r => r.Instances || [])
        },
        error: null
      });
      console.log('State updated with EC2 data');

    } catch (err) {
      console.error('Error in fetchInfraData:', err);
      setState({
        loading: false,
        error: err.message,
        infraData: null
      });
    }
  };

  console.log('Current state:', state);

  if (state.loading) {
    return React.createElement('div', { className: 'dashboard-loading' },
      'Loading AWS infrastructure data...'
    );
  }

  if (state.error) {
    return React.createElement('div', { className: 'dashboard-error' },
      'Error loading data: ', state.error
    );
  }

  return React.createElement('div', { className: 'dashboard' },
    React.createElement('div', { className: 'metrics-grid' },
      React.createElement('div', { className: 'metric-card' },
        React.createElement('h3', { className: 'metric-title' }, 'EC2 Instances'),
        React.createElement('div', { className: 'metric-value' }, 
          state.infraData?.ec2?.length || 0
        ),
        React.createElement('div', { className: 'metric-subtitle' }, 
          'Running instances'
        )
      )
    )
  );
};

// Make it globally available
window.AWSDashboard = AWSDashboard;

// Add initialization debug
console.log('AWSDashboard loaded and made global:', !!window.AWSDashboard);
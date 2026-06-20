const express = require('express');
const CircuitBreaker = require('opossum');

const app = express();
const PORT = 3000;

// ==========================================
// 1. Mock Unstable Service
// ==========================================
// This service succeeds 50% of the time and fails 50% of the time
// so that we can test the circuit breaker behavior.
async function unstableRemoteService() {
  return new Promise((resolve, reject) => {
    const isSuccess = Math.random() > 0.5; // 50% success rate

    setTimeout(() => {
      if (isSuccess) {
        resolve({
          status: "Success",
          data: "Here is the data you requested!"
        });
      } else {
        reject(new Error("Remote server is not responding!"));
      }
    }, 500); // Simulate 500ms response time
  });
}

// ==========================================
// 2. Opossum Circuit Breaker Configuration
// ==========================================
const breakerOptions = {
  timeout: 3000,                // Consider as failure if response takes more than 3 seconds
  errorThresholdPercentage: 50, // Open the circuit if 50% of requests fail
  resetTimeout: 10000           // Wait 10 seconds before trying again (HALF-OPEN)
};

// Create a circuit breaker instance
const breaker = new CircuitBreaker(
  unstableRemoteService,
  breakerOptions
);

// ==========================================
// 3. Fallback Mechanism
// ==========================================
// When the circuit is OPEN, this fallback response
// will be returned immediately instead of calling
// the remote service.
breaker.fallback(() => {
  return {
    status: "Fallback Mode (Circuit Open)",
    data: "The main service is currently unavailable. Returning cached/backup data."
  };
});

// Optional: Monitor circuit breaker state changes
breaker.on('open', () =>
  console.log('⚠️ Circuit breaker has tripped! (State: OPEN)')
);

breaker.on('close', () =>
  console.log('✅ Circuit breaker is back to normal. (State: CLOSED)')
);

breaker.on('halfOpen', () =>
  console.log('🔄 Checking if the service has recovered... (State: HALF-OPEN)')
);

// ==========================================
// API Endpoint
// ==========================================
app.get('/data', async (req, res) => {
  try {
    const result = await breaker.fire();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ==========================================
// Start Express Server
// ==========================================
app.listen(PORT, () => {
  console.log(
    `🚀 Server is running at http://localhost:${PORT}/data`
  );
});
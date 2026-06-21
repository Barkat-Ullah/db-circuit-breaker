const express = require("express");
const CircuitBreaker = require("opossum");

const app = express();
const PORT = 3000;

// ==========================================
// 1. Mock Unstable Service
// ==========================================
async function unstableRemoteService() {
  return new Promise((resolve, reject) => {
    const isSuccess = Math.random() > 0.5;
    setTimeout(() => {
      if (isSuccess) {
        resolve({
          status: "Success",
          data: "Here is the data you requested!",
        });
      } else {
        reject(new Error("Remote server is not responding!"));
      }
    }, 500);
  });
}

// ==========================================
// 2. Opossum Circuit Breaker Configuration
// ==========================================
const breakerOptions = {
  timeout: 3000, // Consider as failure if response takes more than 3 seconds
  errorThresholdPercentage: 50, // Open the circuit if 50% of requests fail
  resetTimeout: 10000, // Wait 10 seconds before trying again (HALF-OPEN)

  // 🆕 NEW: minimum number of requests required in the rolling window
  // before the breaker is even allowed to evaluate the error percentage.
  // Without this, just 1 failure out of 1 request = 100% failure rate = instant trip.
  volumeThreshold: 5,

  // 🆕 NEW: the rolling statistical window Opossum uses to calculate
  // errorThresholdPercentage. Together with rollingCountBuckets, this
  // defines how "memory" of past failures fades over time.
  rollingCountTimeout: 10000, // 10 second window
  rollingCountBuckets: 10, // divided into 10 buckets of 1s each
};

const breaker = new CircuitBreaker(unstableRemoteService, breakerOptions);

// ==========================================
// 3. Fallback Mechanism
// ==========================================
breaker.fallback(() => {
  return {
    status: "Fallback Mode (Circuit Open)",
    data: "The main service is currently unavailable. Returning cached/backup data.",
  };
});

// ==========================================
// 4. Monitor circuit breaker state changes
// ==========================================
breaker.on("open", () =>
  console.log("⚠️ Circuit breaker has tripped! (State: OPEN)"),
);

breaker.on("close", () =>
  console.log("✅ Circuit breaker is back to normal. (State: CLOSED)"),
);

breaker.on("halfOpen", () =>
  console.log("🔄 Checking if the service has recovered... (State: HALF-OPEN)"),
);

// 🆕 NEW: log every rejected call (i.e. breaker was OPEN, real service skipped)
breaker.on("reject", () =>
  console.log("🚫 Request rejected — breaker is OPEN, fallback used instantly"),
);

// 🆕 NEW: useful to see exactly when volumeThreshold is preventing a premature trip
breaker.on("failure", (err) => console.log(`❌ Call failed: ${err.message}`));

// ==========================================
// API Endpoint
// ==========================================
app.get("/data", async (req, res) => {
  try {
    const result = await breaker.fire();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// 🆕 NEW: expose breaker stats/state for debugging in Postman
app.get("/health/breaker", (req, res) => {
  res.json({
    state: breaker.opened ? "OPEN" : breaker.halfOpen ? "HALF_OPEN" : "CLOSED",
    stats: breaker.stats,
  });
});

// ==========================================
// Start Express Server
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}/data`);
});

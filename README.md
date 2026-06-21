# Circuit Breaker with Opossum — Example Project

A minimal Express.js example demonstrating the **Circuit Breaker** pattern using the [`opossum`](https://www.npmjs.com/package/opossum) npm package.

---

## 📌 What Problem Does This Solve?

In a microservices or distributed system, your application often depends on external services (APIs, databases, third-party gateways). When one of those services becomes slow or starts failing:

- Requests pile up waiting for timeouts
- Threads/connections get exhausted
- The failure **cascades** and brings down your own service too

A **Circuit Breaker** prevents this by monitoring failures and "tripping" — temporarily stopping calls to the failing service and returning a fast, predictable fallback response instead of letting requests hang or fail unpredictably.

---

## 🔄 How the Circuit Breaker States Work

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation. All requests go through to the real service. Failures are counted. |
| **OPEN** | Triggered when the failure rate crosses the threshold. All requests are immediately rejected and routed to the fallback — the real service is **not** called. |
| **HALF-OPEN** | After `resetTimeout` elapses, the breaker allows a single test request through. Success → back to CLOSED. Failure → back to OPEN. |

```
CLOSED ──(too many failures)──> OPEN ──(after resetTimeout)──> HALF-OPEN
   ▲                                                                │
   └────────────────────(test request succeeds)────────────────────┘
                          (test request fails) ──> back to OPEN
```

---

## 📁 Project Structure

```
.
├── server.js          # Main Express app with circuit breaker setup
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install express opossum
```

### 2. Run the server

```bash
node index.js
```

Server starts at:

```
http://localhost:3000/data
```

### 3. Test it

Open Postman (or use `curl`) and repeatedly hit:

```bash
curl http://localhost:3000/data
```

Watch the server console for state-change logs as the mock service randomly succeeds/fails.

---

## 🧩 Code Walkthrough

### 1. Mock Unstable Service

```javascript
async function unstableRemoteService() {
  return new Promise((resolve, reject) => {
    const isSuccess = Math.random() > 0.5;
    setTimeout(() => {
      if (isSuccess) resolve({ status: "Success", data: "..." });
      else reject(new Error("Remote server is not responding!"));
    }, 500);
  });
}
```

Simulates a real-world dependency (e.g. payment gateway, auth service) that succeeds ~50% of the time after a 500ms delay. In production this would be replaced with a real `axios`/`fetch` call or DB query.

### 2. Circuit Breaker Configuration

```javascript
const breakerOptions = {
  timeout: 3000,                 // fail if response takes longer than 3s
  errorThresholdPercentage: 50,  // trip the breaker if 50%+ requests fail
  resetTimeout: 10000            // wait 10s before testing again (HALF-OPEN)
};

const breaker = new CircuitBreaker(unstableRemoteService, breakerOptions);
```

- **`timeout`** — any call exceeding this duration is treated as a failure, even if it would have eventually succeeded.
- **`errorThresholdPercentage`** — the failure rate (within Opossum's rolling stats window) that triggers OPEN state.
- **`resetTimeout`** — cooldown period before the breaker tries a test request again.

> ⚠️ **Note:** This example does not set `volumeThreshold`. In production, always set it (e.g. `volumeThreshold: 10`) so the breaker doesn't trip after just one or two unlucky failures during low traffic.

### 3. Fallback Mechanism

```javascript
breaker.fallback(() => ({
  status: "Fallback Mode (Circuit Open)",
  data: "The main service is currently unavailable. Returning cached/backup data."
}));
```

This function runs automatically whenever:
- The breaker is in the **OPEN** state, or
- The underlying call fails or times out

It lets the API degrade gracefully (e.g. return cached data) instead of throwing a raw 500 error to the client.

### 4. State Change Listeners

```javascript
breaker.on('open', () => console.log('⚠️ Circuit breaker has tripped! (State: OPEN)'));
breaker.on('close', () => console.log('✅ Circuit breaker is back to normal. (State: CLOSED)'));
breaker.on('halfOpen', () => console.log('🔄 Checking if the service has recovered... (State: HALF-OPEN)'));
```

These are useful for logging, alerting, and dashboards (e.g. pushing metrics to Prometheus, Datadog, or Slack notifications when a dependency goes down).

### 5. API Endpoint

```javascript
app.get('/data', async (req, res) => {
  try {
    const result = await breaker.fire();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

`breaker.fire()` is used instead of calling `unstableRemoteService()` directly — this routes the call through the circuit breaker so it can be tracked, timed out, and short-circuited when needed.

---

## 🧪 Expected Test Behavior in Postman

1. **First few requests** → mixed success/failure responses (CLOSED state), each taking ~500ms.
2. **After enough failures accumulate** → console logs `⚠️ Circuit breaker has tripped!` and subsequent requests return the **fallback response instantly** (no 500ms delay, since the real service isn't called).
3. **Wait ~10 seconds** → console logs `🔄 Checking if the service has recovered...` and the next request is sent to the real service as a test.
4. **If that test succeeds** → console logs `✅ Circuit breaker is back to normal.` and normal traffic resumes.
5. **If it fails** → breaker goes back to OPEN and the 10-second cooldown restarts.

---

## ⚙️ Recommended Production Improvements

This example is intentionally minimal for learning purposes. For production use, consider:

- Set **`volumeThreshold`** to avoid false trips under low traffic.
- Wrap **any** external dependency (DB, auth service, third-party API) using a reusable breaker factory instead of inline `new CircuitBreaker(...)` per service.
- Expose breaker stats via a `/health/breakers` endpoint for monitoring.
- Send `open`/`close`/`halfOpen` events to your logging/metrics system (Winston, Pino, Prometheus, Datadog).
- Combine with retry/queue mechanisms (e.g. BullMQ) for the fallback path so failed requests aren't silently dropped.

---

## 📚 Reference

- [Opossum GitHub](https://github.com/nodeshift/opossum)
- [Opossum npm package](https://www.npmjs.com/package/opossum)

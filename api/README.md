# CampusFlow API — Backend Architecture & Foundation (Phase 2.1)

Welcome to the backend API service for **CampusFlow** (Unified Campus Resource, Laboratory, and Facility Booking Platform).

This backend is built with **Node.js**, **Express**, **TypeScript**, **MongoDB (Mongoose)**, and **Redis**.

---

## 📁 Architecture Overview

```
api/
├── src/
│   ├── config/
│   │   ├── env.ts          # Type-safe environment validation and configuration
│   │   ├── database.ts     # MongoDB connection lifecycle management (Mongoose)
│   │   └── redis.ts        # Redis client connection and lifecycle management
│   ├── controllers/
│   │   └── health.controller.ts # Health check controller
│   ├── middleware/
│   │   ├── errorHandler.ts # Centralized operational & system error handling
│   │   ├── notFoundHandler.ts # JSON 404 response handler
│   │   ├── requestLogger.ts # Structured HTTP request logging
│   │   └── validate.ts     # Request validation foundation (body, query, params)
│   ├── models/
│   │   └── index.ts        # Foundation for future Mongoose models
│   ├── routes/
│   │   ├── health.routes.ts # Health endpoint routing
│   │   └── index.ts        # Central API router (/api prefix)
│   ├── services/
│   │   └── health.service.ts # System diagnostic and dependency status logic
│   ├── utils/
│   │   ├── errors.ts       # Typed AppError classes (BadRequest, NotFound, etc.)
│   │   ├── logger.ts       # Structured, secret-sanitizing console logger
│   │   └── response.ts     # Standardized JSON success & error response helpers
│   ├── validators/
│   │   └── index.ts        # Common validators (MongoDB ID, pagination schemas)
│   ├── app.ts              # Express application setup & middleware stack
│   └── server.ts           # Server bootstrap, external connections, graceful shutdown
│
├── tests/
│   └── health.test.ts      # Integration tests using Node.js native test runner & fetch
├── .env.example            # Environment template with sensible defaults
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Installation

From the `api/` directory:

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Default configuration variables:

| Variable | Default Value | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `PORT` | `5000` | Port for the Express HTTP server |
| `MONGODB_URI` | `mongodb://localhost:27017/campusflow` | MongoDB connection string |
| `MONGODB_AUTO_START` | `true` on local Windows development | Automatically start the configured local MongoDB instance when stopped |
| `MONGOD_PATH` | `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe` | Local Windows MongoDB executable path |
| `MONGODB_CONFIG_PATH` | `C:\Users\subba\mongodb-rs0\mongod-rs0.conf` | Local Windows MongoDB configuration path |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin for CORS |

### 3. Running the Server

#### Development Mode (with hot-reload):
```bash
npm run dev
```

#### Production Build & Run:
```bash
npm run build
npm start
```

---

## 🔍 Health & Diagnostic Endpoint

### `GET /api/health`

Returns server status and truthful verification of external dependency connections.

#### Example Response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-09-26T17:46:00.668Z",
    "uptime": 12,
    "environment": "development",
    "services": {
      "database": "disconnected",
      "redis": "disconnected"
    }
  }
}
```

---

## 🧪 Testing & Validation

Run the test suite (uses Node.js native test runner):

```bash
npm test
```

Run TypeScript compilation check:

```bash
npm run lint
```

Build the project:

```bash
npm run build
```

---

## 🛡️ Response Standards

### Standard Success Format:
```json
{
  "success": true,
  "data": {}
}
```

### Standard Error Format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

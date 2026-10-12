# CausalFunnel User Analytics

A lightweight user-analytics platform that captures page views, clicks, and custom events through a drop-in tracking script, stores them in MongoDB, and visualises the data via a React dashboard.

## Project structure

```
causalfunnel-analytics/
├── server/        # Node.js + Express API
├── tracker/       # Plain-JS tracking snippet (Stage 2)
├── demo/          # Demo HTML pages (Stage 3)
└── client/        # React + Vite dashboard (Stage 4)
```

## Quick start (backend)

```bash
cd server
cp .env.example .env      # fill in your MongoDB URI
npm install
npm run dev                # starts with hot-reload on PORT 4000
```

## Tech stack

| Layer     | Technology              |
|-----------|-------------------------|
| Tracking  | Plain JavaScript        |
| Backend   | Node.js, Express        |
| Database  | MongoDB Atlas, Mongoose |
| Frontend  | React, Vite             |
| Validation| Zod                     |

## License

Private — not yet published.

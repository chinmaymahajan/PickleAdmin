# Pickleball League Manager

A web application for managing pickleball leagues, automating player assignments, and team formation.

## Project Structure

```
pickleball-league-manager/
├── backend/          # Node.js/Express backend API
│   ├── src/
│   │   ├── models/   # TypeScript data models
│   │   └── index.ts  # Backend entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
├── frontend/         # React frontend
│   ├── src/
│   │   ├── types/    # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── jest.config.js
└── package.json      # Root workspace configuration
```

## Setup

Install dependencies for all workspaces:

```bash
npm install
npm run install:all
```

## Development

Run backend development server:
```bash
npm run dev:backend
```

Run frontend development server:
```bash
npm run dev:frontend
```

## Testing

Run all tests:
```bash
npm test
```

Run backend tests:
```bash
npm run test:backend
```

Run frontend tests:
```bash
npm run test:frontend
```

## Build

Build all projects:
```bash
npm run build
```

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Testing**: Jest, fast-check (property-based testing)
- **Package Management**: npm workspaces

## Data Models

- **League**: Represents a pickleball league
- **Player**: Individual participant in a league
- **Court**: Physical court location
- **Round**: Single iteration of play
- **Assignment**: Player assignments to courts and teams
- **ErrorResponse**: Consistent error format

# Agentic Prompt DB

A split architecture application for managing code modification prompts.

## Architecture

This project is split into two parts:

```
prompts/
├── backend/     # Node.js + Express + Prisma API server
│   ├── src/
│   │   ├── index.js         # Main Express server
│   │   ├── lib/prisma.js    # Prisma client
│   │   └── routes/          # API route handlers
│   ├── prisma/schema.prisma # Database schema
│   ├── package.json
│   └── .env                 # Backend environment variables
│
└── frontend/    # Next.js UI application
    ├── src/app/
    │   ├── page.tsx         # Main UI component
    │   ├── layout.tsx       # Root layout
    │   └── globals.css      # Global styles
    ├── package.json
    └── .env.local           # Frontend environment variables
```

## Quick Start

### 1. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start the backend server (runs on port 5000)
npm run dev
```

### 2. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the frontend dev server (runs on port 3000)
npm run dev
```

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages` | Get all pages with sections and prompts |
| GET | `/api/prompts` | Get prompts filtered by pageId/section |
| POST | `/api/seed` | Scan project and seed database |
| POST | `/api/save` | Save prompt file content |
| GET | `/api/health` | Health check endpoint |

## Environment Variables

### Backend (.env)

```env
DATABASE_URL="postgresql://..."
PROJECT_ROOT=c:\your\project\path
PORT=5000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Running Both Servers

You can run both servers in separate terminals:

**Terminal 1 (Backend):**
```bash
cd prompts/backend && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd prompts/frontend && npm run dev
```

## Database

The application uses PostgreSQL with Prisma ORM. The schema includes:

- **Page** - Code files being tracked
- **Section** - Logical sections within a file
- **Prompt** - Modification templates for each section
- **MasterPrompt** - Top-level NLP instructions per file
- **StateVar** - State variables in tracked files
- **Function** - Functions in tracked files
- **Dependency** - File dependencies

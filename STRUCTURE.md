# Estrutura do Projeto

```
supervisor-comercial/
├── apps/
│   ├── api/                          # Fastify API
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── app.ts                # Fastify app setup
│   │   │   ├── routes/
│   │   │   │   ├── health.ts         # Health check
│   │   │   │   └── webhooks/
│   │   │   │       └── evolution.ts  # Webhook Evolution
│   │   │   └── config/
│   │   │       └── index.ts          # Config loader
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── worker/                       # BullMQ Worker
│       ├── src/
│       │   ├── index.ts              # Entry point
│       │   ├── queues/
│       │   │   ├── index.ts          # Queue setup
│       │   │   └── jobs/
│       │   │       ├── stt.ts        # STT job
│       │   │       ├── classify.ts   # Classify job
│       │   │       ├── analyze.ts    # Analyze job
│       │   │       ├── rag_index.ts  # RAG index job
│       │   │       └── report.ts     # Report job
│       │   ├── scheduler/
│       │   │   └── index.ts          # Cron scheduler
│       │   └── processors/
│       │       └── index.ts          # Job processors
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── db/                           # Database layer
│   │   ├── src/
│   │   │   ├── index.ts              # Exports
│   │   │   ├── pool.ts               # Pg Pool
│   │   │   ├── migrations/
│   │   │   │   └── runner.ts         # Migration runner
│   │   │   ├── repositories/
│   │   │   │   ├── instance.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── chat.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── analysis.ts
│   │   │   │   └── rag.ts
│   │   │   └── cli/
│   │   │       ├── migrate.ts
│   │   │       └── reset.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── evolution/                    # Evolution API client
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # HTTP client
│   │   │   ├── normalizer.ts         # Event normalizer
│   │   │   └── types.ts              # Zod schemas
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── llm/                          # LLM providers
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── registry.ts           # Provider registry
│   │   │   ├── providers/
│   │   │   │   ├── glm5.ts
│   │   │   │   ├── kimi.ts
│   │   │   │   ├── deepseek.ts
│   │   │   │   ├── opus.ts
│   │   │   │   └── gpt.ts
│   │   │   ├── fallback.ts           # Fallback logic
│   │   │   ├── prompts/
│   │   │   │   ├── classify.ts
│   │   │   │   ├── analyze.ts
│   │   │   │   └── summarize.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── stt/                          # Speech-to-Text (Groq)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # Groq Whisper client
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── embeddings/                   # Embeddings provider
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # OpenAI-compatible
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── rag/                          # RAG retrieval
│       ├── src/
│       │   ├── index.ts
│       │   ├── indexer.ts            # Index content
│       │   ├── retriever.ts          # Search similar
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
│
├── infra/
│   ├── migrations/
│   │   └── 001_init.sql              # Initial migration
│   └── docker/
│       ├── Dockerfile.api
│       └── Dockerfile.worker
│
├── admin/                            # Admin UI (HTML)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

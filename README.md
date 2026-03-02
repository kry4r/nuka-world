<div align="center">

# `nuka_world`

**Autonomous Multi-Agent Runtime with Memory, Skills, and World Simulation**

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go)](https://go.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](Dockerfile)
[![Neo4j](https://img.shields.io/badge/Neo4j-Memory_Graph-008CC1?style=flat-square&logo=neo4j)](https://neo4j.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Persistence-4169E1?style=flat-square&logo=postgresql)](https://postgresql.org)

<br>

<img src="docs/images/architecture-light.svg" alt="Nuka World Architecture (Light)" width="980"/>

</div>

## Overview

Nuka World is an agent platform for building persistent AI characters and teams.  
It combines runtime orchestration, graph memory, skill/tool execution, and a world simulation loop.

### Why This Project

- Multi-agent execution with agent-level persona and goal injection.
- Command and tool unification (`slash command -> callable tool` bridge).
- Memory + retrieval stack for long-term context and semantic recall.
- World loop for autonomous progression (`clock`, `heartbeat`, `relations`, `growth`).
- Multi-platform ingress through REST and adapters.

## Architecture Layers

| Layer | Responsibility | Main Components |
| --- | --- | --- |
| Gateway | External access and channel integration | REST API, Slack adapter, Discord adapter, Web client |
| Runtime Core | Request handling and agent execution | Command registry, agent engine, provider router, message router |
| Skills and Tools | Tool invocation and capability composition | Skill manager, command-as-tool bridge, MCP clients, orchestrator |
| Data and Retrieval | Persistence and context retrieval | Neo4j, PostgreSQL, Qdrant, Redis |
| World Simulation | Autonomous state evolution | World clock, heartbeat loop, relations graph, state and growth |

## Quick Start

### Prerequisites

- Go 1.25+
- PostgreSQL
- Neo4j
- Redis
- Qdrant (optional, for RAG)

### Option A: Docker (Fastest)

```bash
docker compose up -d
```

Default API port: `:8080`

### Option B: Local Run

```bash
git clone https://github.com/kry4r/nuka-world.git
cd nuka-world

cp configs/nuka.example.json configs/nuka.json
# edit configs/nuka.json

go build -o nuka ./cmd/nuka
./nuka
```

## Command Interface

All slash commands are available via API and can be invoked by the world agent through tool calling.

| Category | Commands |
| --- | --- |
| Discovery | `/help`, `/agents`, `/tools`, `/skills`, `/status`, `/providers`, `/models` |
| Agent Lifecycle | `/create_agent`, `/remove_agent`, `/agent_info`, `/assign_skill`, `/unassign_skill` |
| Collaboration | `/create_team`, `/team_msg`, `/broadcast`, `/assign_task`, `/create_schedule` |
| Memory and Retrieval | `/remember`, `/forget`, `/recall`, `/search` |

## Agent Profile Model

Each agent lives under `agents/<id>/`:

```text
agents/
  world/
    SOUL.md
    Agent.md
    GOALS.md
  _template/
```

- `SOUL.md`: personality, values, boundaries, communication style
- `Agent.md`: role, capabilities, tools, provider settings
- `GOALS.md`: short-term and long-term goals

## Project Layout

```text
cmd/nuka/          # entrypoint
internal/
  agent/           # runtime agent engine and profile loading
  api/             # HTTP handlers
  command/         # slash command registry and bridge
  gateway/         # REST, Slack, Discord
  memory/          # Neo4j memory graph
  rag/             # retrieval orchestration
  skill/           # skill manager
  store/           # PostgreSQL
  vectorstore/     # Qdrant
  orchestrator/    # Redis bus, scheduler, steward
  world/           # simulation loop
agents/            # agent profiles
skills/            # pluggable skills
migrations/        # SQL migrations
web/               # Next.js frontend
```

## License

MIT

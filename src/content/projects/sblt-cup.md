---
title: SBLT CUP
---
## The project

SBLT CUP is a tournament management platform built for the SBLT YouTube team’s TFT tournament in May 2026. It connects competition management, audience predictions and live tournament updates.

## Application engineering

- Designed a multi-stage tournament system covering five competition types, with eight groups of eight players and automated advancement.
- Built a prediction system with time-window controls and automatic scoring.
- Developed a composite player rating algorithm on a 0–1000 scale using four weighted factors.

## Real-time systems and delivery

- Implemented live updates through **SSE and Redis Pub/Sub**, including cross-instance broadcasting for a PM2 cluster.
- Built database, email and push notification channels with batch processing to address N+1 queries.
- Applied Redis caching with stampede protection and CI/CD practices.

## What this work brings together

Tournament rules, transactional application logic, real-time updates and reliable delivery in one system. The original project description reports support for more than 5,000 concurrent SSE connections; the source repository provides the context for the implementation.

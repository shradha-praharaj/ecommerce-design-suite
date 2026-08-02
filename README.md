# 🛒 ECommerce Design Suite

> A modern, type-safe full-stack e-commerce ecosystem featuring an **Express 5 API server**, an **Agentic AI Shopping Assistant**, a **Vite/React 19 storefront ("ShopNow Electronics")**, and an **interactive visual component mockup sandbox**. Built on **Contract-First API Design** with OpenAPI 3.1, Orval, and Drizzle ORM.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express.js](https://img.shields.io/badge/Express-5.0-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle_ORM-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![pnpm Workspaces](https://img.shields.io/badge/pnpm-Workspaces-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

---

## 🌟 Highlights & Key Features

### 🛍️ 1. ShopNow Electronics Storefront
- **Modern E-Commerce UI**: Built with React 19, Tailwind CSS v4, Radix UI primitives, Lucide icons, and Framer Motion micro-animations.
- **Product Discovery**: Fast full-text product search, category filters, price sliders, time-limited flash deals, and sort parameters (`price`, `rating`, `newest`).
- **Interactive Product Detail Pages (PDP)**: High-res image gallery with thumbnail switches, dynamic inventory badges, specifications grid, and verified customer star reviews.
- **Seamless Cart & Checkout**: Slide-out drawer & full cart view, promo code support (`BUILD50K`, `TECH20`, `GAMING10`), address modal, instant order placement, and order confirmation.
- **Dedicated Order Details & Tax Invoice System (`/order/:id`)**: Detailed line-item product cards, 4-stage live shipment tracker, price breakdown with promo coupon savings, and 1-click **Printable Tax Invoice Modal (`#INV-5`)**.

### 🤖 2. Multi-Agent AI Shopping Assistant
- **Agentic Router & Supervisor System**: An intelligent AI Chatbot (`AIChatbot.tsx`) powered by specialized backend sub-agents:
  - 📱 **Guided Product Advisor Agent**: Multi-turn 3-phase guided consultation engine for Mobiles, Laptops, Audio, Cameras, and Accessories (Phase 1: Use Case ➔ Phase 2: Budget Range ➔ Phase 3: #1 Best Match).
  - 🎮 **Gaming PC Build Advisor Agent**: Full 8-component rig selection, stockpile brand chooser (`ASUS`, `MSI`, `Gigabyte`, `Zotac`, `Corsair`, `NZXT`), and inline coupon savings calculator.
  - 💡 **Self-Correction & Error Recovery Engine**: Intercepts user feedback, prepends empathetic acknowledgments, and provides fault-tolerant try-catch fallbacks.
  - 🔍 **Product Search Agent**: Cascading catalog search with keyword intelligence.
  - 📦 **Order Tracking Agent**: Looks up status and line items for historical user orders.
  - ⚖️ **Comparison Agent**: Side-by-side feature comparisons between electronics.

### 🎯 3. Personalization & Recommendation Engine
- **Session-Aware Dynamic Widgets**: Dynamic carousels for `${firstName}'s Personal AI Preferences`, *Based on Your Tech Interests*, and *Trending Among Similar Shoppers*.
- **PDP & Cart Widgets**: *Frequently Bought Together* product bundles and real-time cross-sell recommendations.

### 🔄 4. Contract-First API & Codegen Pipeline
- **OpenAPI 3.1 Single Source of Truth**: Endpoints, parameters, schemas, and responses are declared in [`lib/api-spec/openapi.yaml`](file:///c:/My%20Projects/ECommerce-Design-Suite/ECommerce-Design-Suite/lib/api-spec/openapi.yaml).
- **Automated Orval Codegen**:
  - Generates Zod validation rules (`@workspace/api-zod`) for Express 5 backend routes.
  - Generates TanStack React Query hooks (`@workspace/api-client-react`) for type-safe frontend fetch calls.

---

## 🏗️ Architecture & Monorepo Map

```
ECommerce-Design-Suite/
├── artifacts/                  # Deployable Applications & Backend Services
│   ├── api-server/             # Express 5 REST API Server (Auth, Products, Cart, Orders, AI, Reviews)
│   ├── shopnow/                # Main React 19 Frontend Web App ("ShopNow Electronics")
│   └── mockup-sandbox/         # Isolated Visual Component Preview Canvas
├── lib/                        # Shared Workspace Libraries
│   ├── api-spec/               # OpenAPI 3.1 specification & Orval configuration
│   ├── api-zod/                # Auto-generated Zod request/response validation schemas
│   ├── api-client-react/       # Auto-generated React Query hooks with custom fetcher
│   └── db/                     # Drizzle ORM PostgreSQL connection pool & schemas
├── docs/                       # Architecture documents & implementation checklists
│   ├── AGENTIC-AI-ARCHITECTURE.md # Detailed Agentic AI system specification
│   └── ARCHITECTURE.md          # Full system architecture guide
└── replit.md                   # Workspace operating instructions & repo map
```

---

## 🛠️ Technology Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Monorepo** | `pnpm` Workspaces, TypeScript 5.9 | High-performance monorepo management |
| **Backend API** | Express 5, Node.js 24, Pino Logger | High-throughput REST API with structured logging |
| **Database & ORM** | PostgreSQL, Drizzle ORM | Type-safe schema definition and querying |
| **Contract & Validation** | OpenAPI 3.1, Orval, Zod | End-to-end code generation and runtime validation |
| **Frontend Framework** | React 19, Vite, TanStack Query v5 | Modern UI rendering with automatic server-state caching |
| **Styling & UI** | Tailwind CSS v4, Radix UI, Lucide | Responsive design system & accessible primitives |
| **AI Integration** | Agentic Multi-Agent Framework | Multi-agent AI shopping assistant system |

---

## ⚡ Quick Start Guide

### Prerequisites
- **Node.js**: v20 or higher
- **pnpm**: v9 or higher
- **PostgreSQL**: Local or hosted database instance

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/inkxe-shradha/ECommerce-Design-Suite.git
cd ECommerce-Design-Suite
pnpm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ecommerce
```

### 3. Database Migration & Seeding
```bash
# Push Drizzle schema to PostgreSQL
pnpm --filter @workspace/db run push

# Seed catalog & reviews
pnpm --filter @workspace/db run seed
```

### 4. Run Applications
```bash
# Start Express Backend API Server (Port 5000)
pnpm --filter @workspace/api-server run dev

# Start ShopNow Frontend App (Port 3000 / Vite)
pnpm --filter @workspace/shopnow run dev

# Start Mockup Preview Sandbox Canvas
pnpm --filter @workspace/mockup-sandbox run dev
```

---

## 🧪 Quality Assurance & Commands

| Command | Action |
| :--- | :--- |
| `pnpm run typecheck` | Executes TypeScript type verification across all workspaces |
| `pnpm run build` | Compiles production builds for all apps and shared libraries |
| `pnpm --filter @workspace/api-spec run codegen` | Re-syncs React Query hooks & Zod schemas from `openapi.yaml` |

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Crafted with ❤️ for full-stack e-commerce excellence. Happy coing
</p>

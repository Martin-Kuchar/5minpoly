![](image/arbitrage.png)

# Polymarket Arbitrage Trading Bot

**Automated dump-and-hedge trading for Polymarket’s 15-minute crypto Up/Down markets** — written in TypeScript, built on the official CLOB client, and designed to run hands-free across **BTC, ETH, SOL, and XRP**.

[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## Why this exists

Short-dated prediction markets move fast. When one side **dumps** in seconds, the other side often lags — and if you can buy both legs cheaply enough, their combined cost can sit **below $1 per paired share**, locking in a structural edge before resolution.

This bot **watches** those markets continuously, **detects** sharp moves that match your thresholds, **executes** a two-leg cycle (dump capture → hedge), and **tracks** P&amp;L — with optional **simulation** so you can validate behavior before risking capital.

---

## What it does

| Capability | Description |
|------------|-------------|
| **Multi-asset** | Trade one or many markets: `btc`, `eth`, `sol`, `xrp` (comma-separated). |
| **Auto-discovery** | Resolves the active **15m Up/Down** market per asset from Polymarket’s Gamma API and rolls forward each new period. |
| **Dump detection** | Uses recent ask history to flag a leg when price falls by your **move threshold** within a short time window. |
| **Hedge logic** | After leg 1, waits for leg 2 when **leg1 entry + opposite ask ≤ your sum target** (e.g. 0.95). |
| **Risk controls** | Configurable **stop-loss hedge** if the favorable hedge does not appear within **N minutes**. |
| **Settlement** | On market close, reconciles winners/losers and can **redeem** winning positions on-chain (production). |
| **Logging** | Streams activity to stderr and appends a **history** file for review and auditing. |

---

## Strategy in one diagram

```text
New 15m round
     │
     ▼
┌─────────────────┐     rapid drop on Up or Down     ┌──────────────┐
│ Watch window    │ ───────────────────────────────► │ Buy dumped   │
│ (first N min)   │                                  │ leg (Leg 1)  │
└─────────────────┘                                  └──────┬───────┘
                                                              │
                              opposite ask cheap enough       │
                              (sum ≤ target)                  ▼
                                                     ┌──────────────┐
                                                     │ Buy hedge    │
                                                     │ (Leg 2)      │
                                                     └──────┬───────┘
                                                            │
                     timeout? ──────────────────────────────┤
                                                            ▼
                                                 Stop-loss hedge path
```

*This is a simplified view of the logic implemented in the trader module; tune all thresholds via environment variables.*

---


## Project layout

```text
src/
  main.ts           # Entry: discovery, monitors, period rollover
  monitor.ts        # Price polling & snapshots
  dumpHedgeTrader.ts # Dump → hedge → stop-loss → settlement tracking
  api.ts            # Gamma, CLOB, orders, redemption, activity
  config.ts         # Environment loading
  models.ts         # Shared types
  logger.ts         # History file + stderr
```

---


## Quick start

### Prerequisites

- [Node.js 16+ or newer](https://nodejs.org/en/download)
- A Polymarket-compatible wallet and (for live trading) USDC on **Polygon** and understanding of **EOA vs Proxy** signing (`SIGNATURE_TYPE` in `.env`)

### Install

```bash
git clone https://github.com/Poly-Mike/polymarket-arbitrage-trading-bot.git

cd polymarket-arbitrage-trading-bot

# Edit .env — see table below
cp .env.example .env

npm install

```


## Configuration (`.env`)

Copy `.env.example` to `.env` and adjust.

| Variable | Role |
|----------|------|
| `PRIVATE_KEY` | Requirements for the test and production environments. (We recommend using an EOA private key, such as one exported from MetaMask Wallet.) |
| `PROXY_WALLET_ADDRESS` | Polymarket proxy/profile address if applicable. (When using an EOA private key, you can leave this field blank.) |
| `SIGNATURE_TYPE` | `0` EOA, `1` Proxy. |
| `MARKETS` | e.g. `btc` or `btc,eth,sol,xrp` |
| `CHECK_INTERVAL_MS` | How often to poll prices (default `1000`). |
| `DUMP_HEDGE_SHARES` | Size per leg (shares). |
| `DUMP_HEDGE_SUM_TARGET` | Max combined price for hedge (e.g. `0.95`). |
| `DUMP_HEDGE_MOVE_THRESHOLD` | Min fractional drop to count as a dump (e.g. `0.15` = 15%). |
| `DUMP_HEDGE_WINDOW_MINUTES` | Only look for dumps in the first N minutes of the round. |
| `DUMP_HEDGE_STOP_LOSS_MAX_WAIT_MINUTES` | Force hedge path if no arb within this time. |
| `PRODUCTION` | `false` = simulation-friendly config flag; use `--production` for live execution. |

**Important:** To get started, if you're using an EOA wallet, simply enter your `PRIVATE_KEY` in the `.env` file. You can leave `PROXY_WALLET_ADDRESS` blank, and use the default values for the other parameters. Then run the test environment with `npm run sim`—this will not use any funds from your wallet. Finally, adjust the remaining parameters based on the actual results until you determine that it is fully profitable.

---


### Run modes

| Command | Purpose |
|---------|---------|
| `npm run sim` | **Simulation** — logs trades, no real orders (`--simulation`). |
| `npm run prod` | **Production** — real CLOB orders (`--production`). |
| `npm start` | Same as build output; default CLI behavior favors simulation unless you pass `--production`. |

**Important:** For **live trading**, set `PRODUCTION=true` in `.env` *and* use `npm run prod` so the process does not stay in simulation mode. If you are located in a region where Polymarket is restricted, please enable a VPN or use an unrestricted VPS.

---


## Operational safety checklist

- Run in simulation first and inspect `history.toml` behavior across multiple rounds.
- Start with low `DUMP_HEDGE_SHARES` and conservative thresholds in production.
- Keep private keys out of source control and rotate compromised credentials immediately.

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.


## Disclaimer

This software is provided **for educational and research purposes only**. Prediction markets and automated trading involve **substantial financial risk**, including possible **total loss**. Past or simulated behavior does **not** guarantee future results. You are solely responsible for compliance with applicable laws, exchange terms, and tax obligations. **Nothing here is investment, legal, or tax advice.**

---


## Contributing

This project was created collaboratively by the Polymarket developer community and is capable of generating real profits. If you find it helpful, please give it a star. If you have any suggestions for improving the strategy, please add the administrator as a friend and join our community—your feedback will be invaluable for future improvements!  **Discord:** **polymarketdev_mike** 

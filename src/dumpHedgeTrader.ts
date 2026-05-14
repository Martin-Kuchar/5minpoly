import { PolymarketApi } from "./api";
import type { MarketSnapshot, MarketData } from "./models";
import { tokenPriceAsk } from "./models";
import { logCsvRow, logPrintln } from "./logger";
import { ROUND_DURATION_SECONDS } from "./constants";

interface MarketState {
  conditionId: string;
  periodTimestamp: number;
  upTokenId: string | null;
  downTokenId: string | null;
  pendingBuyOffsets: Set<number>;
  closureChecked: boolean;
}

interface CycleTrade {
  marketName: string;
  conditionId: string;
  periodTimestamp: number;
  upTokenId: string | null;
  downTokenId: string | null;
  upShares: number;
  downShares: number;
  upAvgPrice: number;
  downAvgPrice: number;
  expectedProfit: number;
}

export class DumpHedgeTrader {
  private api: PolymarketApi;
  private simulationMode: boolean;
  private shares: number;
  private buyOffsets: number[];
  private marketStates = new Map<string, MarketState>();
  private trades = new Map<string, CycleTrade>();
  private totalProfit = 0;
  private periodProfit = 0;

  constructor(
    api: PolymarketApi,
    simulationMode: boolean,
    shares: number,
    buyOffsets: number[] = [120, 60, 30, 20, 10]
  ) {
    this.api = api;
    this.simulationMode = simulationMode;
    this.shares = shares;
    this.buyOffsets = buyOffsets;
  }

  async processSnapshot(snapshot: MarketSnapshot): Promise<void> {
    const marketName = snapshot.marketName;
    const marketData: MarketData = snapshot.btcMarket15m;
    const periodTimestamp = snapshot.btc15mPeriodTimestamp;
    const conditionId = marketData.conditionId;
    const remaining = snapshot.btc15mTimeRemaining;

    let state = this.marketStates.get(conditionId);
    if (!state || state.periodTimestamp !== periodTimestamp) {
      state = {
        conditionId,
        periodTimestamp,
        upTokenId: marketData.upToken?.tokenId ?? null,
        downTokenId: marketData.downToken?.tokenId ?? null,
        pendingBuyOffsets: new Set(this.buyOffsets),
        closureChecked: false,
      };
      this.marketStates.set(conditionId, state);
      logPrintln(
        `${marketName}: New 5m round started (period: ${periodTimestamp}) | Scheduled buys at ${this.buyOffsets
          .map((s) => `${s}s`)
          .join(", ")}`
      );
    }

    const s = this.marketStates.get(conditionId)!;
    if (marketData.upToken) s.upTokenId = marketData.upToken.tokenId;
    if (marketData.downToken) s.downTokenId = marketData.downToken.tokenId;

    const upAsk = marketData.upToken ? tokenPriceAsk(marketData.upToken) : 0;
    const downAsk = marketData.downToken ? tokenPriceAsk(marketData.downToken) : 0;

    if (upAsk <= 0 || downAsk <= 0 || remaining <= 0) return;

    for (const offset of [...s.pendingBuyOffsets].sort((a, b) => b - a)) {
      if (remaining > offset) continue;

      const side = upAsk >= downAsk ? "Up" : "Down";
      const tokenId = side === "Up" ? s.upTokenId : s.downTokenId;
      const price = side === "Up" ? upAsk : downAsk;

      if (!tokenId) {
        s.pendingBuyOffsets.delete(offset);
        continue;
      }

      if (price < 0.8 || price > 0.995) {
        logPrintln(
          `${marketName}: Scheduled buy at ${offset}s before close skipped | ${side} @ $${price.toFixed(4)} not in [0.8, 0.99]`
        );
        s.pendingBuyOffsets.delete(offset);
        continue;
      }

      logPrintln(
        `${marketName}: Scheduled buy at ${offset}s before close triggered | ${side} @ $${price.toFixed(4)}`
      );

      await this.executeBuy(marketName, side, tokenId, this.shares, price);
      await this.recordTrade(marketName, conditionId, periodTimestamp, side, tokenId, this.shares, price);
      logCsvRow([
        new Date().toISOString(),
        marketName,
        conditionId,
        periodTimestamp,
        remaining,
        side,
        tokenId,
        this.shares,
        price,
        `buy-${offset}s`,
        "",
      ]);

      s.pendingBuyOffsets.delete(offset);
    }
  }

  private async executeBuy(
    marketName: string,
    side: string,
    tokenId: string,
    shares: number,
    price: number
  ): Promise<void> {
    logPrintln(`${marketName} BUY ${side} ${shares} shares @ $${price.toFixed(4)}`);
    if (this.simulationMode) {
      logPrintln("SIMULATION: Order executed");
    } else {
      const size = Math.round(shares * 10000) / 10000;
      try {
        await this.api.placeMarketOrder(tokenId, size, "BUY");
        logPrintln("REAL: Order placed");
      } catch (e) {
        console.warn("Failed to place order:", e);
        throw e;
      }
    }
  }

  private async recordTrade(
    marketName: string,
    conditionId: string,
    periodTimestamp: number,
    side: string,
    tokenId: string,
    shares: number,
    price: number
  ): Promise<void> {
    const key = `${conditionId}:${periodTimestamp}`;
    let trade = this.trades.get(key);
    if (!trade) {
      trade = {
        marketName,
        conditionId,
        periodTimestamp,
        upTokenId: null,
        downTokenId: null,
        upShares: 0,
        downShares: 0,
        upAvgPrice: 0,
        downAvgPrice: 0,
        expectedProfit: 0,
      };
      this.trades.set(key, trade);
    }
    if (!trade.marketName) {
      trade.marketName = marketName;
    }

    if (side === "Up") {
      const oldTotal = trade.upShares * trade.upAvgPrice;
      trade.upShares += shares;
      trade.upAvgPrice =
        trade.upShares > 0 ? (oldTotal + shares * price) / trade.upShares : price;
      trade.upTokenId = tokenId;
    } else {
      const oldTotal = trade.downShares * trade.downAvgPrice;
      trade.downShares += shares;
      trade.downAvgPrice =
        trade.downShares > 0
          ? (oldTotal + shares * price) / trade.downShares
          : price;
      trade.downTokenId = tokenId;
    }
  }

  async checkMarketClosure(): Promise<void> {
    const tradesList = Array.from(this.trades.entries()).map(([k, v]) => [
      k,
      { ...v },
    ]) as Array<[string, CycleTrade]>;
    if (tradesList.length === 0) return;

    const currentTimestamp = Math.floor(Date.now() / 1000);

    for (const [marketKey, trade] of tradesList) {
      const marketEndTimestamp = trade.periodTimestamp + ROUND_DURATION_SECONDS;
      if (currentTimestamp < marketEndTimestamp) continue;

      const state = this.marketStates.get(trade.conditionId);
      if (state?.closureChecked) continue;

      const timeSinceClose = currentTimestamp - marketEndTimestamp;
      const minutes = Math.floor(timeSinceClose / 60);
      const seconds = timeSinceClose % 60;
      logPrintln(
        `Market ${trade.conditionId.slice(0, 8)} closed ${minutes}m ${seconds}s ago | Checking resolution...`
      );

      let market;
      try {
        market = await this.api.getMarket(trade.conditionId);
      } catch (e) {
        console.warn("Failed to fetch market:", e);
        continue;
      }

      if (!market.closed) {
        logPrintln(`Market ${trade.conditionId.slice(0, 8)} not yet closed, will retry`);
        continue;
      }

      logPrintln(`Market ${trade.conditionId.slice(0, 8)} is closed and resolved`);

      const upIsWinner = trade.upTokenId
        ? market.tokens.some(
            (t) => t.token_id === trade.upTokenId && t.winner
          )
        : false;
      const downIsWinner = trade.downTokenId
        ? market.tokens.some(
            (t) => t.token_id === trade.downTokenId && t.winner
          )
        : false;

      const resolvedOutcome =
        market.tokens.find((t) => t.winner)?.outcome ??
        (upIsWinner ? "Up" : downIsWinner ? "Down" : "Unknown");
      const resolvedLabel =
        resolvedOutcome.toLowerCase().includes("yes")
          ? "yes"
          : resolvedOutcome.toLowerCase().includes("no")
          ? "no"
          : resolvedOutcome;

      logPrintln(`Market ${trade.conditionId.slice(0, 8)} resolved to ${resolvedLabel}`);
      logCsvRow([
        new Date().toISOString(),
        trade.marketName,
        trade.conditionId,
        trade.periodTimestamp,
        "",
        "",
        "",
        "",
        "",
        "resolution",
        resolvedLabel,
      ]);

      let actualProfit = 0;

      if (trade.upShares > 0.001) {
        if (upIsWinner) {
          if (!this.simulationMode && trade.upTokenId) {
            try {
              await this.api.redeemTokens(trade.conditionId, trade.upTokenId, "Up");
            } catch (e) {
              console.warn("Failed to redeem Up token:", e);
            }
          }
          const value = trade.upShares * 1;
          const cost = trade.upAvgPrice * trade.upShares;
          actualProfit += value - cost;
          logPrintln(
            `Market Closed - Up Winner: ${trade.upShares.toFixed(2)} @ $${trade.upAvgPrice.toFixed(4)} | Profit: $${(value - cost).toFixed(2)}`
          );
        } else {
          actualProfit -= trade.upAvgPrice * trade.upShares;
          logPrintln(
            `Market Closed - Up Lost: ${trade.upShares.toFixed(2)} @ $${trade.upAvgPrice.toFixed(4)}`
          );
        }
      }

      if (trade.downShares > 0.001) {
        if (downIsWinner) {
          if (!this.simulationMode && trade.downTokenId) {
            try {
              await this.api.redeemTokens(trade.conditionId, trade.downTokenId, "Down");
            } catch (e) {
              console.warn("Failed to redeem Down token:", e);
            }
          }
          const value = trade.downShares * 1;
          const cost = trade.downAvgPrice * trade.downShares;
          actualProfit += value - cost;
          logPrintln(
            `Market Closed - Down Winner: ${trade.downShares.toFixed(2)} @ $${trade.downAvgPrice.toFixed(4)} | Profit: $${(value - cost).toFixed(2)}`
          );
        } else {
          actualProfit -= trade.downAvgPrice * trade.downShares;
          logPrintln(
            `Market Closed - Down Lost: ${trade.downShares.toFixed(2)} @ $${trade.downAvgPrice.toFixed(4)}`
          );
        }
      }

      if (trade.expectedProfit !== 0) {
        this.totalProfit = this.totalProfit - trade.expectedProfit + actualProfit;
        this.periodProfit =
          this.periodProfit - trade.expectedProfit + actualProfit;
      } else {
        this.totalProfit += actualProfit;
        this.periodProfit += actualProfit;
      }

      logPrintln(
        `Period Profit: $${this.periodProfit.toFixed(2)} | Total Profit: $${this.totalProfit.toFixed(2)}`
      );

      const s = this.marketStates.get(trade.conditionId);
      if (s) s.closureChecked = true;
      this.trades.delete(marketKey);
      logPrintln("Trade removed from tracking");
    }
  }

  async resetPeriod(): Promise<void> {
    this.marketStates.clear();
    logPrintln("Dump-Hedge Trader: Period reset");
  }

  async getTotalProfit(): Promise<number> {
    return this.totalProfit;
  }

  async getPeriodProfit(): Promise<number> {
    return this.periodProfit;
  }
}

# Indicator Library Implementation Guide

## Overview

This guide provides detailed implementation specifications for the modular indicator library, including code examples, data structures, and integration patterns.

## Package Dependencies

### Required Dependencies

```json
{
  "dependencies": {
    "technicalindicators": "^6.0.0",
    "lodash": "^4.17.21"
  }
}
```

### Why technicalindicators?
- **Industry Standard**: Widely used in financial applications
- **Comprehensive**: 100+ indicators including all required ones
- **Performance**: Optimized calculations with WebAssembly support
- **Accuracy**: Well-tested implementations
- **Maintenance**: Active development and community support

## Core Interface Definitions

### Indicator Interface

```typescript
// lib/indicators/types.ts
export interface IndicatorParameters {
  [key: string]: number | string | boolean;
}

export type IndicatorSignal = 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';

export interface IndicatorValue {
  value: number;
  signal: IndicatorSignal;
  confidence: number;
}

export interface IndicatorResult {
  name: string;
  value: number | IndicatorValues | any;
  signal: IndicatorSignal;
  confidence: number;
  timestamp: Date;
  metadata: {
    period: number;
    parameters: IndicatorParameters;
    dataPoints: number;
    calculationTime: number;
  };
}

export interface OHLCVData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
  splitRatio?: number;
  dividend?: number;
}

export interface CompositeScore {
  score: number; // 0-100
  signal: IndicatorSignal;
  confidence: number; // 0-1
  breakdown: Map<string, { score: number; weight: number; confidence: number }>;
  calculationTime: number;
}
```

### Base Indicator Class

```javascript
// lib/indicators/BaseIndicator.js
export class BaseIndicator {
  constructor(config) {
    this.name = config.name;
    this.version = config.version || '1.0.0';
    this.requiredPeriods = config.requiredPeriods;
    this.parameters = config.parameters || {};
    this.logger = config.logger;
  }

  /**
   * Validate indicator parameters
   * @param {IndicatorParameters} params 
   * @returns {boolean}
   */
  validateParameters(params) {
    throw new Error('validateParameters method must be implemented');
  }

  /**
   * Get optimal default parameters
   * @returns {IndicatorParameters}
   */
  getOptimalParameters() {
    throw new Error('getOptimalParameters method must be implemented');
  }

  /**
   * Calculate indicator values
   * @param {OHLCVData[]} data 
   * @returns {IndicatorResult}
   */
  calculate(data) {
    throw new Error('calculate method must be implemented');
  }

  /**
   * Normalize signal to standard format
   * @param {any} rawSignal 
   * @returns {IndicatorSignal}
   */
  normalizeSignal(rawSignal) {
    // Default implementation
    if (rawSignal === 'BUY' || rawSignal === 'BULLISH') return 'BUY';
    if (rawSignal === 'SELL' || rawSignal === 'BEARISH') return 'SELL';
    return 'HOLD';
  }

  /**
   * Calculate confidence based on signal strength
   * @param {IndicatorResult} result 
   * @returns {number}
   */
  calculateConfidence(result) {
    // Default confidence calculation
    return 0.8; // 80% default confidence
  }

  /**
   * Validate data completeness
   * @param {OHLCVData[]} data 
   * @returns {boolean}
   */
  validateData(data) {
    if (!data || data.length < this.requiredPeriods) {
      throw new Error(`Insufficient data for ${this.name}. Required: ${this.requiredPeriods}, Provided: ${data.length}`);
    }
    return true;
  }
}
```

## Indicator Implementations

### RSI Indicator

```javascript
// lib/indicators/RSI.js
import { RSI as TI_RSI } from 'technicalindicators';
import { BaseIndicator } from './BaseIndicator.js';

export class RSIIndicator extends BaseIndicator {
  constructor(parameters = {}) {
    super({
      name: 'RSI',
      requiredPeriods: 15, // 14 periods + 1 for calculation
      parameters: {
        period: 14,
        ...parameters
      }
    });
  }

  validateParameters(params) {
    const period = params.period || this.parameters.period;
    return period > 0 && period < 100;
  }

  getOptimalParameters() {
    return { period: 14 };
  }

  calculate(data) {
    const startTime = Date.now();
    this.validateData(data);

    const closes = data.map(d => d.close);
    const period = this.parameters.period;

    // Use technicalindicators RSI
    const rsi = new TI_RSI({
      period: period,
      values: closes
    });

    const rsiValues = rsi.getResult();
    const currentRSI = rsiValues[rsiValues.length - 1];

    // Determine signal based on RSI levels
    let signal = 'HOLD';
    let confidence = 0.7;

    if (currentRSI < 30) {
      signal = 'BUY';
      confidence = 0.8 + (30 - currentRSI) / 30 * 0.2; // Higher confidence for deeper oversold
    } else if (currentRSI > 70) {
      signal = 'SELL';
      confidence = 0.8 + (currentRSI - 70) / 30 * 0.2; // Higher confidence for deeper overbought
    } else {
      signal = 'HOLD';
      confidence = 0.5 + Math.abs(currentRSI - 50) / 50 * 0.3; // Higher confidence near middle
    }

    const calculationTime = Date.now() - startTime;

    return {
      name: this.name,
      value: currentRSI,
      signal: signal,
      confidence: confidence,
      timestamp: new Date(),
      metadata: {
        period: period,
        parameters: this.parameters,
        dataPoints: data.length,
        calculationTime: calculationTime
      }
    };
  }
}
```

### MACD Indicator

```javascript
// lib/indicators/MACD.js
import { MACD as TI_MACD } from 'technicalindicators';
import { BaseIndicator } from './BaseIndicator.js';

export class MACDIndicator extends BaseIndicator {
  constructor(parameters = {}) {
    super({
      name: 'MACD',
      requiredPeriods: 27, // Slow period + 1
      parameters: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMA: false,
        ...parameters
      }
    });
  }

  validateParameters(params) {
    const { fastPeriod, slowPeriod, signalPeriod } = params;
    return fastPeriod > 0 && slowPeriod > fastPeriod && signalPeriod > 0;
  }

  getOptimalParameters() {
    return {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    };
  }

  calculate(data) {
    const startTime = Date.now();
    this.validateData(data);

    const closes = data.map(d => d.close);
    const { fastPeriod, slowPeriod, signalPeriod, SimpleMA } = this.parameters;

    // Calculate MACD
    const macd = new TI_MACD({
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMA,
      values: closes
    });

    const macdResult = macd.getResult();
    const current = macdResult[macdResult.length - 1];

    // Determine signal based on MACD crossovers
    let signal = 'HOLD';
    let confidence = 0.6;

    if (current.histogram > 0) {
      if (current.histogram > Math.abs(current.signal) * 0.1) {
        signal = 'BUY';
        confidence = 0.7 + Math.min(current.histogram / 5, 0.3); // Strength-based confidence
      } else {
        signal = 'HOLD';
        confidence = 0.5;
      }
    } else {
      if (Math.abs(current.histogram) > Math.abs(current.signal) * 0.1) {
        signal = 'SELL';
        confidence = 0.7 + Math.min(Math.abs(current.histogram) / 5, 0.3);
      } else {
        signal = 'HOLD';
        confidence = 0.5;
      }
    }

    const calculationTime = Date.now() - startTime;

    return {
      name: this.name,
      value: {
        macd: current.MACD,
        signal: current.signal,
        histogram: current.histogram
      },
      signal: signal,
      confidence: confidence,
      timestamp: new Date(),
      metadata: {
        period: slowPeriod,
        parameters: this.parameters,
        dataPoints: data.length,
        calculationTime: calculationTime
      }
    };
  }
}
```

### Bollinger Bands Indicator

```javascript
// lib/indicators/BollingerBands.js
import { BollingerBands as TI_BollingerBands } from 'technicalindicators';
import { BaseIndicator } from './BaseIndicator.js';

export class BollingerBandsIndicator extends BaseIndicator {
  constructor(parameters = {}) {
    super({
      name: 'BollingerBands',
      requiredPeriods: 21, // 20 periods + 1
      parameters: {
        period: 20,
        stdDev: 2,
        ...parameters
      }
    });
  }

  validateParameters(params) {
    const { period, stdDev } = params;
    return period > 0 && stdDev > 0;
  }

  getOptimalParameters() {
    return {
      period: 20,
      stdDev: 2
    };
  }

  calculate(data) {
    const startTime = Date.now();
    this.validateData(data);

    const closes = data.map(d => d.close);
    const { period, stdDev } = this.parameters;

    // Calculate Bollinger Bands
    const bollinger = new TI_BollingerBands({
      period,
      stdDev,
      values: closes
    });

    const bbResult = bollinger.getResult();
    const current = bbResult[bbResult.length - 1];
    const currentPrice = closes[closes.length - 1];

    // Determine signal based on price position relative to bands
    let signal = 'HOLD';
    let confidence = 0.6;

    const upperBand = current.upper;
    const lowerBand = current.lower;
    const middleBand = current.middle;

    const position = (currentPrice - lowerBand) / (upperBand - lowerBand);

    if (position < 0.2) {
      // Price near lower band - potential buy
      signal = 'BUY';
      confidence = 0.7 + (0.2 - position) * 1.5;
    } else if (position > 0.8) {
      // Price near upper band - potential sell
      signal = 'SELL';
      confidence = 0.7 + (position - 0.8) * 1.5;
    } else {
      // Price in middle - hold
      signal = 'HOLD';
      confidence = 0.5 + Math.abs(position - 0.5) * 0.6;
    }

    // Additional confidence based on band width (volatility)
    const bandwidth = (upperBand - lowerBand) / middleBand;
    confidence *= (1 + bandwidth); // Higher volatility = higher confidence

    const calculationTime = Date.now() - startTime;

    return {
      name: this.name,
      value: {
        upper: current.upper,
        middle: current.middle,
        lower: current.lower,
        position: position,
        bandwidth: bandwidth
      },
      signal: signal,
      confidence: Math.min(1, confidence),
      timestamp: new Date(),
      metadata: {
        period: period,
        parameters: this.parameters,
        dataPoints: data.length,
        calculationTime: calculationTime
      }
    };
  }
}
```

### Stochastic Oscillator Indicator

```javascript
// lib/indicators/Stochastic.js
import { Stochastic as TI_Stochastic } from 'technicalindicators';
import { BaseIndicator } from './BaseIndicator.js';

export class StochasticIndicator extends BaseIndicator {
  constructor(parameters = {}) {
    super({
      name: 'Stochastic',
      requiredPeriods: 17, // 14 + 3
      parameters: {
        period: 14,
        signalPeriod: 3,
        ...parameters
      }
    });
  }

  validateParameters(params) {
    const { period, signalPeriod } = params;
    return period > 0 && signalPeriod > 0;
  }

  getOptimalParameters() {
    return {
      period: 14,
      signalPeriod: 3
    };
  }

  calculate(data) {
    const startTime = Date.now();
    this.validateData(data);

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const { period, signalPeriod } = this.parameters;

    // Calculate Stochastic
    const stochastic = new TI_Stochastic({
      period,
      signalPeriod,
      high: highs,
      low: lows,
      close: closes
    });

    const stochResult = stochastic.getResult();
    const current = stochResult[stochResult.length - 1];

    // Determine signal based on %K and %D crossovers and levels
    let signal = 'HOLD';
    let confidence = 0.6;

    const k = current.k;
    const d = current.d;

    // Check for crossovers
    const prev = stochResult[stochResult.length - 2];
    const kPrev = prev.k;
    const dPrev = prev.d;

    const kCrossUp = kPrev < dPrev && k > d;
    const kCrossDown = kPrev > dPrev && k < d;

    if (kCrossUp && k < 20) {
      // Bullish crossover in oversold zone
      signal = 'BUY';
      confidence = 0.9;
    } else if (kCrossDown && k > 80) {
      // Bearish crossover in overbought zone
      signal = 'SELL';
      confidence = 0.9;
    } else if (k < 20) {
      // Oversold but no crossover
      signal = 'BUY';
      confidence = 0.7;
    } else if (k > 80) {
      // Overbought but no crossover
      signal = 'SELL';
      confidence = 0.7;
    } else {
      signal = 'HOLD';
      confidence = 0.5;
    }

    const calculationTime = Date.now() - startTime;

    return {
      name: this.name,
      value: {
        k: k,
        d: d,
        crossover: kCrossUp ? 'bullish' : kCrossDown ? 'bearish' : 'none'
      },
      signal: signal,
      confidence: confidence,
      timestamp: new Date(),
      metadata: {
        period: period,
        parameters: this.parameters,
        dataPoints: data.length,
        calculationTime: calculationTime
      }
    };
  }
}
```

### Volume Indicators

```javascript
// lib/indicators/Volume.js
import { OBV as TI_OBV, SMA as TI_SMA } from 'technicalindicators';
import { BaseIndicator } from './BaseIndicator.js';

export class VolumeIndicator extends BaseIndicator {
  constructor(parameters = {}) {
    super({
      name: 'Volume',
      requiredPeriods: 21, // 20 periods + 1
      parameters: {
        maPeriod: 20,
        ...parameters
      }
    });
  }

  validateParameters(params) {
    return params.maPeriod > 0;
  }

  getOptimalParameters() {
    return { maPeriod: 20 };
  }

  calculate(data) {
    const startTime = Date.now();
    this.validateData(data);

    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const { maPeriod } = this.parameters;

    // Calculate OBV
    const obv = new TI_OBV({
      close: closes,
      volume: volumes
    });
    const obvResult = obv.getResult();

    // Calculate Volume MA
    const volumeMA = new TI_SMA({
      period: maPeriod,
      values: volumes
    });
    const volumeMAResult = volumeMA.getResult();

    const currentVolume = volumes[volumes.length - 1];
    const currentOBV = obvResult[obvResult.length - 1];
    const avgVolume = volumeMAResult[volumeMAResult.length - 1];

    // Determine signal based on volume analysis
    let signal = 'HOLD';
    let confidence = 0.6;

    const volumeRatio = currentVolume / avgVolume;

    // OBV trend analysis
    const obvTrend = this.analyzeOBVTrend(obvResult);

    if (volumeRatio > 1.5 && obvTrend === 'up') {
      // High volume with positive OBV trend
      signal = 'BUY';
      confidence = 0.8;
    } else if (volumeRatio > 1.5 && obvTrend === 'down') {
      // High volume with negative OBV trend
      signal = 'SELL';
      confidence = 0.8;
    } else if (volumeRatio < 0.5) {
      // Low volume - indecision
      signal = 'HOLD';
      confidence = 0.4;
    } else {
      // Normal volume - follow OBV trend
      signal = obvTrend === 'up' ? 'BUY' : obvTrend === 'down' ? 'SELL' : 'HOLD';
      confidence = 0.6;
    }

    const calculationTime = Date.now() - startTime;

    return {
      name: this.name,
      value: {
        obv: currentOBV,
        volumeRatio: volumeRatio,
        avgVolume: avgVolume,
        trend: obvTrend
      },
      signal: signal,
      confidence: confidence,
      timestamp: new Date(),
      metadata: {
        period: maPeriod,
        parameters: this.parameters,
        dataPoints: data.length,
        calculationTime: calculationTime
      }
    };
  }

  analyzeOBVTrend(obvValues) {
    const recent = obvValues.slice(-10);
    const slope = this.calculateSlope(recent);
    
    if (slope > 0.1) return 'up';
    if (slope < -0.1) return 'down';
    return 'flat';
  }

  calculateSlope(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }
}
```

## Indicator Registry

```javascript
// lib/indicators/IndicatorRegistry.js
import { RSIIndicator } from './RSI.js';
import { SMAIndicator } from './SMA.js';
import { MACDIndicator } from './MACD.js';
import { BollingerBandsIndicator } from './BollingerBands.js';
import { StochasticIndicator } from './Stochastic.js';
import { VolumeIndicator } from './Volume.js';

export class IndicatorRegistry {
  constructor() {
    this.indicators = new Map();
    this.defaultIndicators = [
      'RSI', 'SMA', 'MACD', 'BollingerBands', 'Stochastic', 'Volume'
    ];
    this.initializeDefaultIndicators();
  }

  initializeDefaultIndicators() {
    const indicatorClasses = {
      RSI: RSIIndicator,
      SMA: SMAIndicator,
      MACD: MACDIndicator,
      BollingerBands: BollingerBandsIndicator,
      Stochastic: StochasticIndicator,
      Volume: VolumeIndicator
    };

    for (const [name, IndicatorClass] of Object.entries(indicatorClasses)) {
      this.register(new IndicatorClass());
    }
  }

  register(indicator) {
    this.indicators.set(indicator.name, indicator);
  }

  get(name) {
    return this.indicators.get(name) || null;
  }

  getAll() {
    return Array.from(this.indicators.values());
  }

  getAvailableIndicators() {
    return Array.from(this.indicators.keys());
  }

  calculateIndicator(name, data, parameters = {}) {
    const indicator = this.get(name);
    if (!indicator) {
      throw new Error(`Indicator ${name} not found`);
    }

    // Update parameters if provided
    if (Object.keys(parameters).length > 0) {
      indicator.parameters = { ...indicator.parameters, ...parameters };
    }

    return indicator.calculate(data);
  }

  calculateAll(data, indicatorNames = null) {
    const names = indicatorNames || this.defaultIndicators;
    const results = new Map();

    for (const name of names) {
      try {
        const result = this.calculateIndicator(name, data);
        results.set(name, result);
      } catch (error) {
        console.error(`Error calculating ${name}:`, error.message);
        // Continue with other indicators
      }
    }

    return results;
  }

  calculateBatch(symbols, dataMap, indicatorNames = null) {
    const results = new Map();

    for (const symbol of symbols) {
      const data = dataMap.get(symbol);
      if (data) {
        results.set(symbol, this.calculateAll(data, indicatorNames));
      }
    }

    return results;
  }
}
```

## Scoring Engine

```javascript
// lib/indicators/ScoringEngine.js
export class ScoringEngine {
  constructor() {
    // Default weights sum to 1.0
    this.weights = new Map([
      ['MACD', 0.25],
      ['RSI', 0.20],
      ['BollingerBands', 0.20],
      ['Stochastic', 0.15],
      ['Volume', 0.10],
      ['SMA', 0.10]
    ]);

    this.signalValues = new Map([
      ['STRONG_BUY', 100],
      ['BUY', 80],
      ['HOLD', 50],
      ['SELL', 20],
      ['STRONG_SELL', 0]
    ]);
  }

  setWeights(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error('Weights must sum to 1.0');
    }

    this.weights = new Map(Object.entries(weights));
  }

  normalizeSignal(signal) {
    return this.signalValues.get(signal) || 50;
  }

  calculateConsensusFactor(results) {
    const signals = Array.from(results.values()).map(r => r.signal);
    const uniqueSignals = [...new Set(signals)];
    
    if (uniqueSignals.length === 1) {
      // All indicators agree
      return 1.2;
    } else if (uniqueSignals.length === 2) {
      // Mostly agreement
      return 1.0;
    } else if (uniqueSignals.length === 3) {
      // Some disagreement
      return 0.8;
    } else {
      // High disagreement
      return 0.6;
    }
  }

  calculateCompositeScore(results) {
    const startTime = Date.now();
    
    let totalScore = 0;
    let totalWeight = 0;
    let breakdown = new Map();

    for (const [name, result] of results) {
      const weight = this.weights.get(name) || 0.1;
      const signalValue = this.normalizeSignal(result.signal);
      const weightedScore = signalValue * weight * result.confidence;
      
      totalScore += weightedScore;
      totalWeight += weight * result.confidence;
      
      breakdown.set(name, {
        score: signalValue,
        weight: weight,
        confidence: result.confidence
      });
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 50;
    const consensusFactor = this.calculateConsensusFactor(results);
    const confidence = Math.min(1, Array.from(results.values())
      .reduce((sum, r) => sum + r.confidence, 0) / results.size * consensusFactor);

    const signal = this.deriveSignal(finalScore);
    const calculationTime = Date.now() - startTime;

    return {
      score: this.normalizeScore(finalScore),
      signal: signal,
      confidence: confidence,
      breakdown: breakdown,
      calculationTime: calculationTime
    };
  }

  deriveSignal(score) {
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 65) return 'BUY';
    if (score >= 35) return 'HOLD';
    if (score >= 20) return 'SELL';
    return 'STRONG_SELL';
  }

  normalizeScore(score) {
    // Ensure score is between 0-100
    return Math.max(0, Math.min(100, score));
  }

  createBreakdown(results) {
    const breakdown = {};
    
    for (const [name, result] of results) {
      breakdown[name] = {
        score: this.normalizeSignal(result.signal),
        weight: this.weights.get(name) || 0.1,
        confidence: result.confidence,
        signal: result.signal
      };
    }

    return breakdown;
  }
}
```

This implementation guide provides a complete foundation for building the modular indicator library with industry-standard calculations, comprehensive error handling, and extensible architecture.
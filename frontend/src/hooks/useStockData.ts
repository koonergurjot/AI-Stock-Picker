import { useEffect } from 'react'
import { useStockContext } from '../context/StockContext'
import { apiService } from '../services/api'

export const useStockData = (symbol: string) => {
  const { state, dispatch } = useStockContext()

  useEffect(() => {
    if (!symbol) return

    const fetchStockData = async () => {
      dispatch({ type: 'SET_LOADING', payload: { symbol, loading: true } })
      dispatch({ type: 'SET_ERROR', payload: { symbol, error: '' } })

      try {
        const data = await apiService.analyzeStock(symbol)
        
        // Transform API response to our StockData format
        const stockData = {
          symbol: data.symbol,
          name: `${data.symbol} Inc.`,
          price: data.currentPrice,
          change: 0, // Would need additional API call for change
          changePercent: 0,
          currency: data.currency,
          rsi: data.rsi,
          macd: {
            macd: 1.2, // Would need additional calculation
            signal: 0.8,
            histogram: 0.4
          },
          bollinger: {
            upper: data.currentPrice * 1.05,
            middle: data.sma50,
            lower: data.currentPrice * 0.95
          },
          sma50: data.sma50,
          volume: 1000000, // Would need additional API call
          signal: data.signal as 'BUY' | 'SELL' | 'HOLD',
          historical: data.historical
        }

        dispatch({ type: 'SET_STOCK_DATA', payload: { symbol, data: stockData } })
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: { symbol, error: error instanceof Error ? error.message : 'Unknown error' } })
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { symbol, loading: false } })
      }
    }

    fetchStockData()
  }, [symbol, dispatch])

  return {
    stockData: state.stockData[symbol],
    loading: state.loading[symbol] || false,
    error: state.error[symbol] || ''
  }
}
import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'

// Types
export interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  currency: string
  rsi: number
  macd: {
    macd: number
    signal: number
    histogram: number
  }
  bollinger: {
    upper: number
    middle: number
    lower: number
  }
  sma50: number
  volume: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  historical: Array<{
    date: string
    close: number
  }>
}

export interface Alert {
  id: number
  symbol: string
  type: 'price' | 'RSI' | 'MACD' | 'volume'
  threshold: number
  direction: 'above' | 'below'
  status: 'active' | 'inactive'
  triggered: boolean
  createdAt: Date
}

export interface UserPreferences {
  theme: 'light' | 'dark'
  currency: 'USD' | 'CAD'
  refreshInterval: number
  chartTheme: 'light' | 'dark'
  notifications: boolean
}

interface State {
  watchlist: string[]
  stockData: Record<string, StockData>
  alerts: Alert[]
  preferences: UserPreferences
  loading: Record<string, boolean>
  error: Record<string, string>
}

type Action =
  | { type: 'ADD_TO_WATCHLIST'; payload: string }
  | { type: 'REMOVE_FROM_WATCHLIST'; payload: string }
  | { type: 'SET_STOCK_DATA'; payload: { symbol: string; data: StockData } }
  | { type: 'SET_LOADING'; payload: { symbol: string; loading: boolean } }
  | { type: 'SET_ERROR'; payload: { symbol: string; error: string } }
  | { type: 'ADD_ALERT'; payload: Omit<Alert, 'id' | 'triggered' | 'createdAt'> }
  | { type: 'REMOVE_ALERT'; payload: number }
  | { type: 'UPDATE_ALERT'; payload: Alert }
  | { type: 'TRIGGER_ALERT'; payload: number }
  | { type: 'SET_PREFERENCES'; payload: Partial<UserPreferences> }

// Initial state
const initialState: State = {
  watchlist: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL'],
  stockData: {},
  alerts: [
    {
      id: 1,
      symbol: 'AAPL',
      type: 'price',
      threshold: 160,
      direction: 'above',
      status: 'active',
      triggered: false,
      createdAt: new Date()
    }
  ],
  preferences: {
    theme: 'dark',
    currency: 'USD',
    refreshInterval: 30000,
    chartTheme: 'dark',
    notifications: true
  },
  loading: {},
  error: {}
}

// Reducer
function stockReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TO_WATCHLIST':
      if (state.watchlist.includes(action.payload)) return state
      return {
        ...state,
        watchlist: [...state.watchlist, action.payload.toUpperCase()]
      }

    case 'REMOVE_FROM_WATCHLIST':
      return {
        ...state,
        watchlist: state.watchlist.filter(symbol => symbol !== action.payload)
      }

    case 'SET_STOCK_DATA':
      return {
        ...state,
        stockData: {
          ...state.stockData,
          [action.payload.symbol]: action.payload.data
        }
      }

    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.symbol]: action.payload.loading
        }
      }

    case 'SET_ERROR':
      return {
        ...state,
        error: {
          ...state.error,
          [action.payload.symbol]: action.payload.error
        }
      }

    case 'ADD_ALERT':
      const newAlert: Alert = {
        ...action.payload,
        id: Date.now(),
        triggered: false,
        createdAt: new Date()
      }
      return {
        ...state,
        alerts: [...state.alerts, newAlert]
      }

    case 'REMOVE_ALERT':
      return {
        ...state,
        alerts: state.alerts.filter(alert => alert.id !== action.payload)
      }

    case 'UPDATE_ALERT':
      return {
        ...state,
        alerts: state.alerts.map(alert => 
          alert.id === action.payload.id ? action.payload : alert
        )
      }

    case 'TRIGGER_ALERT':
      return {
        ...state,
        alerts: state.alerts.map(alert => 
          alert.id === action.payload 
            ? { ...alert, triggered: true }
            : alert
        )
      }

    case 'SET_PREFERENCES':
      return {
        ...state,
        preferences: {
          ...state.preferences,
          ...action.payload
        }
      }

    default:
      return state
  }
}

// Context
const StockContext = createContext<{
  state: State
  dispatch: React.Dispatch<Action>
} | undefined>(undefined)

// Provider
interface StockProviderProps {
  children: ReactNode
}

export const StockProvider: React.FC<StockProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(stockReducer, initialState)

  // Load from localStorage on mount
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('watchlist')
    const savedPreferences = localStorage.getItem('preferences')
    const savedAlerts = localStorage.getItem('alerts')

    if (savedWatchlist) {
      try {
        const parsed = JSON.parse(savedWatchlist)
        if (Array.isArray(parsed)) {
          dispatch({ type: 'REMOVE_FROM_WATCHLIST', payload: '' }) // Clear default
          parsed.forEach((symbol: string) => {
            dispatch({ type: 'ADD_TO_WATCHLIST', payload: symbol })
          })
        }
      } catch (e) {
        console.error('Failed to parse watchlist:', e)
      }
    }

    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences)
        dispatch({ type: 'SET_PREFERENCES', payload: parsed })
      } catch (e) {
        console.error('Failed to parse preferences:', e)
      }
    }

    if (savedAlerts) {
      try {
        const parsed = JSON.parse(savedAlerts)
        if (Array.isArray(parsed)) {
          parsed.forEach((alert: Omit<Alert, 'id' | 'triggered' | 'createdAt'>) => {
            dispatch({ type: 'ADD_ALERT', payload: alert })
          })
        }
      } catch (e) {
        console.error('Failed to parse alerts:', e)
      }
    }
  }, [])

  // Save to localStorage on changes
  useEffect(() => {
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist))
  }, [state.watchlist])

  useEffect(() => {
    localStorage.setItem('preferences', JSON.stringify(state.preferences))
  }, [state.preferences])

  useEffect(() => {
    localStorage.setItem('alerts', JSON.stringify(state.alerts))
  }, [state.alerts])

  return (
    <StockContext.Provider value={{ state, dispatch }}>
      {children}
    </StockContext.Provider>
  )
}

// Hook
export const useStockContext = () => {
  const context = useContext(StockContext)
  if (context === undefined) {
    throw new Error('useStockContext must be used within a StockProvider')
  }
  return context
}
const API_BASE_URL = '/api'

export interface AnalysisResponse {
  symbol: string
  currentPrice: number
  currency: string
  sma50: number
  rsi: number
  signal: string
  historical: Array<{
    date: string
    close: number
  }>
}

export interface TopPicksResponse {
  top10: Array<{
    symbol: string
    compositeScore: number
    signal: string
    confidence: number
    price: number
    change: number
  }>
}

class ApiService {
  private async request<T>(endpoint: string): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error)
      throw error
    }
  }

  async analyzeStock(symbol: string): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>(`/analyze/${symbol}`)
  }

  async getTopPicks(): Promise<TopPicksResponse> {
    return this.request<TopPicksResponse>('/top-picks')
  }

  async getHistoricalData(symbol: string, days: number = 100): Promise<AnalysisResponse['historical']> {
    const response = await this.request<AnalysisResponse>(`/analyze/${symbol}?days=${days}`)
    return response.historical
  }

  async getMarketOverview(): Promise<{
    sp500: number
    nasdaq: number
    dowJones: number
    sp500Change: number
    nasdaqChange: number
    dowJonesChange: number
  }> {
    return this.request('/market-overview')
  }
}

export const apiService = new ApiService()
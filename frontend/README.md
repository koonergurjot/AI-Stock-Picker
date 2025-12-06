# AI Stock Picker Frontend

Enhanced React dashboard for the AI Stock Picker application with interactive charts, watchlist management, and real-time stock analysis.

## Features

### 🎯 Core Features
- **Multi-tab Dashboard**: Overview, Watchlist, Analysis, and Alerts sections
- **Interactive Charts**: Using Victory charts for price history and technical indicators
- **Watchlist Management**: Add/remove TSX stocks with custom alerts
- **Real-time Data**: Live stock prices and market data
- **Technical Analysis**: RSI, MACD, Bollinger Bands, and SMA indicators
- **Alert System**: Custom price and indicator-based notifications

### 🛠️ Technology Stack
- **Framework**: React 18 with Vite
- **TypeScript**: Full type safety and IntelliSense
- **UI Library**: Chakra UI for accessible, themeable components
- **Charts**: Victory for interactive financial visualizations
- **State Management**: React Context API with useReducer
- **Routing**: React Router v6

### 📊 Dashboard Sections

#### 1. Overview Dashboard
- Market overview with major indices
- Watchlist performance grid
- Quick stock analysis cards
- Real-time price updates

#### 2. Watchlist Management
- Add/remove stocks from watchlist
- Search and discover new stocks
- Custom watchlist organization
- Stock details table

#### 3. Stock Analysis
- Interactive price charts
- Technical indicators panel
- Analysis summary with signals
- Historical data visualization

#### 4. Alerts Center
- Create custom alerts (price, RSI, MACD)
- Alert management and testing
- Notification history
- Real-time alert triggering

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Environment variables**:
   Create a `.env` file in the frontend directory:
   ```
   VITE_API_BASE_URL=http://localhost:3000
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Navigation.tsx   # Top navigation bar
│   │   ├── OverviewDashboard.tsx  # Main dashboard
│   │   ├── WatchlistManager.tsx   # Watchlist management
│   │   ├── StockAnalysis.tsx      # Stock analysis page
│   │   ├── AlertsCenter.tsx       # Alert management
│   │   ├── StockCard.tsx          # Individual stock card
│   │   ├── StockChart.tsx         # Chart component
│   │   └── IndicatorsPanel.tsx    # Technical indicators
│   ├── context/             # React Context providers
│   │   └── StockContext.tsx # Global state management
│   ├── hooks/               # Custom React hooks
│   │   └── useStockData.ts  # Stock data fetching hook
│   ├── services/            # API services
│   │   └── api.ts           # API client
│   ├── App.tsx              # Main app component
│   └── main.tsx             # App entry point
├── public/                  # Static assets
├── package.json
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

## API Integration

The frontend integrates with the backend API endpoints:

- `GET /api/analyze/:symbol` - Get stock analysis
- `GET /api/top-picks` - Get top stock picks
- `GET /api/historical/:symbol` - Get historical data
- `GET /api/market-overview` - Get market overview

## Development

### Adding New Components
1. Create component in `src/components/`
2. Export from appropriate index file
3. Update TypeScript types if needed

### Adding New API Endpoints
1. Add method to `src/services/api.ts`
2. Update TypeScript interfaces
3. Create hook in `src/hooks/` if needed

### Styling
- Use Chakra UI components for consistency
- Leverage the theme system for colors and spacing
- Follow the existing design system

## Performance Optimizations

- **Memoization**: Use `useMemo` and `useCallback` for expensive calculations
- **Virtualization**: Consider `react-virtualized` for long lists
- **Lazy Loading**: Use `React.lazy` for heavy components
- **Caching**: Implement API response caching

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the existing issues
2. Create a new issue with detailed description
3. Include browser/OS information and steps to reproduce
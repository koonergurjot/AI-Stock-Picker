import { useState } from 'react'
import { Box, Tab, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react'
import { OverviewDashboard } from './components/OverviewDashboard'
import { WatchlistManager } from './components/WatchlistManager'
import { StockAnalysis } from './components/StockAnalysis'
import { AlertsCenter } from './components/AlertsCenter'
import { Navigation } from './components/Navigation'

function App() {
  const [tabIndex, setTabIndex] = useState(0)

  return (
    <Box minH="100vh" bg="gray.900">
      <Navigation />
      <Tabs 
        index={tabIndex} 
        onChange={(index) => setTabIndex(index)}
        isFitted
        variant="enclosed"
        colorScheme="brand"
      >
        <TabList>
          <Tab>Overview</Tab>
          <Tab>Watchlist</Tab>
          <Tab>Analysis</Tab>
          <Tab>Alerts</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>
            <OverviewDashboard />
          </TabPanel>
          <TabPanel p={0}>
            <WatchlistManager />
          </TabPanel>
          <TabPanel p={0}>
            <StockAnalysis />
          </TabPanel>
          <TabPanel p={0}>
            <AlertsCenter />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  )
}

export default App
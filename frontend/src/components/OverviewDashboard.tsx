import { Box, Grid, GridItem, Card, CardHeader, CardBody, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, StatArrow, Flex, Button, useColorModeValue } from '@chakra-ui/react'
import { StockCard } from './StockCard'
import { MarketOverview } from './MarketOverview'

export const OverviewDashboard = () => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg" color="brand.400">
          Market Overview
        </Heading>
        <Button colorScheme="brand" variant="outline">
          Refresh Data
        </Button>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6} mb={8}>
        <MarketOverview />
      </SimpleGrid>

      <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
        <CardHeader>
          <Heading size="md">Watchlist Performance</Heading>
        </CardHeader>
        <CardBody>
          <Grid templateColumns="repeat(3, 1fr)" gap={6}>
            <GridItem>
              <StockCard symbol="AAPL" />
            </GridItem>
            <GridItem>
              <StockCard symbol="MSFT" />
            </GridItem>
            <GridItem>
              <StockCard symbol="NVDA" />
            </GridItem>
            <GridItem>
              <StockCard symbol="TSLA" />
            </GridItem>
            <GridItem>
              <StockCard symbol="AMZN" />
            </GridItem>
            <GridItem>
              <StockCard symbol="GOOGL" />
            </GridItem>
          </Grid>
        </CardBody>
      </Card>
    </Box>
  )
}
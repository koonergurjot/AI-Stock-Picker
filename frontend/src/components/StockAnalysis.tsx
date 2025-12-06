import { Box, Card, CardHeader, CardBody, Heading, Flex, Text, Badge, useColorModeValue, SimpleGrid, VStack } from '@chakra-ui/react'
import { StockChart } from './StockChart'
import { IndicatorsPanel } from './IndicatorsPanel'

export const StockAnalysis = () => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const stockData = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 150.25,
    change: 2.50,
    changePercent: 1.7,
    signal: 'BUY',
    rsi: 45,
    macd: { macd: 1.2, signal: 0.8, histogram: 0.4 },
    bollinger: { upper: 160, middle: 150, lower: 140 },
    sma50: 145.50,
    volume: 45000000
  }

  const isPositive = stockData.change >= 0

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg" color="brand.400">
          {stockData.symbol} Analysis
        </Heading>
        <Flex gap={3} align="center">
          <Badge colorScheme="brand" variant="solid" fontSize="lg">
            {stockData.symbol}
          </Badge>
          <Badge colorScheme={stockData.signal === 'BUY' ? 'green' : stockData.signal === 'SELL' ? 'red' : 'yellow'} variant="subtle" fontSize="lg">
            {stockData.signal}
          </Badge>
          <Text fontSize="lg" fontWeight="bold">
            ${stockData.price.toFixed(2)}
          </Text>
          <Text color={isPositive ? 'green.500' : 'red.500'} fontSize="lg">
            {isPositive ? '+' : ''}{stockData.change.toFixed(2)} ({isPositive ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
          </Text>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
        <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
          <CardHeader>
            <Heading size="md">Price Chart</Heading>
          </CardHeader>
          <CardBody>
            <StockChart symbol={stockData.symbol} height={300} />
          </CardBody>
        </Card>

        <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
          <CardHeader>
            <Heading size="md">Technical Indicators</Heading>
          </CardHeader>
          <CardBody>
            <IndicatorsPanel data={stockData} />
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
        <CardHeader>
          <Heading size="md">Analysis Summary</Heading>
        </CardHeader>
        <CardBody>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
            <VStack align="stretch" spacing={4}>
              <Heading size="sm" color="brand.400">RSI (14)</Heading>
              <Text>Value: {stockData.rsi}</Text>
              <Text color={stockData.rsi < 30 ? 'green.500' : stockData.rsi > 70 ? 'red.500' : 'yellow.500'}>
                {stockData.rsi < 30 ? 'Oversold - Potential Buy' : stockData.rsi > 70 ? 'Overbought - Potential Sell' : 'Neutral'}
              </Text>
            </VStack>

            <VStack align="stretch" spacing={4}>
              <Heading size="sm" color="brand.400">MACD</Heading>
              <Text>MACD: {stockData.macd.macd}</Text>
              <Text>Signal: {stockData.macd.signal}</Text>
              <Text>Histogram: {stockData.macd.histogram}</Text>
              <Text color={stockData.macd.histogram > 0 ? 'green.500' : 'red.500'}>
                {stockData.macd.histogram > 0 ? 'Bullish Momentum' : 'Bearish Momentum'}
              </Text>
            </VStack>

            <VStack align="stretch" spacing={4}>
              <Heading size="sm" color="brand.400">Bollinger Bands</Heading>
              <Text>Upper: ${stockData.bollinger.upper}</Text>
              <Text>Middle: ${stockData.bollinger.middle}</Text>
              <Text>Lower: ${stockData.bollinger.lower}</Text>
              <Text color="blue.500">
                Price near middle band - Neutral trend
              </Text>
            </VStack>
          </SimpleGrid>
        </CardBody>
      </Card>
    </Box>
  )
}
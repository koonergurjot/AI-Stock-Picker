import { Card, CardHeader, CardBody, Heading, Text, Badge, Flex, Box, useColorModeValue } from '@chakra-ui/react'
import { StockChart } from './StockChart'

interface StockCardProps {
  symbol: string
}

export const StockCard = ({ symbol }: StockCardProps) => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  // Mock data for demonstration
  const stockData = {
    symbol,
    name: `${symbol} Inc.`,
    price: Math.random() * 500 + 100,
    change: (Math.random() - 0.5) * 10,
    changePercent: (Math.random() - 0.5) * 5,
    signal: Math.random() > 0.5 ? 'BUY' : Math.random() > 0.5 ? 'SELL' : 'HOLD',
    rsi: Math.floor(Math.random() * 100),
    sma50: Math.random() * 500 + 100,
  }

  const isPositive = stockData.change >= 0
  const signalColor = stockData.signal === 'BUY' ? 'green' : stockData.signal === 'SELL' ? 'red' : 'yellow'

  return (
    <Card 
      bg={cardBg} 
      borderColor={borderColor} 
      borderWidth={1}
      _hover={{ borderColor: 'brand.400', boxShadow: 'md' }}
      transition="all 0.3s"
      cursor="pointer"
    >
      <CardHeader pb={0}>
        <Flex justify="space-between" align="center">
          <Heading size="md" color="brand.400">
            {stockData.symbol}
          </Heading>
          <Badge colorScheme={signalColor} variant="subtle">
            {stockData.signal}
          </Badge>
        </Flex>
        <Text color="gray.500" fontSize="sm">
          {stockData.name}
        </Text>
      </CardHeader>
      
      <CardBody>
        <Flex justify="space-between" align="center" mb={4}>
          <Box>
            <Text fontSize="2xl" fontWeight="bold">
              ${stockData.price.toFixed(2)}
            </Text>
            <Text color={isPositive ? 'green.500' : 'red.500'} fontSize="sm">
              {isPositive ? '+' : ''}{stockData.change.toFixed(2)} ({isPositive ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
            </Text>
          </Box>
          <Box textAlign="right">
            <Text fontSize="sm" color="gray.500">RSI</Text>
            <Text fontSize="lg" fontWeight="bold">{stockData.rsi}</Text>
          </Box>
        </Flex>
        
        <StockChart symbol={symbol} height={120} />
        
        <Flex justify="space-between" mt={3} fontSize="sm" color="gray.500">
          <Text>SMA 50: ${stockData.sma50.toFixed(2)}</Text>
          <Text>Signal: {stockData.signal}</Text>
        </Flex>
      </CardBody>
    </Card>
  )
}
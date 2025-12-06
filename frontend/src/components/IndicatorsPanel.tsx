import { Box, VStack, HStack, Text, Progress, Badge, useColorModeValue } from '@chakra-ui/react'

interface IndicatorsPanelProps {
  data: {
    rsi: number
    macd: { macd: number; signal: number; histogram: number }
    bollinger: { upper: number; middle: number; lower: number }
    sma50: number
    price: number
  }
}

export const IndicatorsPanel = ({ data }: IndicatorsPanelProps) => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const rsiColor = data.rsi < 30 ? 'green' : data.rsi > 70 ? 'red' : 'yellow'
  const macdColor = data.macd.histogram > 0 ? 'green' : 'red'

  return (
    <Box bg={cardBg} borderRadius="md" p={4} borderColor={borderColor} borderWidth={1}>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between">
          <Text fontWeight="bold">RSI (14)</Text>
          <Badge colorScheme={rsiColor} variant="subtle">
            {data.rsi < 30 ? 'Oversold' : data.rsi > 70 ? 'Overbought' : 'Neutral'}
          </Badge>
        </HStack>
        <Progress value={data.rsi} size="sm" colorScheme={rsiColor} />
        <Text fontSize="sm" color="gray.500">Value: {data.rsi}</Text>

        <HStack justify="space-between" mt={4}>
          <Text fontWeight="bold">MACD</Text>
          <Badge colorScheme={macdColor} variant="subtle">
            {data.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
          </Badge>
        </HStack>
        <HStack spacing={4}>
          <Box flex="1">
            <Text fontSize="sm" color="gray.500">MACD</Text>
            <Text>{data.macd.macd.toFixed(2)}</Text>
          </Box>
          <Box flex="1">
            <Text fontSize="sm" color="gray.500">Signal</Text>
            <Text>{data.macd.signal.toFixed(2)}</Text>
          </Box>
          <Box flex="1">
            <Text fontSize="sm" color="gray.500">Histogram</Text>
            <Text color={macdColor}>{data.macd.histogram.toFixed(2)}</Text>
          </Box>
        </HStack>

        <HStack justify="space-between" mt={4}>
          <Text fontWeight="bold">Bollinger Bands</Text>
          <Badge colorScheme="blue" variant="subtle">
            Price: ${data.price.toFixed(2)}
          </Badge>
        </HStack>
        <VStack spacing={2} align="stretch">
          <HStack justify="space-between">
            <Text fontSize="sm" color="gray.500">Upper</Text>
            <Text>${data.bollinger.upper.toFixed(2)}</Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="sm" color="gray.500">Middle (SMA 20)</Text>
            <Text>${data.bollinger.middle.toFixed(2)}</Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="sm" color="gray.500">Lower</Text>
            <Text>${data.bollinger.lower.toFixed(2)}</Text>
          </HStack>
        </VStack>

        <HStack justify="space-between" mt={4}>
          <Text fontWeight="bold">SMA 50</Text>
          <Text>${data.sma50.toFixed(2)}</Text>
        </HStack>
      </VStack>
    </Box>
  )
}
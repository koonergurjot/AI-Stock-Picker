import { Box, Card, CardHeader, CardBody, Heading, Input, Button, Flex, Badge, useColorModeValue, Table, Thead, Tbody, Tr, Th, Td, TableContainer, SimpleGrid } from '@chakra-ui/react'
import { useState } from 'react'
import { StockCard } from './StockCard'

export const WatchlistManager = () => {
  const [symbol, setSymbol] = useState('')
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const watchlist = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL']

  const handleAddSymbol = () => {
    if (symbol.trim() && !watchlist.includes(symbol.trim().toUpperCase())) {
      // Add symbol to watchlist
      console.log('Adding symbol:', symbol.trim().toUpperCase())
    }
  }

  const handleRemoveSymbol = (symbolToRemove: string) => {
    // Remove symbol from watchlist
    console.log('Removing symbol:', symbolToRemove)
  }

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg" color="brand.400">
          Watchlist Management
        </Heading>
        <Flex gap={3}>
          <Input
            placeholder="Enter stock symbol (e.g., AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
            maxW="300px"
          />
          <Button colorScheme="brand" onClick={handleAddSymbol}>
            Add to Watchlist
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6} mb={8}>
        {watchlist.map((symbol) => (
          <StockCard key={symbol} symbol={symbol} />
        ))}
      </SimpleGrid>

      <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
        <CardHeader>
          <Heading size="md">Watchlist Details</Heading>
        </CardHeader>
        <CardBody>
          <TableContainer>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Symbol</Th>
                  <Th>Name</Th>
                  <Th isNumeric>Price</Th>
                  <Th isNumeric>Change</Th>
                  <Th>Signal</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {watchlist.map((symbol) => (
                  <Tr key={symbol}>
                    <Td>
                      <Badge colorScheme="brand" variant="solid">
                        {symbol}
                      </Badge>
                    </Td>
                    <Td>{symbol} Inc.</Td>
                    <Td isNumeric>$150.25</Td>
                    <Td isNumeric color="green.500">+2.50 (+1.7%)</Td>
                    <Td>
                      <Badge colorScheme="green" variant="subtle">BUY</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" colorScheme="red" variant="ghost" onClick={() => handleRemoveSymbol(symbol)}>
                        Remove
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </CardBody>
      </Card>
    </Box>
  )
}

// Import SimpleGrid - need to add this import
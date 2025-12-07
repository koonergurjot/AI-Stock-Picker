import { Box, Card, CardHeader, CardBody, Heading, Flex, Input, Button, Text, Badge, useColorModeValue, Table, Thead, Tbody, Tr, Th, Td, TableContainer, VStack, HStack, SimpleGrid } from '@chakra-ui/react'
import { useState } from 'react'

export const AlertsCenter = () => {
  const [symbol, setSymbol] = useState('')
  const [threshold, setThreshold] = useState('')
  const [alertType] = useState('price')
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const alerts = [
    { id: 1, symbol: 'AAPL', type: 'price', threshold: 160, direction: 'above', status: 'active', triggered: false },
    { id: 2, symbol: 'MSFT', type: 'RSI', threshold: 70, direction: 'above', status: 'active', triggered: false },
    { id: 3, symbol: 'NVDA', type: 'price', threshold: 400, direction: 'below', status: 'active', triggered: false },
  ]

  const handleCreateAlert = () => {
    if (symbol.trim() && threshold.trim()) {
      console.log('Creating alert:', { symbol: symbol.trim().toUpperCase(), type: alertType, threshold: parseFloat(threshold) })
    }
  }

  const handleDeleteAlert = (id: number) => {
    console.log('Deleting alert:', id)
  }

  const handleTestAlert = (id: number) => {
    console.log('Testing alert:', id)
  }

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg" color="brand.400">
          Alerts & Notifications
        </Heading>
        <Flex gap={3} align="center">
          <Input
            placeholder="Enter stock symbol (e.g., AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxW="200px"
          />
          <Input
            placeholder="Threshold value"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            maxW="150px"
          />
          <Button colorScheme="brand" onClick={handleCreateAlert}>
            Create Alert
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={8}>
        <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
          <CardHeader>
            <Heading size="md">Alert Summary</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between">
                <Text>Total Alerts</Text>
                <Badge colorScheme="brand" variant="solid">{alerts.length}</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Active</Text>
                <Badge colorScheme="green" variant="solid">
                  {alerts.filter(a => a.status === 'active').length}
                </Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Triggered</Text>
                <Badge colorScheme="red" variant="solid">
                  {alerts.filter(a => a.triggered).length}
                </Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
          <CardHeader>
            <Heading size="md">Alert Types</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between">
                <Text>Price Alerts</Text>
                <Badge colorScheme="blue" variant="subtle">3</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>RSI Alerts</Text>
                <Badge colorScheme="purple" variant="subtle">1</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Volume Alerts</Text>
                <Badge colorScheme="orange" variant="subtle">0</Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
          <CardHeader>
            <Heading size="md">Recent Activity</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={2} align="stretch">
              <Text fontSize="sm" color="gray.500">No recent alerts triggered</Text>
              <Text fontSize="xs" color="gray.400">Last check: 2 minutes ago</Text>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card bg={cardBg} borderColor={borderColor} borderWidth={1}>
        <CardHeader>
          <Heading size="md">Active Alerts</Heading>
        </CardHeader>
        <CardBody>
          <TableContainer>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Symbol</Th>
                  <Th>Type</Th>
                  <Th>Threshold</Th>
                  <Th>Direction</Th>
                  <Th>Status</Th>
                  <Th>Triggered</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {alerts.map((alert) => (
                  <Tr key={alert.id}>
                    <Td>
                      <Badge colorScheme="brand" variant="solid">{alert.symbol}</Badge>
                    </Td>
                    <Td>
                      <Badge colorScheme={alert.type === 'price' ? 'blue' : 'purple'} variant="subtle">
                        {alert.type.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>{alert.threshold}</Td>
                    <Td>
                      <Badge colorScheme={alert.direction === 'above' ? 'green' : 'red'} variant="subtle">
                        {alert.direction.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge colorScheme={alert.status === 'active' ? 'green' : 'gray'} variant="subtle">
                        {alert.status.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge colorScheme={alert.triggered ? 'red' : 'gray'} variant="subtle">
                        {alert.triggered ? 'YES' : 'NO'}
                      </Badge>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Button size="sm" colorScheme="brand" onClick={() => handleTestAlert(alert.id)}>
                          Test
                        </Button>
                        <Button size="sm" colorScheme="red" variant="ghost" onClick={() => handleDeleteAlert(alert.id)}>
                          Delete
                        </Button>
                      </HStack>
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

// Import SimpleGrid - already imported
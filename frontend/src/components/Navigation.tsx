import { Box, Flex, Heading, Text, Button, useColorMode } from '@chakra-ui/react'

export const Navigation = () => {
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <Box 
      bg="gray.800" 
      borderBottom="1px" 
      borderColor="gray.700"
      position="sticky" 
      top="0" 
      zIndex={1000}
    >
      <Flex 
        maxW="container.xl" 
        mx="auto" 
        px={{ base: 4, md: 6 }} 
        py={4} 
        align="center" 
        justify="space-between"
      >
        <Flex align="center" gap={4}>
          <Heading size="lg" color="brand.400">
            AI Stock Picker
          </Heading>
          <Text color="gray.400" fontSize="sm">
            Enhanced Dashboard
          </Text>
        </Flex>
        
        <Flex align="center" gap={3}>
          <Button 
            onClick={toggleColorMode}
            variant="ghost"
            colorScheme="brand"
          >
            {colorMode === 'light' ? 'Dark' : 'Light'} Mode
          </Button>
          <Button 
            colorScheme="brand"
            variant="solid"
          >
            Connect Wallet
          </Button>
        </Flex>
      </Flex>
    </Box>
  )
}
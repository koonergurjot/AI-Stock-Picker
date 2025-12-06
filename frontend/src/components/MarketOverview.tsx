import { Stat, StatLabel, StatNumber, StatHelpText, StatArrow, Box, Flex, Text } from '@chakra-ui/react'

interface MarketOverviewProps {
  symbol?: string
}

export const MarketOverview = ({ symbol }: MarketOverviewProps) => {
  return (
    <Box>
      <Stat>
        <StatLabel>S&P 500</StatLabel>
        <StatNumber>4,567.89</StatNumber>
        <StatHelpText>
          <StatArrow type="increase" />
          1.2%
        </StatHelpText>
      </Stat>
      
      <Stat mt={4}>
        <StatLabel>NASDAQ</StatLabel>
        <StatNumber>14,234.56</StatNumber>
        <StatHelpText>
          <StatArrow type="decrease" />
          0.8%
        </StatHelpText>
      </Stat>
      
      <Stat mt={4}>
        <StatLabel>Dow Jones</StatLabel>
        <StatNumber>35,890.12</StatNumber>
        <StatHelpText>
          <StatArrow type="increase" />
          0.5%
        </StatHelpText>
      </Stat>
    </Box>
  )
}
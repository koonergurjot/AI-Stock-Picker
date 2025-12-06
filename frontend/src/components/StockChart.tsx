import React from 'react'
import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme, VictoryTooltip, VictoryScatter } from 'victory'

interface StockChartProps {
  symbol: string
  height?: number
  width?: number
  data?: Array<{ x: Date | string; y: number }>
}

export const StockChart = ({ symbol, height = 200, width = 400, data }: StockChartProps) => {
  // Generate mock data if none provided
  const chartData = data || Array.from({ length: 30 }, (_, i) => ({
    x: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
    y: 100 + Math.random() * 50 + i * 2
  }))

  return (
    <VictoryChart
      theme={VictoryTheme.material}
      height={height}
      width={width}
      domainPadding={{ x: 10, y: 10 }}
      padding={{ top: 10, bottom: 30, left: 40, right: 10 }}
    >
      <VictoryAxis
        style={{
          axis: { stroke: "#333" },
          tickLabels: { fill: "#888", fontSize: 8 }
        }}
        tickFormat={(x) => new Date(x).toLocaleDateString()}
      />
      <VictoryAxis
        dependentAxis
        style={{
          axis: { stroke: "#333" },
          tickLabels: { fill: "#888", fontSize: 8 }
        }}
      />
      <VictoryLine
        data={chartData}
        style={{
          data: { stroke: "#4CAF50", strokeWidth: 2 },
          parent: { border: "1px solid #ccc" }
        }}
        interpolation="monotoneX"
      />
      <VictoryScatter
        data={chartData}
        size={2}
        style={{
          data: { fill: "#4CAF50" }
        }}
      />
    </VictoryChart>
  )
}
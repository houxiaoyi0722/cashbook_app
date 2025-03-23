declare module '@wuba/react-native-echarts' {
  import React from 'react';
  
  export const SVGRenderer: any;
  
  interface SvgChartProps {
    option: any;
    width: number;
    height: number;
    echarts: any;
    backgroundColor?: string;
    onPress?: (params: any) => void;
  }
  
  export class SvgChart extends React.Component<SvgChartProps> {}
}

declare module 'echarts/core' {
  const echarts: any;
  export function use(components: any[]): void;
  export default echarts;
}

declare module 'echarts/charts' {
  export const PieChart: any;
  export const BarChart: any;
}

declare module 'echarts/components' {
  export const TitleComponent: any;
  export const TooltipComponent: any;
  export const LegendComponent: any;
  export const GridComponent: any;
} 
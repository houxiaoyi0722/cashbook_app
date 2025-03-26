import React, { useState, useEffect, useCallback } from 'react';
import {View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, RefreshControl} from 'react-native';
import WebView from 'react-native-webview';
import { Text, Card, Divider, Tab, TabView, Overlay, Icon } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import moment from 'moment';
import { MainStackParamList } from '../../navigation/types';
import api from '../../services/api';
import BookSelector from '../../components/BookSelector';
import {MonthAnalysis, AnalyticsItem, Flow} from '../../types';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';

import * as echarts from 'echarts/core';
import { PieChart as EchartsPie, BarChart as EchartsBar } from 'echarts/charts';
import { SVGRenderer } from '@wuba/react-native-echarts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components';

// 注册必要的组件
echarts.use([
  SVGRenderer,
  EchartsPie,
  EchartsBar,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
]);

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const getChartColor = (index: number) => {
  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#8AC249', '#EA5545', '#F46A9B', '#EF9B20',
    '#EDBF33', '#87BC45', '#27AEEF', '#B33DC6',
  ];

  return colors[index % colors.length];
};

const StatisticsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { currentBook } = useBookkeeping();

  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [monthData, setMonthData] = useState<AnalyticsItem[]>([]);
  const [monthAnalysis, setMonthAnalysis] = useState<MonthAnalysis | null>(null);
  const [industryTypeData, setIndustryTypeData] = useState<any[]>([]);
  const [payTypeData, setPayTypeData] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(moment().format('YYYY-MM'));
  const [previousMonths, setPreviousMonths] = useState<{[year: string]: string[]}>({});
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);


  // 添加选中项状态到组件顶层
  const [selectedIndustryItem, setSelectedIndustryItem] = useState<string | null>(null);
  const [selectedPayTypeItem, setSelectedPayTypeItem] = useState<string | null>(null);

  // 获取月度数据
  const fetchMonthData = useCallback(async () => {
    if (!currentBook) return;

    try {
      setIsLoading(true);
      const response = await api.analytics.month(currentBook.bookId);
      if (response.c === 200 && response.d) {
        setMonthData(response.d);

        // 按年份分组
        const monthsByYear: {[year: string]: string[]} = {};

        const months = response.d
            .map((item: AnalyticsItem) => item.type)
            .sort((a: string, b: string) => b.localeCompare(a));

        months.forEach((month: string) => {
              const year = month.substring(0, 4);
              if (!monthsByYear[year]) {
                monthsByYear[year] = [];
              }
              monthsByYear[year].push(month);
            });

        setPreviousMonths(monthsByYear);

        // 初始化设置当前月份
        if (months.length > 0 && (!currentMonth || !months.includes(currentMonth))) {
          setCurrentMonth(months[0]);
        }
      }
    } catch (error) {
      console.error('获取月度数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取月度数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook,currentMonth]);

  // 获取月度分析
  const fetchMonthAnalysis = useCallback(async () => {
    if (!currentBook || !currentMonth) return;

    try {
      setIsLoading(true);
      const response = await api.analytics.monthAnalysis(currentMonth, currentBook.bookId);

      if (response.c === 200 && response.d) {
        setMonthAnalysis(response.d);
      }
    } catch (error) {
      console.error('获取当月分析失败', error);
      Alert.alert('错误', '获取当月分析失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth]);

  // 获取行业类型数据
  const fetchIndustryTypeData = useCallback(async () => {
    if (!currentBook || !currentMonth) return;

    try {
      setIsLoading(true);
      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
      const response = await api.analytics.industryType({
        bookId: currentBook.bookId,
        flowType: '支出',
        startDay: startDate,
        endDay: endDate
      });

      if (response.c === 200 && response.d) {
        // 转换为图表数据格式，并格式化数值
        const chartData = response.d
          .map((item: any, index: number) => ({
            name: item.type,
            value: parseFloat(item.outSum.toFixed(2)), // 确保数值格式化
            color: getChartColor(index),
            legendFontColor: '#7F7F7F',
            legendFontSize: 12,
          }))
          .sort((a, b) => b.value - a.value); // 按数值从大到小排序

        setIndustryTypeData(chartData);
      }
    } catch (error) {
      console.error('获取行业类型数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取行业类型数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth]);

  // 获取支付方式数据
  const fetchPayTypeData = useCallback(async () => {
    if (!currentBook || !currentMonth) return;

    try {
      setIsLoading(true);
      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');

      const response = await api.analytics.payType({
        bookId: currentBook.bookId,
        flowType: '',
        startDay: startDate,
        endDay: endDate,
      });

      if (response.c === 200 && response.d) {
        // 转换为图表数据格式，并格式化数值
        const chartData = response.d
          .map((item: any, index: number) => ({
            name: item.type,
            value: parseFloat(item.outSum.toFixed(2)), // 确保数值格式化
            color: getChartColor(index + 5),
            legendFontColor: '#7F7F7F',
            legendFontSize: 12,
          }))
          .sort((a, b) => b.value - a.value); // 按数值从大到小排序

        setPayTypeData(chartData);
      }
    } catch (error) {
      console.error('获取支付方式数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取支付方式数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth]);

  // 当前账本变化时，重新获取数据
  useEffect(() => {
    let isMounted = true;
    if (currentBook) {
      fetchMonthData().catch(err => {
        if (isMounted) {
          console.error('获取月度数据失败', err instanceof Error ? err.message : String(err));
        }
      });
    }
    return () => { isMounted = false; };
  }, [currentBook, fetchMonthData]);

  // 当前月份变化时，重新获取分析数据
  useEffect(() => {
    let isMounted = true;
    if (currentBook && currentMonth) {
      const fetchData = async () => {
        try {
          await fetchMonthAnalysis();
          if (isMounted) await fetchIndustryTypeData();
          if (isMounted) await fetchPayTypeData();
        } catch (err) {
          if (isMounted) {
            console.error('获取分析数据失败', err instanceof Error ? err.message : String(err));
          }
        }
      };

      fetchData();
    }
    return () => { isMounted = false; };
  }, [currentBook, currentMonth, fetchMonthAnalysis, fetchIndustryTypeData, fetchPayTypeData]);

  // 处理月份选择
  const handleMonthSelect = (month: string) => {
    setCurrentMonth(month);
    setShowMonthPicker(false);
  };

  // 处理查看流水详情
  const handleViewFlowDetail = (flowId: Flow) => {
    navigation.navigate('FlowForm', { currentFlow: flowId })
  };

  // 下拉刷新处理函数
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchMonthData();
      await fetchMonthAnalysis();
      await fetchIndustryTypeData();
      await fetchPayTypeData();
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 渲染月份选择器
  const renderMonthSelector = () => {
    return (
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.monthSelector}
          onPress={() => setShowMonthPicker(true)}
        >
          <Icon name="calendar-today" type="material" size={20} color="#1976d2" />
          <Text style={styles.monthSelectorText}>{currentMonth}</Text>
        </TouchableOpacity>
        <Overlay
            isVisible={showMonthPicker}
            onBackdropPress={() => setShowMonthPicker(false)}
            overlayStyle={styles.monthPickerOverlay}
        >
          <View style={styles.monthPickerHeader}>
            <Text style={styles.monthPickerTitle}>选择月份</Text>
            <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
              <Icon name="close" type="material" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.yearGroupsContainer}>
            {Object.keys(previousMonths).sort((a, b) => b.localeCompare(a)).map((year) => (
              <View key={year} style={styles.yearGroup}>
                <Text style={styles.yearTitle}>{year}年</Text>
                <View style={styles.monthList}>
                  {previousMonths[year].map((month) => (
                    <TouchableOpacity
                      key={month}
                      style={[
                        styles.monthItem,
                        month === currentMonth && styles.selectedMonthItem,
                      ]}
                      onPress={() => handleMonthSelect(month)}
                    >
                      <Text
                        style={[
                          styles.monthItemText,
                          month === currentMonth && styles.selectedMonthItemText,
                        ]}
                      >
                        {month.substring(5)}月
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </Overlay>
      </View>
    );
  };

  // 修改 renderEchartsWithWebView 函数，实现点击图例显示/隐藏功能
  const renderEchartsWithWebView = (option: any, height: number, onItemClick?: (item: any) => void) => {
    // 检查是否为饼图类型
    const isPieChart = option.series && option.series[0] && option.series[0].type === 'pie';

    // 如果是饼图，应用我们之前的逻辑
    if (isPieChart) {
      // 获取数据
      const data = option.series[0].data;

      // 计算每行显示的图例数量，根据数据总量动态调整
      const totalItems = data.length;
      const itemsPerRow = Math.min(Math.ceil(totalItems / 2), 4); // 最多每行4个

      // 计算需要的行数
      const rowCount = Math.ceil(totalItems / itemsPerRow);

      // 创建多行图例 - 数据已经在传入前排序好了，所以这里保持顺序
      const legends = [];
      for (let i = 0; i < rowCount; i++) {
        const startIdx = i * itemsPerRow;
        const endIdx = Math.min(startIdx + itemsPerRow, totalItems);
        const rowData = data.slice(startIdx, endIdx).map((item: { name: any; }) => item.name);

        legends.push({
          data: rowData,
          bottom: 10 + (rowCount - 1 - i) * 25, // 从底部向上排列，每行25px高度
          left: 'center',
          itemWidth: 20,
          itemHeight: 10,
          selectedMode: true, // 启用选择模式，允许显示/隐藏
          textStyle: { fontSize: 10 },
          formatter: (name: string) => name.length > 6 ? name.slice(0, 6) + '...' : name
        });
      }

      // 调整饼图位置，为图例留出足够空间
      const pieCenter = ['50%', Math.max(30, 50 - rowCount * 5) + '%'];

      // 创建新的选项，修改强调样式，删除线条图例名称
      const newOption = {
        ...option,
        legend: legends,
        series: [
          {
            ...option.series[0],
            center: pieCenter,
            radius: ['35%', '65%'], // 稍微缩小饼图
            // 修改强调样式，删除线条图例名称
            emphasis: {
              label: {
                show: false // 不显示标签
              },
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            },
            // 确保普通状态下也不显示标签
            label: {
              show: false
            }
          }
        ]
      };

      // 计算适当的容器高度，确保有足够空间显示图例
      const containerHeight = height + (rowCount > 2 ? (rowCount - 2) * 25 : 0);

      // 创建HTML内容
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
            <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
              #chart { width: 100%; height: 100%; }
            </style>
          </head>
          <body>
            <div id="chart"></div>
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                var chart = echarts.init(document.getElementById('chart'));
                var option = ${JSON.stringify(newOption)};
                chart.setOption(option);
                
                // 存储所有数据项的名称
                var allDataNames = ${JSON.stringify(data.map((item: { name: any; }) => item.name))};
                
                // 点击图表项
                chart.on('click', function(params) {
                  if (params.componentType === 'series') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'itemClick',
                      data: params.data
                    }));
                  }
                });
                
                // 点击图例项 - 允许显示/隐藏
                chart.on('legendselectchanged', function(params) {
                  // 发送消息到 React Native
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'legendClick',
                    name: params.name,
                    selected: params.selected
                  }));
                });
                
                // 窗口大小变化时调整图表大小
                window.addEventListener('resize', function() {
                  chart.resize();
                });
              });
            </script>
          </body>
        </html>
      `;

      return (
        <View style={{ height: containerHeight, width: '100%', backgroundColor: '#fff' }}>
          <WebView
            source={{ html: htmlContent }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            onMessage={(event) => {
              if (onItemClick) {
                try {
                  const message = JSON.parse(event.nativeEvent.data);
                  if (message.type === 'itemClick' || message.type === 'legendClick') {
                    onItemClick(message);
                  }
                } catch (e) {
                  console.error('Failed to parse WebView message:', e);
                }
              }
            }}
          />
        </View>
      );
    } else {
      // 对于非饼图类型，使用原始选项直接渲染
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
            <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
              #chart { width: 100%; height: 100%; }
            </style>
          </head>
          <body>
            <div id="chart"></div>
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                var chart = echarts.init(document.getElementById('chart'));
                var option = ${JSON.stringify(option)};
                chart.setOption(option);
                
                // 窗口大小变化时调整图表大小
                window.addEventListener('resize', function() {
                  chart.resize();
                });
              });
            </script>
          </body>
        </html>
      `;

      return (
        <View style={{ height, width: '100%', backgroundColor: '#fff' }}>
          <WebView
            source={{ html: htmlContent }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
          />
        </View>
      );
    }
  };

  // 修改处理图表项目点击的函数
  const handleIndustryItemClick = (message: any) => {
    console.log('Industry item click:', message);
    if (message.type === 'itemClick') {
      setSelectedIndustryItem(message.data.name);
    } else if (message.type === 'legendClick') {
      // 点击图例时，只更新选中项，不执行其他操作
      // 图例的显示/隐藏由 Echarts 内部处理
      setSelectedIndustryItem(message.name);
    }
  };

  // 修改处理支付方式图表项目点击的函数
  const handlePayTypeItemClick = (message: any) => {
    console.log('Pay type item click:', message);
    if (message.type === 'itemClick') {
      setSelectedPayTypeItem(message.data.name);
    } else if (message.type === 'legendClick') {
      // 点击图例时，只更新选中项，不执行其他操作
      // 图例的显示/隐藏由 Echarts 内部处理
      setSelectedPayTypeItem(message.name);
    }
  };

  // 渲染月度概览
  const renderMonthOverview = () => {
    if (!monthAnalysis) {
      return (
          <Card containerStyle={styles.card}>
            <Card.Title>月度概览</Card.Title>
            <Text style={styles.emptyText}>暂无数据</Text>
          </Card>
      );
    }
    return (
      <Card containerStyle={styles.card}>
        <Card.Title>月度概览</Card.Title>

        <View style={styles.overviewRow}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>收入</Text>
            <Text style={[styles.overviewValue, { color: '#4caf50' }]}>
              {monthAnalysis.inSum}
            </Text>
          </View>

          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>支出</Text>
            <Text style={[styles.overviewValue, { color: '#f44336' }]}>
              {monthAnalysis.outSum}
            </Text>
          </View>

          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>不计收支</Text>
            <Text style={styles.overviewValue}>
              {monthAnalysis.zeroSum}
            </Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.maxItemContainer}>
          <Text style={styles.maxItemTitle}>最大收入</Text>
          <TouchableOpacity
            style={styles.maxItem}
            onPress={() => monthAnalysis.maxIn && handleViewFlowDetail(monthAnalysis.maxIn)}
          >
            <Text style={styles.maxItemName} numberOfLines={1}>
              {monthAnalysis.maxIn?.name || '无'}
            </Text>
            <Text style={[styles.maxItemValue, { color: '#4caf50' }]}>
              {monthAnalysis.maxIn ? `+${monthAnalysis.maxIn.money.toFixed(2)}` : '0.00'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.maxItemContainer}>
          <Text style={styles.maxItemTitle}>最大支出</Text>
          <TouchableOpacity
            style={styles.maxItem}
            onPress={() => monthAnalysis.maxOut && handleViewFlowDetail(monthAnalysis.maxOut)}
          >
            <Text style={styles.maxItemName} numberOfLines={1}>
              {monthAnalysis.maxOut?.name || '无'}
            </Text>
            <Text style={[styles.maxItemValue, { color: '#f44336' }]}>
              {monthAnalysis.maxOut ? `-${monthAnalysis.maxOut.money.toFixed(2)}` : '0.00'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.maxItemContainer}>
          <Text style={styles.maxItemTitle}>最大不计收支</Text>
          <TouchableOpacity
            style={styles.maxItem}
            onPress={() => monthAnalysis.maxZero && handleViewFlowDetail(monthAnalysis.maxZero)}
          >
            <Text style={styles.maxItemName} numberOfLines={1}>
              {monthAnalysis.maxZero?.name || '无'}
            </Text>
            <Text style={styles.maxItemValue}>
              {monthAnalysis.maxZero ? monthAnalysis.maxZero.money.toFixed(2) : '0.00'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  // 修改行业类型分析渲染函数
  const renderIndustryTypeAnalysis = () => {
    if (industryTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>支出类型分析</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 按数值从大到小排序数据
    const sortedData = [...industryTypeData].sort((a, b) => b.value - a.value);

    // 准备图表数据
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          name: '支出类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false // 确保不显示标签
          },
          emphasis: {
            label: {
              show: false // 确保强调状态下也不显示标签
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          data: sortedData.map(item => ({
            value: parseFloat(item.value).toFixed(2),
            name: item.name,
            itemStyle: {
              color: item.color
            }
          }))
        }
      ]
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>支出类型分析</Card.Title>

        <View style={styles.chartContainer}>
          {renderEchartsWithWebView(option, 300, handleIndustryItemClick)}
        </View>

        {selectedIndustryItem && (
          <View style={styles.selectedItemInfo}>
            <Text style={styles.selectedItemTitle}>已选择: {selectedIndustryItem}</Text>
            <Text style={styles.selectedItemValue}>
              金额: {industryTypeData.find(item => item.name === selectedIndustryItem)?.value.toFixed(2) || '0.00'}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // 修改支付方式分析渲染函数
  const renderPayTypeAnalysis = () => {
    if (payTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>支付方式分析</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 按数值从大到小排序数据
    const sortedData = [...payTypeData].sort((a, b) => b.value - a.value);

    // 准备图表数据
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          name: '支付方式',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false // 确保不显示标签
          },
          emphasis: {
            label: {
              show: false // 确保强调状态下也不显示标签
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          data: sortedData.map(item => ({
            value: parseFloat(item.value.toFixed(2)),
            name: item.name,
            itemStyle: {
              color: item.color
            }
          }))
        }
      ]
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>支付方式分析</Card.Title>

        <View style={styles.chartContainer}>
          {renderEchartsWithWebView(option, 300, handlePayTypeItemClick)}
        </View>

        {selectedPayTypeItem && (
          <View style={styles.selectedItemInfo}>
            <Text style={styles.selectedItemTitle}>已选择: {selectedPayTypeItem}</Text>
            <Text style={styles.selectedItemValue}>
              金额: {payTypeData.find(item => item.name === selectedPayTypeItem)?.value.toFixed(2) || '0.00'}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // 修改月度趋势图表渲染函数
  const renderMonthTrend = () => {
    const year = currentMonth.substring(0,4);

    if (monthData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>{year + '月度趋势'}</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }
    // 准备图表数据
    const labels = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.type.substring(5)); // 只显示月份

    const inData = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.inSum.toFixed(2));

    const outData = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.outSum.toFixed(2));

    // 准备 Echarts 选项
    const option = {
      tooltip: {
        trigger: 'axis',
        position: 'top',
        textStyle: {
          color: '#000',
          fontSize: 12,
        },
      },
      legend: {
        data: ['收入', '支出'],
        bottom: 0,
        left: 'center',
        selectedMode: true, // 允许选择，因为这是柱状图
        textStyle: {
          color: '#333',
          fontSize: 12,
        },
        icon: 'rect',
        itemWidth: 25,
        itemHeight: 14,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: '#333',
          fontSize: 12,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#333',
          fontSize: 12,
        },
      },
      series: [
        {
          name: '收入',
          type: 'bar',
          data: inData,
          itemStyle: {
            color: '#4caf50',
          },
        },
        {
          name: '支出',
          type: 'bar',
          data: outData,
          itemStyle: {
            color: '#f44336',
          },
        },
      ],
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>{year + '月度趋势'}</Card.Title>

        <View style={styles.chartContainer}>
          {renderEchartsWithWebView(option, 300)}
        </View>
      </Card>
    );
  };

  if (!currentBook) {
    return (
      <View style={styles.container}>
        <BookSelector />
        <Card containerStyle={styles.emptyCard}>
          <Card.Title>未选择账本</Card.Title>
          <Text style={styles.emptyText}>
            请先选择或创建一个账本
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BookSelector />
        {renderMonthSelector()}
        <Tab
            value={tabIndex}
            onChange={setTabIndex}
            indicatorStyle={{ backgroundColor: '#1976d2' }}
        >
          <Tab.Item
              title="概览"
              titleStyle={styles.tabTitle}
              containerStyle={styles.tabContainer}
          />
          <Tab.Item
              title="分析"
              titleStyle={styles.tabTitle}
              containerStyle={styles.tabContainer}
          />
        </Tab>

        <TabView value={tabIndex} onChange={setTabIndex} animationType="spring">
          <TabView.Item style={styles.tabViewItem}>
            {isLoading ? (
                <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
            ) : (
                <ScrollView refreshControl={
                  <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      colors={['#1976d2']}
                      tintColor="#1976d2"
                  />
                }>
                  {renderMonthOverview()}
                  {renderMonthTrend()}
                </ScrollView>
            )}
          </TabView.Item>

          <TabView.Item style={styles.tabViewItem}>
            {isLoading ? (
                <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
            ) : (
                <ScrollView refreshControl={
                  <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      colors={['#1976d2']}
                      tintColor="#1976d2"
                  />
                }>
                  {renderIndustryTypeAnalysis()}
                  {renderPayTypeAnalysis()}
                </ScrollView>
            )}
          </TabView.Item>
        </TabView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    margin: 20,
    padding: 20,
    borderRadius: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 10,
    color: '#757575',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
  },
  monthSelectorText: {
    fontSize: 14,
    color: '#1976d2',
  },
  monthPickerOverlay: {
    width: '70%',
    maxHeight: '50%',
    borderRadius: 10,
    padding: 12,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  yearGroupsContainer: {
    maxHeight: 300,
  },
  yearGroup: {
    marginBottom: 15,
  },
  yearTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
    paddingLeft: 5,
  },
  monthList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  monthItem: {
    width: '25%', // 每行4个月份
    paddingVertical: 8,
    paddingHorizontal: 5,
    marginBottom: 5,
    borderRadius: 4,
    alignItems: 'center',
  },
  selectedMonthItem: {
    backgroundColor: '#e3f2fd',
  },
  monthItemText: {
    fontSize: 14,
    color: '#333',
  },
  selectedMonthItemText: {
    color: '#1976d2',
    fontWeight: 'bold',
  },
  tabContainer: {
    backgroundColor: 'white',
  },
  tabTitle: {
    fontSize: 14,
    color: '#1976d2',
  },
  tabViewItem: {
    width: '100%',
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  divider: {
    marginVertical: 10,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  overviewItem: {
    alignItems: 'center',
    flex: 1,
  },
  overviewLabel: {
    color: '#757575',
    marginBottom: 5,
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  maxItemContainer: {
    marginVertical: 5,
  },
  maxItemTitle: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 5,
  },
  maxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  maxItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
  },
  maxItemValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 10,
    width: '100%', // 移除固定高度，让内容决定高度
  },
  selectedItemInfo: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  selectedItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  selectedItemValue: {
    fontSize: 14,
    color: '#1976d2',
    marginTop: 5,
  },
});

export default StatisticsScreen;

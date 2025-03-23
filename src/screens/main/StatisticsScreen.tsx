import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
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
  const [previousMonths, setPreviousMonths] = useState<string[]>([]);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
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

        // 提取最近6个月
        const months = response.d
          .map((item: AnalyticsItem) => item.type)
          .sort((a: string, b: string) => b.localeCompare(a))
          .slice(0, 6);

        setPreviousMonths(months);

        // 只在初始化或月份列表变化时设置当前月份
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
        // 转换为图表数据格式
        const chartData = response.d.map((item: any, index: number) => ({
          name: item.type,
          value: item.outSum,
          color: getChartColor(index),
          legendFontColor: '#7F7F7F',
          legendFontSize: 12,
        }));

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
        // 转换为图表数据格式
        const chartData = response.d.map((item: any, index: number) => ({
          name: item.type,
          value: item.outSum,
          color: getChartColor(index + 5), // 使用外部函数
          legendFontColor: '#7F7F7F',
          legendFontSize: 12,
        }));

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
  };

  // 处理查看流水详情
  const handleViewFlowDetail = (flowId: Flow) => {
    navigation.navigate('FlowForm', { currentFlow: flowId })
  };

  // 渲染月份选择器
  const renderMonthSelector = () => (
    <View style={styles.monthSelectorContainer}>
      <View style={styles.monthSelectorHeader}>
        <Text style={styles.monthSelectorTitle}></Text>
        <TouchableOpacity
          style={styles.currentMonthButton}
          onPress={() => setShowMonthPicker(true)}
        >
          <Text style={styles.currentMonthText}>{currentMonth}</Text>
          <Icon name="arrow-drop-down" type="material" color="#1976d2" size={16} />
        </TouchableOpacity>
      </View>

      <Overlay
        isVisible={showMonthPicker}
        onBackdropPress={() => setShowMonthPicker(false)}
        overlayStyle={styles.monthPickerOverlay}
      >
        <Text style={styles.monthPickerTitle}>选择月份</Text>
        <ScrollView style={styles.monthPickerList}>
          {previousMonths.map((month) => (
            <TouchableOpacity
              key={month}
              style={[
                styles.monthPickerItem,
                month === currentMonth && styles.selectedMonthPickerItem,
              ]}
              onPress={() => {
                handleMonthSelect(month);
                setShowMonthPicker(false);
              }}
            >
              <Text
                style={[
                  styles.monthPickerItemText,
                  month === currentMonth && styles.selectedMonthPickerItemText,
                ]}
              >
                {month}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Overlay>
    </View>
  );

  // 修改 renderEchartsWithWebView 函数，使用更简单的方法实现图例显示两排
  const renderEchartsWithWebView = (option: any, height: number, onItemClick?: (item: any) => void) => {
    // 修改图例配置，强制分成两行
    const data = option.series[0].data;
    const halfLength = Math.ceil(data.length / 2);
    
    // 创建两个图例组，分别显示在上下两行
    const legendData1 = data.slice(0, halfLength).map(item => item.name);
    const legendData2 = data.slice(halfLength).map(item => item.name);
    
    // 创建新的选项，包含两个图例
    const newOption = {
      ...option,
      legend: [
        {
          // 第一行图例
          data: legendData1,
          bottom: 30, // 放在倒数第二行
          left: 'center',
          itemWidth: 25,
          itemHeight: 14,
          selectedMode: false, // 禁用选择功能
          textStyle: { fontSize: 12 },
          formatter: name => name.length > 8 ? name.slice(0, 8) + '...' : name
        },
        {
          // 第二行图例
          data: legendData2,
          bottom: 10, // 放在最后一行
          left: 'center',
          itemWidth: 25,
          itemHeight: 14,
          selectedMode: false, // 禁用选择功能
          textStyle: { fontSize: 12 },
          formatter: name => name.length > 8 ? name.slice(0, 8) + '...' : name
        }
      ],
      series: [
        {
          ...option.series[0],
          center: ['50%', '40%'] // 将饼图向上移动，为两行图例留出空间
        }
      ]
    };

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
              
              // 点击图表项
              chart.on('click', function(params) {
                if (params.componentType === 'series') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'itemClick',
                    data: params.data
                  }));
                }
              });
              
              // 点击图例项
              chart.on('legendselectchanged', function(params) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'legendClick',
                  name: params.name
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
      <View style={{ height, width: '100%', backgroundColor: '#fff' }}>
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
  };

  // 修改处理点击事件的函数，确保正确处理点击事件
  const handleIndustryItemClick = (message: any) => {
    if (message.type === 'itemClick') {
      // 点击图表区域
      setSelectedIndustryItem(message.data.name);
    } else if (message.type === 'legendClick') {
      // 点击图例
      setSelectedIndustryItem(message.name);
    }
  };

  const handlePayTypeItemClick = (message: any) => {
    if (message.type === 'itemClick') {
      // 点击图表区域
      setSelectedPayTypeItem(message.data.name);
    } else if (message.type === 'legendClick') {
      // 点击图例
      setSelectedPayTypeItem(message.name);
    }
  };

  // 渲染月度概览
  const renderMonthOverview = () => {
    if (!monthAnalysis) return null;

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>{currentMonth} 月度概览</Card.Title>

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

    // 准备图表数据
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        data: industryTypeData.map(item => item.name),
        // 确保所有项目都显示
        selected: industryTypeData.reduce((acc, item) => {
          acc[item.name] = true;
          return acc;
        }, {})
      },
      series: [
        {
          name: '支出类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '40%'], // 将饼图向上移动更多，为底部图例留出更多空间
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          data: industryTypeData.map(item => ({
            value: item.value,
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
              金额: {industryTypeData.find(item => item.name === selectedIndustryItem)?.value || 0}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // 同样修改支付方式分析渲染函数
  const renderPayTypeAnalysis = () => {
    if (payTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>支付方式分析</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 准备图表数据
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        data: payTypeData.map(item => item.name),
        // 不再隐藏任何项目
        selected: payTypeData.reduce((acc, item) => {
          acc[item.name] = true;
          return acc;
        }, {})
      },
      series: [
        {
          name: '支付方式',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'], // 将饼图向上移动，为底部图例留出空间
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          data: payTypeData.map(item => ({
            value: item.value,
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
              金额: {payTypeData.find(item => item.name === selectedPayTypeItem)?.value || 0}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // 修改月度趋势图表
  const renderMonthTrend = () => {
    if (monthData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>月度趋势</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 准备图表数据
    const labels = monthData
      .slice(0, 6)
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.type.substring(5)); // 只显示月份

    const inData = monthData
      .slice(0, 6)
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.inSum);

    const outData = monthData
      .slice(0, 6)
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
        selectedMode: false, // 禁用图例选择功能
        textStyle: {
          color: '#333',
          fontSize: 12,
        },
        icon: 'rect', // 使用矩形图标
        itemWidth: 25, // 图例图标宽度
        itemHeight: 14, // 图例图标高度
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%', // 增加底部空间，为图例留出位置
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
        <Card.Title>月度趋势</Card.Title>

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
        <Tab.Item
          title="趋势"
          titleStyle={styles.tabTitle}
          containerStyle={styles.tabContainer}
        />
      </Tab>

      <TabView value={tabIndex} onChange={setTabIndex} animationType="spring">
        <TabView.Item style={styles.tabViewItem}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
          ) : (
            <ScrollView>
              {renderMonthOverview()}
            </ScrollView>
          )}
        </TabView.Item>

        <TabView.Item style={styles.tabViewItem}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
          ) : (
            <ScrollView>
              {renderIndustryTypeAnalysis()}
              {renderPayTypeAnalysis()}
            </ScrollView>
          )}
        </TabView.Item>

        <TabView.Item style={styles.tabViewItem}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
          ) : (
            <ScrollView>
              {renderMonthTrend()}
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
  monthSelectorContainer: {
    padding: 5,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  monthSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  monthSelectorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  currentMonthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  currentMonthText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1976d2',
    marginRight: 2,
  },
  monthPickerOverlay: {
    width: '70%',
    maxHeight: '50%',
    borderRadius: 10,
    padding: 12,
  },
  monthPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  monthPickerList: {
    maxHeight: 250,
  },
  monthPickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  selectedMonthPickerItem: {
    backgroundColor: '#e3f2fd',
  },
  monthPickerItemText: {
    fontSize: 14,
    color: '#333',
  },
  selectedMonthPickerItemText: {
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
    height: 300, // 增加高度以适应滚动图例
    width: '100%',
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

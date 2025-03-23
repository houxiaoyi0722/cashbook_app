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

  // 获取月度数据
  const fetchMonthData = useCallback(async () => {
    if (!currentBook) return;

    try {
      setIsLoading(true);
      const response = await api.analytics.month(currentBook.bookId);
      console.log('month',response)
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

        console.log('Raw industry data:', response.d);
        console.log('Transformed chart data:', chartData);

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

  // 添加一个辅助函数来渲染 Echarts
  const renderEchartsWithWebView = (option: any, height: number) => {
    // 确保选项是有效的 JSON
    const safeOption = JSON.stringify(option).replace(/'/g, "\\'");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
          <style>
            body, html, #chart { width: 100%; height: 100%; margin: 0; padding: 0; }
          </style>
        </head>
        <body>
          <div id="chart"></div>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              var chart = echarts.init(document.getElementById('chart'));
              var option = ${safeOption};
              chart.setOption(option);
              
              // 添加调试信息
              console.log('Chart initialized with options:', option);
              
              // 添加窗口大小变化监听
              window.addEventListener('resize', function() {
                chart.resize();
              });
            });
          </script>
        </body>
      </html>
    `;

    return (
      <WebView
        source={{ html }}
        style={{ height, width: '100%' }}
        originWhitelist={['*']}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onError={(e) => console.error('WebView error:', e.nativeEvent)}
        onHttpError={(e) => console.error('WebView HTTP error:', e.nativeEvent)}
        onMessage={(e) => console.log('WebView message:', e.nativeEvent.data)}
      />
    );
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

  // 渲染行业类型分析
  const renderIndustryTypeAnalysis = () => {
    if (industryTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>支出类型分析</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 修改行业类型分析的图表配置
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
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
              show: true
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

    // 在渲染图表前检查数据
    console.log('Industry data:', JSON.stringify(industryTypeData));
    console.log('Chart option:', JSON.stringify(option));

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>支出类型分析</Card.Title>

        <View style={styles.chartContainer}>
          {renderEchartsWithWebView(option, 250)}
        </View>
      </Card>
    );
  };

  // 渲染支付方式分析
  const renderPayTypeAnalysis = () => {
    if (payTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>支付方式分析</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // 准备 Echarts 选项
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        data: payTypeData.map(item => item.name)
      },
      color: payTypeData.map(item => item.color),
      series: [
        {
          name: '支付方式',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '14',
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: payTypeData.map(item => ({
            value: item.value,
            name: item.name
          }))
        }
      ]
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>支付方式分析</Card.Title>

        <View style={styles.chartContainer}>
          {renderEchartsWithWebView(option, 250)}
        </View>
      </Card>
    );
  };

  // 渲染月度趋势
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
      .map(item => item.outSum);
    console.log('inData',inData);
    console.log('outData',outData);

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
        textStyle: {
          color: '#333',
          fontSize: 12,
        },
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
          {renderEchartsWithWebView(option, 250)}
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
    height: 250,
    width: '100%',
  },
});

export default StatisticsScreen;

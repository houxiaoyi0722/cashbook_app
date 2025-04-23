import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {Avatar, Button, Card, Divider, Icon, ListItem, Overlay, Tab, TabView, Text} from '@rneui/themed';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {MainStackParamList} from '../../navigation/types';
import api from '../../services/api';
import BookSelector from '../../components/BookSelector';
import {AnalyticsItem, Flow, MonthAnalysis} from '../../types';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';
import {SafeAreaView} from 'react-native-safe-area-context';

import * as echarts from 'echarts/core';
import {BarChart, PieChart} from 'echarts/charts';
import {SvgChart, SVGRenderer} from '@wuba/react-native-echarts';
import {GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import dayjs from 'dayjs';

// 注册必要的组件
echarts.use([
  SVGRenderer,
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
]);

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const getChartColor = (index: number) => {
  const colors = [
    '#FF6384', '#36A2EB', '#4BC0C0',
    '#9966FF', '#F46A9B', '#f05326',
    '#FF9F40', '#8AC249', '#EA5545',
    '#EDBF33', '#27AEEF', '#da1f18',
    '#B33DC6', '#b6b51f', '#f8cb7f',
    '#701866', '#f47a75', '#009db2',
    '#63b2ee', '#76da91', '#93c555',
    '#45a776',
  ];

  return colors[index % colors.length];
};

// Add this new component for rendering charts
const EchartsComponent = ({
  option,
  onItemClick,
  width,
  height,
}: {
  option: echarts.EChartsCoreOption;
  onItemClick?: (params: any) => void;
  width?: number;
  height?: number;
}) => {
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let chart: echarts.ECharts | undefined;
    if (chartRef.current) {
      chart = echarts.init(chartRef.current, 'light', {
        renderer: 'svg',
        width: width,
        height: height,
      });
      chart.setOption(option);

      if (onItemClick) {
        chart.on('click', (params) => {
          if (params.componentType === 'series') {
            onItemClick({
              type: 'itemClick',
              data: params.data,
            });
          }
        });

        chart.on('legendselectchanged', (params: any) => {
          onItemClick({
            type: 'legendClick',
            name: params.name,
            selected: params.selected,
          });
        });
      }
    }

    return () => chart?.dispose();
  }, [width, height]);

  return <SvgChart ref={chartRef} />;
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
  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  const [previousMonths, setPreviousMonths] = useState<{[year: string]: string[]}>({});
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 添加盈余相关状态
  const [monthBalance, setMonthBalance] = useState<string>('0.00');
  const [yearBalance, setYearBalance] = useState<string>('0.00');
  const [yearIncomeTotal, setYearIncomeTotal] = useState<string>('0.00');
  const [yearExpenseTotal, setYearExpenseTotal] = useState<string>('0.00');

  // 添加选中项状态到组件顶层
  const [selectedIndustryItem, setSelectedIndustryItem] = useState<string | null>(null);
  const [selectedPayTypeItem, setSelectedPayTypeItem] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState<string | null>(null);
  const [selectedMoney, setSelectedMoney] = useState<string | null>(null);

  // 添加流水详情相关状态
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState('');
  const [detailsData, setDetailsData] = useState<Flow[]>([]);
  const [totalItem, setTotalItem] = useState<number>(0);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsColor, setDetailsColor] = useState('#1976d2');

  // 添加分页相关状态
  const [detailsPage, setDetailsPage] = useState(1);
  const [detailsHasMore, setDetailsHasMore] = useState(true);
  const [detailsLoadingMore, setDetailsLoadingMore] = useState(false);
  const PAGE_SIZE = 20; // 每页数据条数

  // 添加流水归属相关状态
  const [attributionData, setAttributionData] = useState<any[]>([]);
  const [selectedAttributionItem, setSelectedAttributionItem] = useState<string | null>(null);

  // 添加流水类型选择状态
  const [selectedFlowType, setSelectedFlowType] = useState<'支出' | '收入' | '不计收支'>('支出');

  // 获取月度分析
  const fetchMonthAnalysis = useCallback(async () => {
    if (!currentBook || !currentMonth) {return;}

    try {
      setIsLoading(true);
      const response = await api.analytics.monthAnalysis(currentMonth, currentBook.bookId);

      if (response.c === 200 && response.d) {
        setMonthAnalysis(response.d);

        // 计算当月盈余 = 收入 - 支出
        const inSum = parseFloat(response.d.inSum);
        const outSum = parseFloat(response.d.outSum);
        const balance = (inSum - outSum).toFixed(2);
        setMonthBalance(balance);
      }
    } catch (error) {
      console.error('获取当月分析失败', error);
      Alert.alert('错误', '获取当月分析失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth]);

  // 获取月度数据
  const fetchMonthData = useCallback(async () => {
    if (!currentBook) {return;}

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

        // 计算当前年份的盈余
        const currentYear = currentMonth.substring(0, 4);
        let yearIncome = 0;
        let yearExpense = 0;

        // 筛选出当前年份的数据
        const yearData = response.d.filter((item: AnalyticsItem) => item.type.startsWith(currentYear));

        // 累加收入和支出
        yearData.forEach((item: AnalyticsItem) => {
          yearIncome += item.inSum;
          yearExpense += item.outSum;
        });

        // 计算年度盈余 = 年度总收入 - 年度总支出
        const balance = (yearIncome - yearExpense).toFixed(2);
        setYearBalance(balance);
        setYearIncomeTotal(yearIncome.toFixed(2));
        setYearExpenseTotal(yearExpense.toFixed(2));
      }
    } catch (error) {
      console.error('获取月度数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取月度数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth]);

  // 获取行业类型数据
  const fetchIndustryTypeData = useCallback(async () => {
    if (!currentBook || !currentMonth) {return;}

    try {
      setIsLoading(true);
      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');
      const response = await api.analytics.industryType({
        bookId: currentBook.bookId,
        flowType: selectedFlowType,
        startDay: startDate,
        endDay: endDate,
      });

      if (response.c === 200 && response.d) {
        // 转换为图表数据格式，并格式化数值
        const chartData = response.d
          .map((item: any, index: number) => ({
            name: item.type,
            value: parseFloat(selectedFlowType === '收入' ? item.inSum.toFixed(2) : selectedFlowType === '支出' ? item.outSum.toFixed(2) : item.zeroSum.toFixed(2)), // 根据类型选择不同的值
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
  }, [currentBook, currentMonth, selectedFlowType]);

  // 获取支付方式数据
  const fetchPayTypeData = useCallback(async () => {
    if (!currentBook || !currentMonth) {return;}

    try {
      setIsLoading(true);
      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

      const response = await api.analytics.payType({
        bookId: currentBook.bookId,
        flowType: selectedFlowType,
        startDay: startDate,
        endDay: endDate,
      });

      if (response.c === 200 && response.d) {
        // 转换为图表数据格式，并格式化数值
        const chartData = response.d
          .map((item: any, index: number) => ({
            name: item.type,
            value: parseFloat(selectedFlowType === '收入' ? item.inSum.toFixed(2) : selectedFlowType === '支出' ? item.outSum.toFixed(2) : item.zeroSum.toFixed(2)), // 根据类型选择不同的值
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
  }, [currentBook, currentMonth, selectedFlowType]);

  // 获取流水归属数据
  const fetchAttributionData = useCallback(async () => {
    if (!currentBook || !currentMonth) {return;}

    try {
      setIsLoading(true);
      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

      const response = await api.analytics.attribution({
        bookId: currentBook.bookId,
        startDay: startDate,
        endDay: endDate,
        flowType: selectedFlowType,
      });

      if (response.c === 200 && response.d) {
        // 处理数据，格式化为饼图所需格式
        const formattedData = response.d.map((item: any, index: number) => ({
          name: item.type || '未分类',
          value: parseFloat(selectedFlowType === '收入' ? item.inSum.toFixed(2) : selectedFlowType === '支出' ? item.outSum.toFixed(2) : item.zeroSum.toFixed(2)),
          color: getChartColor(index + 10),
          percentage: ((parseFloat(selectedFlowType === '收入' ? item.inSum.toFixed(2) : selectedFlowType === '支出' ? item.outSum.toFixed(2) : item.zeroSum.toFixed(2)) /
                       response.d.reduce((sum: number) => sum + parseFloat(selectedFlowType === '收入' ? item.inSum.toFixed(2) : selectedFlowType === '支出' ? item.outSum.toFixed(2) : item.zeroSum.toFixed(2)), 0)) * 100).toFixed(2),
        }));

        setAttributionData(formattedData);
      }
    } catch (error) {
      console.error('获取流水归属数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取流水归属数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [currentBook, currentMonth, selectedFlowType]);

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
          if (isMounted) {await fetchIndustryTypeData();}
          if (isMounted) {await fetchPayTypeData();}
          if (isMounted) {await fetchAttributionData();}
        } catch (err) {
          if (isMounted) {
            console.error('获取分析数据失败', err instanceof Error ? err.message : String(err));
          }
        }
      };

      fetchData();
    }
    return () => { isMounted = false; };
  }, [currentBook, currentMonth, fetchMonthAnalysis, fetchIndustryTypeData, fetchPayTypeData, fetchAttributionData]);

  // 处理月份选择
  const handleMonthSelect = (month: string) => {
    setCurrentMonth(month);
    setShowMonthPicker(false);
  };

  // 处理查看流水详情
  const handleViewFlowDetail = (flowId: Flow) => {
    navigation.navigate('FlowForm', { currentFlow: flowId });
  };

  // 下拉刷新处理函数
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchMonthAnalysis(),
        fetchIndustryTypeData(),
        fetchPayTypeData(),
        fetchAttributionData(),
      ]);
    } catch (error) {
      console.error('刷新数据失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '刷新数据失败');
    } finally {
      setRefreshing(false);
    }
  }, [fetchMonthAnalysis, fetchIndustryTypeData, fetchPayTypeData, fetchAttributionData]);

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

  // Replace the renderEchartsWithWebView function with this new implementation
  const renderEcharts = (option: echarts.EChartsCoreOption, onItemClick?: (params: any) => void, height = 300) => {
    // 计算图表宽度，基于屏幕宽度
    const chartWidth = Math.min(350, Dimensions.get('window').width - 40);

    return (
      <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <EchartsComponent
          option={option}
          onItemClick={onItemClick}
          width={chartWidth}
          height={height}
        />
      </View>
    );
  };

  // 修改处理图表项目点击的函数
  const handleIndustryItemClick = (message: any) => {
    console.log('Industry item click:', message);
    if (message.type === 'itemClick') {
      setSelectedIndustryItem(message.data.name);
      setSelectedMoney(message.data.value);
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
      setSelectedMoney(message.data.value);
    } else if (message.type === 'legendClick') {
      // 点击图例时，只更新选中项，不执行其他操作
      // 图例的显示/隐藏由 Echarts 内部处理
      setSelectedPayTypeItem(message.name);
    }
  };

  // 处理归属图表项目点击
  const handleAttributionItemClick = (message: any) => {
    console.log('Attribution item click:', message);
    if (message.type === 'itemClick') {
      setSelectedAttributionItem(message.data.name);
      setSelectedMoney(message.data.value);
    } else if (message.type === 'legendClick') {
      setSelectedAttributionItem(message.name);
    }
  };

  // 修改获取流水详情数据的函数，支持分页
  const fetchFlowDetails = useCallback(async (type: string, category: 'industry' | 'payment' | 'attribution', page = 1, append = false) => {
    if (!currentBook || !currentMonth || !type) {return;}

    try {
      if (page === 1) {
        setDetailsLoading(true);
      } else {
        setDetailsLoadingMore(true);
      }

      // 构建查询参数
      const startDate = `${currentMonth}-01`;
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');
      let params: {
        pageNum: number;
        pageSize: number;
        bookId: string;
        startDay?: string;
        endDay?: string;
        flowType?: string;
        industryType?: string;
        payType?: string;
        moneySort?: string;
        attribution?: string;
        name?: string;
        description?: string;
      } = {
        pageNum: page,
        pageSize: PAGE_SIZE,
        bookId: currentBook.bookId,
        moneySort: 'desc',
        startDay: startDate,
        endDay: endDate,
        flowType: selectedFlowType,
      };

      if (category === 'industry') {
        params.industryType = type;
      } else if (category === 'payment') {
        params.payType = type;
      } else if (category === 'attribution') {
        params.attribution = type;
      }

      const response = await api.flow.page(params);
      if (response.c === 200 && response.d) {
        if (append) {
          setDetailsData(prev => [...prev, ...response.d.data]);
        } else {
          setDetailsData(response.d.data);
        }
        // 计算总页数
        const totalItems = response.d.total;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE);
        const hasMore = page < totalPages;
        setTotalItem(totalItems);
        setDetailsHasMore(hasMore);
      }
      setDetailsPage(page);
      setDetailsLoading(false);
      setDetailsLoadingMore(false);
    } catch (error) {
      console.error('获取流水详情失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取流水详情失败');
      setDetailsLoading(false);
      setDetailsLoadingMore(false);
    }
  }, [currentBook, currentMonth, selectedFlowType]);

  // 处理加载更多数据
  const handleLoadMoreDetails = () => {
    if (detailsLoadingMore || !detailsHasMore) {return;}

    const nextPage = detailsPage + 1;

    if (currentItem === 'selectedIndustryItem' && selectedIndustryItem) {
      fetchFlowDetails(selectedIndustryItem, 'industry', nextPage, true);
    } else if (currentItem === 'selectedPayTypeItem' && selectedPayTypeItem) {
      fetchFlowDetails(selectedPayTypeItem, 'payment', nextPage, true);
    } else if (currentItem === 'selectedAttributionItem' && selectedAttributionItem) {
      fetchFlowDetails(selectedAttributionItem, 'attribution', nextPage, true);
    }
  };

  // 处理查看行业类型详情
  const handleViewIndustryDetails = useCallback(() => {
    if (!selectedIndustryItem) {return;}

    setDetailsTitle(`${selectedIndustryItem} 交易明细`);
    setDetailsVisible(true);
    setDetailsPage(1);
    setDetailsHasMore(true);
    setDetailsData([]);

    // 设置详情颜色与图表项颜色一致
    const selectedData = industryTypeData.find(item => item.name === selectedIndustryItem);
    if (selectedData) {
      setDetailsColor(selectedData.color);
    }
    setCurrentItem('selectedIndustryItem');
    fetchFlowDetails(selectedIndustryItem, 'industry', 1, false);
  }, [selectedIndustryItem, industryTypeData, fetchFlowDetails]);

  // 处理查看支付方式详情
  const handleViewPayTypeDetails = useCallback(() => {
    if (!selectedPayTypeItem) {return;}

    setDetailsTitle(`${selectedPayTypeItem} 交易明细`);
    setDetailsVisible(true);
    setDetailsPage(1);
    setDetailsHasMore(true);
    setDetailsData([]);

    // 设置详情颜色与图表项颜色一致
    const selectedData = payTypeData.find(item => item.name === selectedPayTypeItem);
    if (selectedData) {
      setDetailsColor(selectedData.color);
    }
    setCurrentItem('selectedPayTypeItem');
    fetchFlowDetails(selectedPayTypeItem, 'payment', 1, false);
  }, [selectedPayTypeItem, payTypeData, fetchFlowDetails]);

  // 处理查看归属详情
  const handleViewAttributionDetails = useCallback(() => {
    if (!selectedAttributionItem) {return;}

    setDetailsTitle(`${selectedAttributionItem} 交易明细`);
    setDetailsVisible(true);
    setDetailsPage(1);
    setDetailsHasMore(true);
    setDetailsData([]);

    // 设置详情颜色与图表项颜色一致
    const selectedData = attributionData.find(item => item.name === selectedAttributionItem);
    if (selectedData) {
      setDetailsColor(selectedData.color);
    }

    setCurrentItem('selectedAttributionItem');
    fetchFlowDetails(selectedAttributionItem, 'attribution', 1, false);
  }, [selectedAttributionItem, attributionData, fetchFlowDetails]);

  // 关闭详情弹窗
  const handleCloseDetails = () => {
    setDetailsVisible(false);
    setDetailsData([]);
    setDetailsPage(1);
    setDetailsHasMore(true);
  };

  // 渲染流水详情项
  const renderFlowDetailItem = ({ item }: { item: Flow }) => (
    <ListItem key={item.id} bottomDivider containerStyle={styles.detailItem}>
      <Avatar
        rounded
        icon={{ name: 'receipt', type: 'material' }}
        containerStyle={{ backgroundColor: detailsColor + '40' }}
      />
      <ListItem.Content>
        <ListItem.Title style={styles.detailItemTitle}>
          {item.name || `${item.industryType}`}{item.attribution ? ' - ' + item.attribution : ''}
        </ListItem.Title>
        <ListItem.Subtitle style={styles.detailItemSubtitle}>
          {dayjs(item.day).format('YYYY-MM-DD')} · {item.payType} · {item.industryType}
        </ListItem.Subtitle>
        <ListItem.Subtitle style={styles.detailItemSubtitle}>
          {item.description}
        </ListItem.Subtitle>
      </ListItem.Content>
      <Text style={[styles.detailItemAmount, { color: item.flowType === '支出' ? '#f44336' : item.flowType === '收入' ? '#4caf50' : '#111111' }]}>
        {item.flowType === '支出' ? '-' : item.flowType === '收入' ? '+' : ''}{item.money.toFixed(2)}
      </Text>
    </ListItem>
  );

  // 渲染底部加载更多指示器
  const renderFooter = () => {
    if (!detailsLoadingMore) {return null;}

    return (
      <View style={styles.loadMoreFooter}>
        <ActivityIndicator size="small" color={detailsColor} />
        <Text style={styles.loadMoreText}>加载更多...</Text>
      </View>
    );
  };

  // 渲染流水详情弹窗
  const renderFlowDetailsModal = () => (
    <Modal
      visible={detailsVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCloseDetails}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{detailsTitle}</Text>
            <TouchableOpacity onPress={handleCloseDetails} style={styles.closeButton}>
              <Icon name="close" type="material" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          <Divider style={styles.modalDivider} />

          {detailsLoading ? (
            <ActivityIndicator size="large" color={detailsColor} style={styles.detailsLoader} />
          ) : (
            <>
              {detailsData.length === 0 ? (
                <View style={styles.emptyDetails}>
                  <Icon name="receipt-long" type="material" size={48} color="#e0e0e0" />
                  <Text style={styles.emptyDetailsText}>暂无流水记录</Text>
                </View>
              ) : (
                <FlatList
                  data={detailsData}
                  renderItem={renderFlowDetailItem}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={styles.detailsList}
                  showsVerticalScrollIndicator={false}
                  onEndReached={handleLoadMoreDetails}
                  onEndReachedThreshold={0.3}
                  ListFooterComponent={renderFooter}
                />
              )}

              <View style={styles.modalFooter}>
                <Text style={styles.totalText}>
                  {totalItem} 笔交易，合计：
                  <Text style={{ color: detailsColor, fontWeight: 'bold' }}>
                    {selectedMoney}
                  </Text>
                </Text>
                <Button
                  title="关闭"
                  onPress={handleCloseDetails}
                  buttonStyle={[styles.closeModalButton, { backgroundColor: detailsColor }]}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

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

  // 渲染盈余概览
  const renderBalanceOverview = () => {
    const currentYear = currentMonth.substring(0, 4);
    const monthBalanceValue = parseFloat(monthBalance);
    const yearBalanceValue = parseFloat(yearBalance);

    // 计算盈亏比
    const incomeValue = parseFloat(yearIncomeTotal);
    const expenseValue = parseFloat(yearExpenseTotal);
    const totalValue = incomeValue + expenseValue;
    const incomeRatio = totalValue > 0 ? (incomeValue / totalValue) * 100 : 0;
    const expenseRatio = totalValue > 0 ? (expenseValue / totalValue) * 100 : 0;

    return (
      <Card containerStyle={styles.compactCard}>
        <Card.Title>现金流概览</Card.Title>

        <View style={styles.balanceContainer}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>当月盈余</Text>
            <View style={styles.balanceValueContainer}>
              <Text
                style={[
                  styles.balanceValue,
                  { color: monthBalanceValue >= 0 ? '#4caf50' : '#f44336' },
                ]}
              >
                {monthBalanceValue >= 0 ? '+' : ''}{monthBalance}
              </Text>
              <Icon
                name={monthBalanceValue >= 0 ? 'trending-up' : 'trending-down'}
                type="material"
                size={16}
                color={monthBalanceValue >= 0 ? '#4caf50' : '#f44336'}
                style={styles.balanceIcon}
              />
            </View>
          </View>

          <View style={styles.balanceItemDivider} />

          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>{currentYear}年盈余</Text>
            <View style={styles.balanceValueContainer}>
              <Text
                style={[
                  styles.balanceValue,
                  { color: yearBalanceValue >= 0 ? '#4caf50' : '#f44336' },
                ]}
              >
                {yearBalanceValue >= 0 ? '+' : ''}{yearBalance}
              </Text>
              <Icon
                name={yearBalanceValue >= 0 ? 'trending-up' : 'trending-down'}
                type="material"
                size={16}
                color={yearBalanceValue >= 0 ? '#4caf50' : '#f44336'}
                style={styles.balanceIcon}
              />
            </View>
          </View>
        </View>

        <View style={styles.yearBalanceContainer}>
          <Text style={styles.yearBalanceTitle}>{currentYear}年度收支分析</Text>

          {/* 收支比例条 */}
          <View style={styles.ratioBarContainer}>
            <View style={styles.ratioBar}>
              <View style={styles.ratioBarInner}>
                <View
                  style={[
                    styles.ratioIncome,
                    { flex: incomeRatio },
                  ]}
                />
                <View
                  style={[
                    styles.ratioExpense,
                    { flex: expenseRatio },
                  ]}
                />
              </View>
            </View>
            <View style={styles.ratioLegendContainer}>
              <View style={styles.ratioLegend}>
                <View style={[styles.ratioLegendColor, { backgroundColor: '#4caf50' }]} />
                <Text style={styles.ratioLegendText}>收入 {incomeRatio.toFixed(1)}%</Text>
              </View>
              <View style={styles.ratioLegend}>
                <View style={[styles.ratioLegendColor, { backgroundColor: '#f44336' }]} />
                <Text style={styles.ratioLegendText}>支出 {expenseRatio.toFixed(1)}%</Text>
              </View>
            </View>
          </View>

          <View style={styles.yearBalanceDetails}>
            <View style={styles.yearBalanceRow}>
              <Icon name="trending-up" type="material" size={16} color="#4caf50" />
              <Text style={styles.yearBalanceLabel}>年度总收入</Text>
              <Text style={[styles.yearBalanceValue, { color: '#4caf50' }]}>
                {yearIncomeTotal}
              </Text>
            </View>

            <View style={styles.yearBalanceRow}>
              <Icon name="trending-down" type="material" size={16} color="#f44336" />
              <Text style={styles.yearBalanceLabel}>年度总支出</Text>
              <Text style={[styles.yearBalanceValue, { color: '#f44336' }]}>
                {yearExpenseTotal}
              </Text>
            </View>

            <View style={[styles.yearBalanceRow, {borderBottomWidth: 0, paddingBottom: 0}]}>
              <Icon
                name={yearBalanceValue >= 0 ? 'account-balance' : 'warning'}
                type="material"
                size={16}
                color={yearBalanceValue >= 0 ? '#4caf50' : '#f44336'}
              />
              <Text style={styles.yearBalanceLabel}>年度结余</Text>
              <Text
                style={[
                  styles.yearBalanceValue,
                  {
                    color: yearBalanceValue >= 0 ? '#4caf50' : '#f44336',
                    fontWeight: 'bold',
                  },
                ]}
              >
                {yearBalanceValue >= 0 ? '+' : ''}{yearBalance}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  // Update the renderIndustryTypeAnalysis function
  const renderIndustryTypeAnalysis = () => {
    if (!industryTypeData || industryTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>{`类型分析 (${selectedFlowType})`}</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // Sort data by value from largest to smallest
    const sortedData = [...industryTypeData].sort((a, b) => b.value - a.value);

    // 计算图例所需的高度
    // 每行显示3个图例，计算需要多少行
    const legendRows = Math.ceil(sortedData.length / 3);
    // 每个图例项高度约25px，加上图表本身的高度和其他元素
    const chartHeight = 250 + (legendRows > 2 ? (legendRows - 2) * 25 : 0);

    // Prepare chart data
    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        type: 'plain', // 改为plain而不是scroll
        orient: 'horizontal',
        bottom: 10,
        left: 'center',
        data: sortedData.map(item => item.name),
        textStyle: { fontSize: 10 },
        formatter: (name: string) => name.length > 6 ? name.slice(0, 6) + '...' : name,
        selected: {},
        itemWidth: 15,
        itemHeight: 10,
        itemGap: 5,
        padding: 5,
        // 设置图例为多行显示
        grid: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10,
        },
      },
      series: [
        {
          name: '支出类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '35%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: false,
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: sortedData.map(item => ({
            value: parseFloat(item.value).toFixed(2),
            name: item.name,
            itemStyle: {
              color: item.color,
            },
          })),
        },
      ],
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>{`类型分析 (${selectedFlowType})`}</Card.Title>

        <View style={styles.chartContainer}>
          {renderEcharts(option, handleIndustryItemClick, chartHeight)}
        </View>

        {selectedIndustryItem && (
          <View style={styles.selectedItemInfo}>
            <View style={styles.selectedItemHeader}>
              <Text style={styles.selectedItemTitle}>{selectedIndustryItem}</Text>
              <TouchableOpacity
                style={[styles.viewDetailsButton, { backgroundColor: industryTypeData.find(item => item.name === selectedIndustryItem)?.color || '#1976d2' }]}
                onPress={handleViewIndustryDetails}
              >
                <Icon name="visibility" type="material" size={16} color="#fff" />
                <Text style={styles.viewDetailsText}>查看详情</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.selectedItemValue}>
              金额: {industryTypeData.find(item => item.name === selectedIndustryItem)?.value.toFixed(2) || '0.00'}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // Update the renderPayTypeAnalysis function
  const renderPayTypeAnalysis = () => {
    if (!payTypeData || payTypeData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>{`支付方式分析 (${selectedFlowType})`}</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // Sort data by value from largest to smallest
    const sortedData = [...payTypeData].sort((a, b) => b.value - a.value);

    // 计算图例所需的高度
    const legendRows = Math.ceil(sortedData.length / 3);
    const chartHeight = 300 + (legendRows > 2 ? (legendRows - 2) * 25 : 0);

    // Prepare chart data
    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        type: 'plain',
        orient: 'horizontal',
        bottom: 10,
        left: 'center',
        data: sortedData.map(item => item.name),
        textStyle: { fontSize: 10 },
        formatter: (name: string) => name.length > 6 ? name.slice(0, 6) + '...' : name,
        selected: {},
        itemWidth: 15,
        itemHeight: 10,
        itemGap: 5,
        padding: 5,
      },
      series: [
        {
          name: '支付方式',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: false,
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: sortedData.map(item => ({
            value: parseFloat(item.value.toFixed(2)),
            name: item.name,
            itemStyle: {
              color: item.color,
            },
          })),
        },
      ],
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>{`支付方式分析 (${selectedFlowType})`}</Card.Title>

        <View style={styles.chartContainer}>
          {renderEcharts(option, handlePayTypeItemClick, chartHeight)}
        </View>

        {selectedPayTypeItem && (
          <View style={styles.selectedItemInfo}>
            <View style={styles.selectedItemHeader}>
              <Text style={styles.selectedItemTitle}>{selectedPayTypeItem}</Text>
              <TouchableOpacity
                style={[styles.viewDetailsButton, { backgroundColor: payTypeData.find(item => item.name === selectedPayTypeItem)?.color || '#1976d2' }]}
                onPress={handleViewPayTypeDetails}
              >
                <Icon name="visibility" type="material" size={16} color="#fff" />
                <Text style={styles.viewDetailsText}>查看详情</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.selectedItemValue}>
              金额: {payTypeData.find(item => item.name === selectedPayTypeItem)?.value.toFixed(2) || '0.00'}
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // Update the renderMonthTrend function
  const renderMonthTrend = () => {
    const year = currentMonth.substring(0,4);

    if (monthData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>{year + '收支趋势'}</Card.Title>
          <Text style={styles.emptyText}>暂无数据</Text>
        </Card>
      );
    }

    // Prepare chart data
    const labels = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.type.substring(5)); // Only show month

    const inData = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.inSum.toFixed(2));

    const outData = monthData
      .filter(item => item.type.match(`.*${year}.*`))
      .sort((a, b) => a.type.localeCompare(b.type))
      .map(item => item.outSum.toFixed(2));

    // Prepare Echarts options
    const option: echarts.EChartsCoreOption = {
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
        selectedMode: true,
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
        containLabel: true,
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
        <Card.Title>{year + '收支趋势'}</Card.Title>

        <View style={styles.chartContainer}>
          {renderEcharts(option, undefined)}
        </View>
      </Card>
    );
  };

  // Update the renderAttributionAnalysis function
  const renderAttributionAnalysis = () => {
    if (!attributionData || attributionData.length === 0) {
      return (
        <Card containerStyle={styles.card}>
          <Card.Title>{`流水归属分析 (${selectedFlowType})`}</Card.Title>
          <Text style={styles.emptyText}>暂无归属数据</Text>
        </Card>
      );
    }

    // 计算图例所需的高度
    const legendRows = Math.ceil(attributionData.length / 3);
    const chartHeight = 300 + (legendRows > 2 ? (legendRows - 2) * 25 : 0);

    // Prepare pie chart data
    const pieData = attributionData.map(item => ({
      name: item.name,
      value: parseFloat(item.value),
      itemStyle: { color: item.color },
    }));

    // Configure pie chart options
    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        type: 'plain',
        orient: 'horizontal',
        bottom: 10,
        left: 'center',
        data: attributionData.map(item => item.name),
        textStyle: { fontSize: 10 },
        formatter: (name: string) => name.length > 6 ? name.slice(0, 6) + '...' : name,
        selected: {},
        itemWidth: 15,
        itemHeight: 10,
        itemGap: 5,
        padding: 5,
      },
      series: [
        {
          name: '流水归属',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: false,
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: pieData,
        },
      ],
    };

    return (
      <Card containerStyle={styles.card}>
        <Card.Title>{`流水归属分析 (${selectedFlowType})`}</Card.Title>

        <View style={styles.chartContainer}>
          {renderEcharts(option, handleAttributionItemClick, chartHeight)}
        </View>

        {selectedAttributionItem && (
          <View style={styles.selectedItemInfo}>
            <View style={styles.selectedItemHeader}>
              <Text style={styles.selectedItemTitle}>{selectedAttributionItem}</Text>
              <TouchableOpacity
                style={[styles.viewDetailsButton, { backgroundColor: attributionData.find(item => item.name === selectedAttributionItem)?.color || '#1976d2' }]}
                onPress={handleViewAttributionDetails}
              >
                <Icon name="visibility" type="material" size={14} color="#fff" />
                <Text style={styles.viewDetailsText}>查看详情</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.selectedItemValue}>
              金额: {attributionData.find(item => item.name === selectedAttributionItem)?.value || 0}
              ({attributionData.find(item => item.name === selectedAttributionItem)?.percentage || 0}%)
            </Text>
          </View>
        )}
      </Card>
    );
  };

  // 添加流水类型切换处理函数
  const handleFlowTypeChange = (type: '支出' | '收入' | '不计收支') => {
    setSelectedFlowType(type);
    // 重置选中状态
    setSelectedIndustryItem(null);
    setSelectedPayTypeItem(null);
    setSelectedAttributionItem(null);
  };

  // 优化流水类型选择器为分段控件，添加图标
  const renderFlowTypeSelector = () => (
    <View style={styles.flowTypeSelectorContainer}>
      <View style={styles.flowTypeButtonGroup}>
        <TouchableOpacity
          style={[
            styles.flowTypeButton,
            selectedFlowType === '支出' && styles.selectedFlowTypeButton,
            { borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
          ]}
          onPress={() => handleFlowTypeChange('支出')}
        >
          <Icon
            name="trending-down"
            type="material"
            size={16}
            color={selectedFlowType === '支出' ? 'white' : '#757575'}
            style={styles.flowTypeIcon}
          />
          <Text style={[
            styles.flowTypeText,
            selectedFlowType === '支出' && styles.selectedFlowTypeText,
          ]}>支出</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.flowTypeButton,
            selectedFlowType === '收入' && styles.selectedFlowTypeButton,
          ]}
          onPress={() => handleFlowTypeChange('收入')}
        >
          <Icon
            name="trending-up"
            type="material"
            size={16}
            color={selectedFlowType === '收入' ? 'white' : '#757575'}
            style={styles.flowTypeIcon}
          />
          <Text style={[
            styles.flowTypeText,
            selectedFlowType === '收入' && styles.selectedFlowTypeText,
          ]}>收入</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.flowTypeButton,
            selectedFlowType === '不计收支' && styles.selectedFlowTypeButton,
            { borderTopRightRadius: 20, borderBottomRightRadius: 20 },
          ]}
          onPress={() => handleFlowTypeChange('不计收支')}
        >
          <Icon
            name="remove"
            type="material"
            size={16}
            color={selectedFlowType === '不计收支' ? 'white' : '#757575'}
            style={styles.flowTypeIcon}
          />
          <Text style={[
            styles.flowTypeText,
            selectedFlowType === '不计收支' && styles.selectedFlowTypeText,
          ]}>不计收支</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
    <SafeAreaView style={styles.container} edges={['top']}>
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
                  {renderBalanceOverview()}
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
                  {renderFlowTypeSelector()}
                  {renderIndustryTypeAnalysis()}
                  {renderPayTypeAnalysis()}
                  {renderAttributionAnalysis()}
                </ScrollView>
            )}
          </TabView.Item>
        </TabView>

      {/* 流水详情弹窗 */}
      {renderFlowDetailsModal()}
    </View>
    </SafeAreaView>
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
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: 10,
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
  selectedItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1976d2',
  },
  viewDetailsText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalDivider: {
    marginBottom: 8,
  },
  detailsLoader: {
    padding: 32,
  },
  detailsList: {
    paddingBottom: 16,
  },
  detailItem: {
    paddingVertical: 12,
  },
  detailItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  detailItemSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  detailItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyDetails: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDetailsText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  totalText: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  closeModalButton: {
    borderRadius: 8,
    paddingVertical: 10,
  },
  loadMoreFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#757575',
  },
  flowTypeSelectorContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 0,
    marginHorizontal: 0,
    borderRadius: 0,
    shadowColor: 'transparent',
    elevation: 0,
    alignItems: 'center',
  },
  flowTypeButtonGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    overflow: 'hidden',
  },
  flowTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 0,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    minWidth: 90,
  },
  selectedFlowTypeButton: {
    backgroundColor: '#1976d2',
    borderRightColor: '#1976d2',
  },
  flowTypeIcon: {
    marginRight: 4,
  },
  flowTypeText: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
  },
  selectedFlowTypeText: {
    color: 'white',
    fontWeight: 'bold',
  },
  compactCard: {
    margin: 10,
    borderRadius: 10,
    padding: 12,
    paddingBottom: 8,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  balanceItem: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  balanceValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  balanceIcon: {
    marginLeft: 4,
  },
  balanceItemDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  yearBalanceContainer: {
    marginTop: 5,
  },
  yearBalanceTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 5,
  },
  yearBalanceDetails: {
    marginTop: 5,
  },
  yearBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  yearBalanceLabel: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 6,
    flex: 1,
  },
  yearBalanceValue: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'right',
  },
  ratioBarContainer: {
    marginTop: 5,
    marginBottom: 8,
  },
  ratioBar: {
    height: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  ratioBarInner: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
  },
  ratioIncome: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  ratioExpense: {
    height: '100%',
    backgroundColor: '#f44336',
  },
  ratioLegendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  ratioLegend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratioLegendColor: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 3,
  },
  ratioLegendText: {
    fontSize: 11,
    color: '#757575',
  },
});

export default StatisticsScreen;

﻿import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Text, Card, Button, Icon, Overlay } from '@rneui/themed';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useBookkeeping } from '../../context/BookkeepingContext';
import BookSelector from '../../components/BookSelector';
import { Flow, DailyData, CalendarMark } from '../../types';
import moment from 'moment';
import {eventBus} from '../../navigation';
import { SwipeListView } from 'react-native-swipe-list-view';
import api from '../../services/api';
import * as ImagePicker from 'react-native-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from "@react-native-async-storage/async-storage";
type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

// 配置中文日历
LocaleConfig.locales.zh = {
  monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  dayNamesShort: ['日', '一', '二', '三', '四', '五', '六'],
};
LocaleConfig.defaultLocale = 'zh';

const CalendarScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { currentBook, fetchCalendarData, fetchDayFlows } = useBookkeeping();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState<DailyData>({});
  const [calendarMarks, setCalendarMarks] = useState<CalendarMark>({});
  const [dayFlows, setDayFlows] = useState<Flow[]>([]);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [showYearMonthSelector, setShowYearMonthSelector] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(moment().year());
  const [selectedMonth, setSelectedMonth] = useState(moment().month() + 1);
  const [refreshing, setRefreshing] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateCriteria, setDuplicateCriteria] = useState({
    name: true,
    description: true,
    industryType: true,
    flowType: true,
    payType: true,
  });

  // 使用 useRef 存储状态
  const dailyDataRef = useRef<DailyData>({});
  const calendarMarksRef = useRef<CalendarMark>({});

  // 使用 useMemo 缓存卡片数据
  const dayCardData = useMemo(() => ({
    selectedDate,
    dailyData,
    dayFlows,
  }), [selectedDate, dailyData, dayFlows]);

  // 添加平账功能相关状态和函数
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceCandidates, setBalanceCandidates] = useState<any[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 添加小票上传相关状态和函数
  const [headers, setHeaders] = useState({});
  const [viewingInvoice, setViewingInvoice] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState(0);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});

  // 获取日历数据
  const fetchCalendarFlows = useCallback(async () => {
    if (!currentBook || !currentMonth) {return;}

    try {
      // 获取日历数据
      const { dailyData, calendarMarks } = await fetchCalendarData();

      // 更新日历数据引用
      dailyDataRef.current = dailyData;

      // 创建新的标记对象
      const updatedMarks = { ...calendarMarks };

      // 获取当前最新的选中日期
      const currentSelectedDate = selectedDate;

      // 确保当前选中日期的样式正确
      if (currentSelectedDate) {
        updatedMarks[currentSelectedDate] = {
          ...(updatedMarks[currentSelectedDate] || {}),
          selected: true,
          customStyles: {
            container: {
              backgroundColor: '#1976d2',
            },
            text: {
              color: 'white',
            },
          },
        };
      }

      // 更新状态
      calendarMarksRef.current = updatedMarks;
      setCalendarMarks(updatedMarks);
      setDailyData(dailyData);

      // 获取选中日期的流水详情
      if (currentSelectedDate) {
        await fetchDayDetail(currentSelectedDate);
      }
    } catch (error) {
      console.error('获取流水失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取流水失败');
    }
  }, [currentBook, currentMonth, fetchCalendarData, selectedDate]);

  // 获取某天的流水详情
  const fetchDayDetail = useCallback(async (date: string) => {
    if (!currentBook) {return;}
    try {
      setDayDetailLoading(true);
      const flows = await fetchDayFlows(date);
      setDayFlows(flows);
    } catch (error) {
      console.error('获取日流水详情失败', error);
      Alert.alert('错误', '获取日流水详情失败');
    } finally {
      setDayDetailLoading(false);
    }
  }, [currentBook, fetchDayFlows]);

  useEffect(() => {
    const refreshListener = () => {
      fetchCalendarFlows().catch(err => {
        console.error('获取月度流水失败', err instanceof Error ? err.message : String(err));
      });
    };

    eventBus.addListener('refreshCalendarFlows', refreshListener);
    return () => {
      eventBus.removeAllListeners('refreshCalendarFlows');
    };
  }, []);
  // 当前账本变化时，重新获取数据
  useEffect(() => {
    let isMounted = true;

    // 只有当账本真正变化时才重置状态和获取数据
    if (currentBook) {
      // 重置状态，确保数据与当前账本匹配
      setDailyData({});
      setCalendarMarks({});
      setDayFlows([]);
      dailyDataRef.current = {};
      calendarMarksRef.current = {};

      // 使用 setTimeout 延迟执行，避免在同一渲染周期内多次更新状态
      const timer = setTimeout(() => {
        if (isMounted) {
          fetchCalendarFlows().catch(err => {
            if (isMounted) {
              console.error('获取月度流水失败', err instanceof Error ? err.message : String(err));
            }
          });
        }
      }, 0);

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }

    return () => { isMounted = false; };
  }, [currentBook]);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await AsyncStorage.getItem('auth_token');
      setHeaders({
        Authorization: token,
      });
    };
    fetchToken();
  }, []);

  // 修改 handleDayPress 函数，添加月份切换逻辑
  const handleDayPress = useCallback(async (day: any) => {
    // 检查是否点击了其他月份的日期
    const clickedMonth = moment(day.dateString).format('YYYY-MM');
    if (clickedMonth !== currentMonth) {
      // 如果点击了其他月份的日期，先切换月份
      setCurrentMonth(clickedMonth);
    }
    // 避免重复选择同一天
    if (selectedDate === day.dateString) {
      // 即使是同一天，也要获取流水详情，确保数据是最新的
      await fetchDayDetail(day.dateString);
      return;
    }
    // 创建新的标记对象，而不是直接修改现有对象
    const newMarks = {...calendarMarks};

    // 重置之前选中日期的样式
    if (newMarks[selectedDate]) {
      newMarks[selectedDate] = {
        ...newMarks[selectedDate],
        selected: false,
        customStyles: {
          container: {
            backgroundColor: '#ffffff',
          },
          text: {
            color: selectedDate === moment().format('YYYY-MM-DD') ? '#1976d2' : '#111111',
          },
        },
      };
    }

    // 设置新选中日期的样式
    if (newMarks[day.dateString]) {
      newMarks[day.dateString] = {
        ...newMarks[day.dateString],
        selected: true,
        customStyles: {
          container: {
            backgroundColor: '#1976d2',
          },
          text: {
            color: 'white',
          },
        },
      };
    } else {
      newMarks[day.dateString] = {
        selected: true,
        customStyles: {
          container: {
            backgroundColor: '#1976d2',
          },
          text: {
            color: 'white',
          },
        },
      };
    }

    // 更新状态
    setCalendarMarks(newMarks);
    setSelectedDate(day.dateString);

    // 获取选中日期的流水详情
    await fetchDayDetail(day.dateString);
  }, [selectedDate, calendarMarks, fetchDayDetail, currentMonth]);

  // 修改 handleMonthChange 函数，确保月份变化时更新数据
  const handleMonthChange = useCallback((month: any) => {
    const newMonth = moment(month.dateString).format('YYYY-MM');
    if (newMonth !== currentMonth) {
      setCurrentMonth(newMonth);

      // 可以选择在月份变化时重新获取数据
      // 但由于 useEffect 已经监听了 currentMonth 的变化，所以这里不需要额外调用
    }
  }, [currentMonth]);

  // 添加流水
  const handleAddFlow = useCallback(() => {
    navigation.navigate('FlowForm', { date: selectedDate });
  }, [navigation, selectedDate]);
  // 日卡片组件 - 使用 React.memo 避免不必要的重新渲染
  const DayCard = React.memo(({
    selectedDate,
  }: {
    selectedDate: string;
    dayFlows: Flow[];
    onAddFlow: () => void;
  }) => {
    // 获取当天的收支数据
    const dayTotals = dailyData[selectedDate] || { inSum: 0, outSum: 0, zeroSum: 0 };

    return (
      <Card containerStyle={styles.dayCard}>
        <View style={styles.dayCardContent}>
          <View style={styles.flowListHeader}>
            <Text style={styles.flowListTitle}>流水明细</Text>
            {/* 收支信息缩略展示 */}
            <View style={styles.flowSummary}>
              <Text style={styles.flowSummaryText}>
                {moment(selectedDate).format('MM-DD')} {' '}
                <Text style={{ color: '#4caf50' }}>收:{dayTotals.inSum.toFixed(0)}</Text>
                {' | '}
                <Text style={{ color: '#f44336' }}>支:{dayTotals.outSum.toFixed(0)}</Text>
                {' | '}
                <Text style={{ color: '#757575' }}>不计:{dayTotals.zeroSum.toFixed(0)}</Text>
              </Text>
            </View>

            <Button
              title=""
              type="clear"
              icon={
                <Icon
                  name="add"
                  type="material"
                  color="#1976d2"
                  size={20}
                />
              }
              onPress={() => {
                handleAddFlow();
              }}
            />
          </View>

          {dayDetailLoading ? (
            <ActivityIndicator size="large" color="#1976d2" style={{ marginTop: 20 }} />
          ) : (
            <SwipeListView
              data={dayFlows}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.flowItem}>
                  <View style={styles.flowItemHeader}>
                    <Text style={styles.flowItemName}>{item.name}</Text>
                    <Text
                      style={[
                        styles.flowItemMoney,
                        { color: item.flowType === '支出' ? '#f44336' : item.flowType === '收入' ? '#4caf50' : '#111111' },
                      ]}
                    >
                      {item.flowType === '支出' ? '-' : item.flowType === '收入' ? '+' : ''}
                      {item.money.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.flowItemType}>
                    {item.flowType} | {item.industryType} | {item.payType}
                  </Text>
                  <View style={styles.flowItemDescLine}>
                    <Text style={styles.flowItemDesc} numberOfLines={1}>
                      {item.description ? item.description : ''}
                    </Text>
                    {item.invoice ? (
                        <TouchableOpacity
                            style={styles.photoIcon}
                            onPress={() => viewInvoiceImages(item)}
                        >
                          <Icon name="photo" type="material" color="#4caf50" size={20} />
                        </TouchableOpacity>
                    ) : ''}
                  </View>

                </View>
              )}
              renderHiddenItem={({ item }) => (
                <View style={styles.rowBack}>
                  <TouchableOpacity
                      style={[styles.backRightBtn, styles.backCameraBtnLeft]}
                      onPress={() => handleInvoiceUpload(item)}
                  >
                    <Icon name="camera" type="material" color="white" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.backRightBtn, styles.backRightBtnLeft]}
                    onPress={() => {
                      navigation.navigate('FlowForm', { currentFlow: item });
                    }}
                  >
                    <Icon name="edit" type="material" color="white" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.backRightBtn, styles.backRightBtnRight]}
                    onPress={() => {
                      Alert.alert(
                        '确认删除',
                        '确定要删除这条流水记录吗？此操作不可恢复。',
                        [
                          { text: '取消', style: 'cancel' },
                          {
                            text: '删除',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                if (!currentBook) {return;}
                                await api.flow.delete(item.id, currentBook.bookId);
                                Alert.alert('成功', '流水已删除');
                                // 重新获取日期流水
                                fetchDayDetail(selectedDate);
                                // 刷新日历数据
                                fetchCalendarFlows();
                              } catch (error) {
                                console.error('删除流水失败', error);
                                Alert.alert('错误', '删除流水失败');
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Icon name="delete" type="material" color="white" size={20} />
                  </TouchableOpacity>
                </View>
              )}
              leftOpenValue={0}
              rightOpenValue={-150}
              previewRowKey={'0'}
              previewOpenValue={-40}
              previewOpenDelay={3000}
              disableRightSwipe
              style={styles.flowList}
              contentContainerStyle={styles.flowListContent}
            />
          )}
        </View>
      </Card>
    );
  }, (prevProps, nextProps) => {
    // 只有当这些属性变化时才重新渲染
    return (
      prevProps.selectedDate === nextProps.selectedDate &&
      prevProps.dayFlows.length === nextProps.dayFlows.length
    );
  });

  // 处理年月标题点击
  const handleMonthHeaderPress = useCallback(() => {
    // 设置初始选中的年月
    const yearMonth = currentMonth.split('-');
    setSelectedYear(parseInt(yearMonth[0]));
    setSelectedMonth(parseInt(yearMonth[1]));
    setShowYearMonthSelector(true);
  }, [currentMonth]);

  // 确认年月选择
  const confirmYearMonthSelection = useCallback(() => {
    const monthStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
    const newMonth = `${selectedYear}-${monthStr}`;
    setCurrentMonth(newMonth);
    setShowYearMonthSelector(false);
  }, [selectedYear, selectedMonth]);

  // 渲染年月选择器 - 使用滚动选择器
  const renderYearMonthSelector = () => (
    <Overlay
      isVisible={showYearMonthSelector}
      onBackdropPress={() => setShowYearMonthSelector(false)}
      overlayStyle={styles.yearMonthOverlay}
    >
      <View style={styles.yearMonthHeader}>
        <Text style={styles.yearMonthTitle}>选择年月</Text>
        <TouchableOpacity onPress={() => setShowYearMonthSelector(false)}>
          <Icon name="close" type="material" size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.yearMonthSelectorContainer}>
        {/* 年份选择 - 使用滚动选择器 */}
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>年份</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedYear}
              style={styles.picker}
              onValueChange={(itemValue: React.SetStateAction<number>) => setSelectedYear(itemValue)}
            >
              {Array.from({ length: 10 }, (_, i) => moment().year() - 9 + i).map(year => (
                <Picker.Item key={`year-${year}`} label={`${year}年`} value={year} />
              ))}
            </Picker>
          </View>
        </View>

        {/* 月份选择 - 使用滚动选择器 */}
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>月份</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedMonth}
              style={styles.picker}
              onValueChange={(itemValue: React.SetStateAction<number>) => setSelectedMonth(itemValue)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <Picker.Item key={`month-${month}`} label={`${month}月`} value={month} />
              ))}
            </Picker>
          </View>
        </View>

        {/* 确认按钮 */}
        <Button
          title="确认"
          buttonStyle={styles.confirmButton}
          onPress={confirmYearMonthSelection}
        />
      </View>
    </Overlay>
  );

  // 下拉刷新处理函数
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 使用当前最新的选中日期
      await fetchCalendarFlows();
    } catch (error) {
      console.error('刷新失败', error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  }, [fetchCalendarFlows]);

  // 自定义日期单元格渲染函数
  const renderCustomDay = useCallback((day: any, state: any) => {
    // 获取当天的收支数据
    const dayTotals = dailyData[day.dateString] || { inSum: 0, outSum: 0, zeroSum: 0 };
    const hasData = dayTotals.inSum > 0 || dayTotals.outSum > 0;

    // 检查是否是选中日期
    const isSelected = day.dateString === selectedDate;

    return (
      <View style={{
        alignItems: 'center',
        backgroundColor: isSelected ? '#1976d2' : 'transparent',
        borderRadius: 16,
        padding: 2,
        width: 32,
        height: 32,
        justifyContent: 'center',
      }}>
        {/* 日期数字 */}
        <Text
          style={{
            color: isSelected ? 'white' :
                  state === 'today' ? '#1976d2' :
                  state === 'disabled' ? '#949494' : '#111111',
            fontWeight: state === 'today' ? 'bold' : 'normal',
          }}
        >
          {day.day}
        </Text>

        {/* 收支信息 - 仅在非选中状态显示 */}
        {hasData && !isSelected && (
          <View style={styles.dayTotalsContainer}>
            {dayTotals.inSum > 0 && (
              <Text style={[styles.dayIncomeText, { color: '#4caf50' }]}>
                +{dayTotals.inSum.toFixed(0)}
              </Text>
            )}
            {dayTotals.outSum > 0 && (
              <Text style={[styles.dayExpenseText, { color: '#f44336' }]}>
                -{dayTotals.outSum.toFixed(0)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }, [selectedDate, dailyData]);

  // 修改切换筛选条件的函数，解决状态更新延迟问题
  const toggleCriteria = useCallback((key: string) => {
    // 创建新的筛选条件对象
    const newCriteria = {
      ...duplicateCriteria,
      [key]: !duplicateCriteria[key as keyof typeof duplicateCriteria],
    };

    // 先更新状态
    setDuplicateCriteria(newCriteria);

    // 使用新的筛选条件直接调用查询函数，而不是依赖状态更新
    setTimeout(() => {
      // 使用新的筛选条件对象，而不是依赖更新后的状态
      fetchDuplicateFlowsWithCriteria(newCriteria);
    }, 0);
  }, [duplicateCriteria]);

  // 添加一个新函数，接受筛选条件作为参数
  const fetchDuplicateFlowsWithCriteria = useCallback(async (criteria: typeof duplicateCriteria) => {
    if (!currentBook) {return;}
    try {
      setDuplicateLoading(true);

      const response = await api.flow.getDuplicateFlows({
        bookId: currentBook.bookId,
        criteria: criteria,
      });

      if (response.c === 200 && response.d) {
        setDuplicateGroups(response.d.duplicateGroups || []);
      } else {
        Alert.alert('错误', response.m || '获取重复数据失败');
      }
    } catch (error) {
      console.error('获取重复数据失败', error);
      Alert.alert('错误', '获取重复数据失败');
    } finally {
      setDuplicateLoading(false);
    }
  }, [currentBook]);

  // 修改原来的 fetchDuplicateFlows 函数，使用新函数
  const fetchDuplicateFlows = useCallback(async () => {
    await fetchDuplicateFlowsWithCriteria(duplicateCriteria);
  }, [fetchDuplicateFlowsWithCriteria, duplicateCriteria]);

  // 添加渲染重复数据弹窗的函数 - 优化为精简风格
  const renderDuplicateModal = () => {
    return (
      <Overlay
        isVisible={showDuplicateModal}
        onBackdropPress={() => setShowDuplicateModal(false)}
        overlayStyle={styles.duplicateOverlay}
      >
        <View style={styles.duplicateContainer}>
          <View style={styles.duplicateHeader}>
            <Text style={styles.duplicateTitle}>重复数据查询</Text>
            <Text style={styles.duplicateTitleComment}>日期和金额为默认条件</Text>
            <TouchableOpacity onPress={() => setShowDuplicateModal(false)}>
              <Icon name="close" type="material" size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.duplicateCriteria}>
            <View style={styles.duplicateCriteriaButtons}>
              <TouchableOpacity
                style={[
                  styles.criteriaButton,
                  duplicateCriteria.name && styles.criteriaButtonActive,
                ]}
                onPress={() => toggleCriteria('name')}
              >
                <Text style={[
                  styles.criteriaButtonText,
                  duplicateCriteria.name && styles.criteriaButtonTextActive,
                ]}>名称</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.criteriaButton,
                  duplicateCriteria.description && styles.criteriaButtonActive,
                ]}
                onPress={() => toggleCriteria('description')}
              >
                <Text style={[
                  styles.criteriaButtonText,
                  duplicateCriteria.description && styles.criteriaButtonTextActive,
                ]}>备注</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.criteriaButton,
                  duplicateCriteria.flowType && styles.criteriaButtonActive,
                ]}
                onPress={() => toggleCriteria('flowType')}
              >
                <Text style={[
                  styles.criteriaButtonText,
                  duplicateCriteria.flowType && styles.criteriaButtonTextActive,
                ]}>类型</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.criteriaButton,
                  duplicateCriteria.industryType && styles.criteriaButtonActive,
                ]}
                onPress={() => toggleCriteria('industryType')}
              >
                <Text style={[
                  styles.criteriaButtonText,
                  duplicateCriteria.industryType && styles.criteriaButtonTextActive,
                ]}>分类</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.criteriaButton,
                  duplicateCriteria.payType && styles.criteriaButtonActive,
                ]}
                onPress={() => toggleCriteria('payType')}
              >
                <Text style={[
                  styles.criteriaButtonText,
                  duplicateCriteria.payType && styles.criteriaButtonTextActive,
                ]}>支付方式</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 精简的内容区域 */}
          <ScrollView style={styles.duplicateContent}>
            {duplicateLoading ? (
              <ActivityIndicator size="large" color="#1976d2" style={{ marginTop: 20 }} />
            ) : duplicateGroups.length === 0 ? (
              <Text style={styles.duplicateEmptyText}>没有找到重复数据</Text>
            ) : (
              duplicateGroups.map((group, groupIndex) => (
                <View key={`group-${groupIndex}`} style={styles.duplicateGroup}>
                  <Text style={styles.duplicateGroupTitle}>重复组 {groupIndex + 1}</Text>

                  {group.map((flow: any, flowIndex: number) => (
                    <View key={`flow-${flow.id}`} style={styles.duplicateItem}>
                      {/* 精简的流水信息展示 */}
                      <View style={styles.duplicateItemHeader}>
                        <Text style={styles.duplicateItemTitle} numberOfLines={1}>
                          {flow.name || '无名称'}
                        </Text>
                        <Text style={[
                          styles.duplicateItemMoney,
                          {color: flow.flowType === '支出' ? '#f44336' : flow.flowType === '收入' ? '#4caf50' : '#111111'},
                        ]}>
                          {flow.flowType === '支出' ? '-' : flow.flowType === '收入' ? '+' : ''}
                          {flow.money.toFixed(2)}
                        </Text>

                        <TouchableOpacity
                          style={styles.duplicateItemDelete}
                          onPress={() => handleDeleteDuplicateFlow(flow)}
                        >
                          <Icon name="delete" type="material" color="#F44336" size={18} />
                        </TouchableOpacity>
                      </View>

                      {/* 精简的详细信息 */}
                      <View style={styles.duplicateItemCompactDetails}>
                        <Text style={styles.duplicateItemCompactDetail}>
                          <Text style={styles.duplicateItemCompactLabel}>日期:</Text> {flow.day}
                        </Text>
                        <Text style={styles.duplicateItemCompactDetail}>
                          <Text style={styles.duplicateItemCompactLabel}>类型:</Text> {flow.flowType}
                        </Text>
                        <Text style={styles.duplicateItemCompactDetail}>
                          <Text style={styles.duplicateItemCompactLabel}>分类:</Text> {flow.industryType}
                        </Text>
                        <Text style={styles.duplicateItemCompactDetail}>
                          <Text style={styles.duplicateItemCompactLabel}>支付:</Text> {flow.payType}
                        </Text>
                        {flow.description && (
                          <Text style={styles.duplicateItemCompactDetail} numberOfLines={1}>
                            <Text style={styles.duplicateItemCompactLabel}>备注:</Text> {flow.description}
                          </Text>
                        )}
                        {flow.attribution && (
                          <Text style={styles.duplicateItemCompactDetail}>
                            <Text style={styles.duplicateItemCompactLabel}>归属:</Text> {flow.attribution}
                          </Text>
                        )}
                      </View>

                      {flowIndex < group.length - 1 && (
                        <View style={styles.duplicateItemDivider} />
                      )}
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Overlay>
    );
  };

  // 添加删除流水的函数
  const handleDeleteDuplicateFlow = useCallback(async (flow: any) => {
    if (!currentBook) {return;}

    Alert.alert(
      '确认删除',
      `确定要删除这条流水记录吗？\n${flow.name} - ${flow.money}元`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.flow.delete(flow.id, currentBook.bookId);

              if (response.c === 200) {
                // 重新获取重复数据
                await fetchDuplicateFlows();
                // 刷新日历数据
                await fetchCalendarFlows();

                Alert.alert('成功', '流水已删除');
              } else {
                Alert.alert('错误', response.m || '删除流水失败');
              }
            } catch (error) {
              console.error('删除流水失败', error);
              Alert.alert('错误', '删除流水失败');
            }
          },
        },
      ]
    );
  }, [currentBook, fetchDuplicateFlows, fetchCalendarFlows]);

  // 获取平账候选数据
  const fetchBalanceCandidates = useCallback(async () => {
    if (!currentBook) {return;}
    try {
      setBalanceLoading(true);

      const response = await api.flow.getBalanceCandidates({
        bookId: currentBook.bookId,
      });

      if (response.c === 200 && response.d) {
        setBalanceCandidates(response.d || []);
      } else {
        Alert.alert('错误', response.m || '获取平账数据失败');
      }
    } catch (error) {
      console.error('获取平账数据失败', error);
      Alert.alert('错误', '获取平账数据失败');
    } finally {
      setBalanceLoading(false);
    }
  }, [currentBook]);

  // 处理平账确认
  const handleConfirmBalance = useCallback(async (outId: number, inIds: number[]) => {
    if (!currentBook || inIds.length === 0) {return;}

    try {
      const response = await api.flow.confirmBalance({
        outId,
        inIds,
        bookId: currentBook.bookId,
      });

      if (response.c === 200) {
        // 从候选列表中移除已确认的项
        setBalanceCandidates(prev => prev.filter(item => item.out.id !== outId));
        // 刷新日历数据
        fetchCalendarFlows();

        Alert.alert('成功', '平账成功');
      } else {
        Alert.alert('错误', response.m || '平账失败');
      }
    } catch (error) {
      console.error('平账失败', error);
      Alert.alert('错误', '平账失败');
    }
  }, [currentBook, fetchCalendarFlows]);

  // 处理忽略平账项
  const handleIgnoreBalanceItem = useCallback(async (id: number) => {
    if (!currentBook) {return;}

    Alert.alert(
      '确认忽略',
      '确定要忽略这条平账记录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '忽略',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.flow.ignoreBalanceItem({
                id,
                bookId: currentBook.bookId,
              });

              if (response.c === 200) {
                // 从候选列表中移除已忽略的项
                setBalanceCandidates(prev => {
                  return prev.filter(item => {
                    if (item.out.id === id) {return false;}
                    if (Array.isArray(item.in)) {
                      item.in = item.in.filter((inItem: { id: number; }) => inItem.id !== id);
                      return item.in.length > 0;
                    } else {
                      return item.in.id !== id;
                    }
                  });
                });

                Alert.alert('成功', '已忽略平账项');
              } else {
                Alert.alert('错误', response.m || '忽略平账项失败');
              }
            } catch (error) {
              console.error('忽略平账项失败', error);
              Alert.alert('错误', '忽略平账项失败');
            }
          },
        },
      ]
    );
  }, [currentBook]);

  // 处理忽略所有平账项
  const handleIgnoreAllBalanceItems = useCallback(async () => {
    if (!currentBook || balanceCandidates.length === 0) {return;}

    Alert.alert(
      '确认忽略全部',
      '确定要忽略所有平账记录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '忽略全部',
          style: 'destructive',
          onPress: async () => {
            try {
              // 收集所有ID
              const allIds: number[] = [];
              balanceCandidates.forEach(item => {
                if (item.out) {allIds.push(item.out.id);}
                if (Array.isArray(item.in)) {
                  item.in.forEach((inItem: { id: number; }) => allIds.push(inItem.id));
                } else if (item.in) {
                  allIds.push(item.in.id);
                }
              });

              const response = await api.flow.ignoreAllBalanceItems({
                bookId: currentBook.bookId,
                ids: allIds,
              });

              if (response.c === 200) {
                // 清空候选列表和选中状态
                setBalanceCandidates([]);
                Alert.alert('成功', `已忽略${response.d || 0}条平账记录`);
              } else {
                Alert.alert('错误', response.m || '忽略所有平账项失败');
              }
            } catch (error) {
              console.error('忽略所有平账项失败', error);
              Alert.alert('错误', '忽略所有平账项失败');
            }
          },
        },
      ]
    );
  }, [currentBook, balanceCandidates]);

  // 渲染平账弹窗 - 优化版本
  const renderBalanceModal = () => {
    return (
      <Overlay
        isVisible={showBalanceModal}
        onBackdropPress={() => setShowBalanceModal(false)}
        overlayStyle={styles.balanceOverlay}
      >
        <View style={styles.balanceContainer}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceTitle}>平账管理</Text>

            {balanceCandidates.length > 0 && (
              <TouchableOpacity
                style={styles.balanceIgnoreAllButton}
                onPress={handleIgnoreAllBalanceItems}
              >
                <Text style={styles.balanceIgnoreAllText}>忽略全部</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setShowBalanceModal(false)}>
              <Icon name="close" type="material" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.balanceContent}>
            {balanceLoading ? (
              <ActivityIndicator size="large" color="#1976d2" style={{ marginTop: 20 }} />
            ) : balanceCandidates.length === 0 ? (
              <Text style={styles.balanceEmptyText}>没有找到需要平账的记录</Text>
            ) : (
              balanceCandidates.map((item, index) => (
                <View key={`balance-${index}`} style={styles.balanceGroup}>
                  {/* 支出项 */}
                  <View style={styles.balanceOutItem}>
                    <View style={styles.duplicateItemHeader}>
                      <Text style={styles.duplicateItemTitle} numberOfLines={1}>
                        {item.out.name || '无名称'}
                      </Text>
                      <Text style={[
                        styles.duplicateItemMoney,
                        {color: '#f44336'},
                      ]}>
                        -{item.out.money.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.duplicateItemCompactDetails}>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>日期:</Text> {item.out.day}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>类型:</Text> {item.out.flowType}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>分类:</Text> {item.out.industryType}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>支付:</Text> {item.out.payType}
                      </Text>
                      {item.out.description && (
                        <Text style={styles.duplicateItemCompactDetail} numberOfLines={1}>
                          <Text style={styles.duplicateItemCompactLabel}>备注:</Text> {item.out.description}
                        </Text>
                      )}
                      {item.out.attribution && (
                          <Text style={styles.duplicateItemCompactDetail}>
                            <Text style={styles.duplicateItemCompactLabel}>归属:</Text> {item.out.attribution}
                          </Text>
                      )}
                    </View>
                  </View>

                  {/* 收入项 */}
                  <View style={styles.balanceInItem}>
                    <View style={styles.duplicateItemHeader}>
                      <Text style={styles.duplicateItemTitle} numberOfLines={1}>
                        {item.in.name || '无名称'}
                      </Text>
                      <Text style={[
                        styles.duplicateItemMoney,
                        {color: item.in.flowType === '收入' ? '#4caf50' : '#757575'},
                      ]}>
                        {item.in.flowType === '收入' ? '+' : ''}
                        {item.in.money.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.duplicateItemCompactDetails}>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>日期:</Text> {item.in.day}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>类型:</Text> {item.in.flowType}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>分类:</Text> {item.in.industryType}
                      </Text>
                      <Text style={styles.duplicateItemCompactDetail}>
                        <Text style={styles.duplicateItemCompactLabel}>支付:</Text> {item.in.payType}
                      </Text>
                      {item.in.description && (
                        <Text style={styles.duplicateItemCompactDetail} numberOfLines={1}>
                          <Text style={styles.duplicateItemCompactLabel}>备注:</Text> {item.in.description}
                        </Text>
                      )}
                      {item.in.attribution && (
                          <Text style={styles.duplicateItemCompactDetail}>
                            <Text style={styles.duplicateItemCompactLabel}>归属:</Text> {item.in.attribution}
                          </Text>
                      )}
                    </View>
                  </View>

                  {/* 按钮区域 */}
                  <View style={styles.balanceActionContainer}>
                    <TouchableOpacity
                        style={styles.balanceIgnoreButton}
                        onPress={() => handleIgnoreBalanceItem(item.out.id)}
                    >
                      <Text style={styles.balanceIgnoreText}>忽略</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.balanceConfirmButton}
                        onPress={() => handleConfirmBalance(item.out.id, [item.in.id])}
                    >
                      <Text style={styles.balanceConfirmText}>平账</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Overlay>
    );
  };

  // 处理小票上传
  const handleInvoiceUpload = async (flow: Flow) => {
    if (!currentBook) {return;}

    setSelectedFlow(flow);

    Alert.alert(
      '选择图片来源',
      '请选择小票图片来源',
      [
        {
          text: '相机',
          onPress: () => launchCamera(flow),
        },
        {
          text: '相册',
          onPress: () => launchImageLibrary(flow),
        },
        {
          text: '取消',
          style: 'cancel',
          onPress: () => {
            // 关闭滑动选项
            swipeableRefs.current[flow.id]?.close();
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 启动相机
  const launchCamera = async (flow: Flow) => {
    try {
      const result = await ImagePicker.launchCamera({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      if (result.assets && result.assets.length > 0) {
        uploadImage(flow, result.assets[0]);
      } else {
        // 关闭滑动选项
        swipeableRefs.current[flow.id]?.close();
      }
    } catch (error) {
      console.error('相机启动失败', error);
      Alert.alert('错误', '无法启动相机');
      // 关闭滑动选项
      swipeableRefs.current[flow.id]?.close();
    }
  };

  // 启动图片库
  const launchImageLibrary = async (flow: Flow) => {
    try {
      const result = await ImagePicker.launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      if (result.assets && result.assets.length > 0) {
        uploadImage(flow, result.assets[0]);
      } else {
        // 关闭滑动选项
        swipeableRefs.current[flow.id]?.close();
      }
    } catch (error) {
      console.error('图片库启动失败', error);
      Alert.alert('错误', '无法打开图片库');
      // 关闭滑动选项
      swipeableRefs.current[flow.id]?.close();
    }
  };

  // 上传图片
  const uploadImage = async (flow: Flow, image: ImagePicker.Asset) => {
    if (!currentBook) {return;}

    try {
      const response = await api.flow.uploadInvoice(flow.id, currentBook.bookId, image);

      if (response.c === 200) {
        Alert.alert('成功', '小票上传成功');
        // 刷新数据
        fetchCalendarFlows();
      } else {
        Alert.alert('错误', response.m || '小票上传失败');
      }
    } catch (error) {
      console.error('小票上传失败', error);
      Alert.alert('错误', '小票上传失败');
    } finally {
      // 关闭滑动选项
      swipeableRefs.current[flow.id]?.close();
    }
  };

  // 查看小票图片
  const viewInvoiceImages = (flow: Flow) => {
    if (!flow.invoice) {
      Alert.alert('提示', '该流水没有小票图片');
      return;
    }

    const invoices = flow.invoice.split(',');
    setSelectedInvoices(invoices);
    setSelectedInvoiceIndex(0);
    setSelectedFlow(flow);
    setViewingInvoice(true);
  };

  // 删除当前查看的小票
  const deleteCurrentInvoice = async () => {
    if (!selectedFlow || !currentBook || selectedInvoices.length === 0) {return;}

    const currentInvoice = selectedInvoices[selectedInvoiceIndex];

    Alert.alert(
      '确认删除',
      '确定要删除这张小票图片吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.flow.deleteInvoice(
                selectedFlow.id,
                currentBook.bookId,
                currentInvoice
              );

              if (response.c === 200) {
                // 从列表中移除已删除的图片
                const updatedInvoices = selectedInvoices.filter((_, index) => index !== selectedInvoiceIndex);
                setSelectedInvoices(updatedInvoices);

                if (updatedInvoices.length === 0) {
                  // 如果没有图片了，关闭查看器
                  setViewingInvoice(false);
                } else {
                  // 调整当前查看的索引
                  setSelectedInvoiceIndex(Math.min(selectedInvoiceIndex, updatedInvoices.length - 1));
                }

                Alert.alert('成功', '小票已删除');
                // 刷新数据
                fetchCalendarFlows();
              } else {
                Alert.alert('错误', response.m || '小票删除失败');
              }
            } catch (error) {
              console.error('小票删除失败', error);
              Alert.alert('错误', '小票删除失败');
            } finally {
            }
          },
        },
      ]
    );
  };

  // 渲染小票图片查看器
  const renderInvoiceViewer = () => (
    <Overlay
      isVisible={viewingInvoice && selectedInvoices.length > 0}
      onBackdropPress={() => setViewingInvoice(false)}
      overlayStyle={styles.invoiceViewerOverlay}
    >
      <View style={styles.invoiceViewerContainer}>
        <Image
          source={{
            uri: selectedInvoices[selectedInvoiceIndex]
              ? api.flow.getInvoiceUrl(selectedInvoices[selectedInvoiceIndex])
              : undefined,
            headers: headers,
          }}
          style={styles.fullImage}
          resizeMode="contain"
        />

        {/* 指示器和页码 */}
        {selectedInvoices.length > 1 && (
          <View style={styles.paginationContainer}>
            {selectedInvoices.map((_, index) => (
              <View
                key={`dot-${index}`}
                style={[
                  styles.paginationDot,
                  index === selectedInvoiceIndex && styles.paginationDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* 控制按钮 */}
        <View style={styles.invoiceViewerControls}>
          {/* 关闭按钮 */}
          <TouchableOpacity
            style={styles.invoiceControlButton}
            onPress={() => setViewingInvoice(false)}
          >
            <Icon name="close" type="material" color="white" size={24} />
          </TouchableOpacity>

          {/* 左右翻页按钮 */}
          {selectedInvoices.length > 1 && (
            <View style={styles.navigationButtons}>
              <TouchableOpacity
                style={[
                  styles.invoiceControlButton,
                  selectedInvoiceIndex === 0 && styles.disabledButton,
                ]}
                onPress={() => {
                  if (selectedInvoiceIndex > 0) {
                    setSelectedInvoiceIndex(selectedInvoiceIndex - 1);
                  }
                }}
                disabled={selectedInvoiceIndex === 0}
              >
                <Icon name="chevron-left" type="material" color="white" size={28} />
              </TouchableOpacity>

              <Text style={styles.pageIndicator}>
                {selectedInvoiceIndex + 1}/{selectedInvoices.length}
              </Text>

              <TouchableOpacity
                style={[
                  styles.invoiceControlButton,
                  selectedInvoiceIndex === selectedInvoices.length - 1 && styles.disabledButton,
                ]}
                onPress={() => {
                  if (selectedInvoiceIndex < selectedInvoices.length - 1) {
                    setSelectedInvoiceIndex(selectedInvoiceIndex + 1);
                  }
                }}
                disabled={selectedInvoiceIndex === selectedInvoices.length - 1}
              >
                <Icon name="chevron-right" type="material" color="white" size={28} />
              </TouchableOpacity>
            </View>
          )}

          {/* 删除按钮 */}
          <TouchableOpacity
            style={[styles.invoiceControlButton, styles.deleteButton]}
            onPress={deleteCurrentInvoice}
          >
            <Icon name="delete" type="material" color="white" size={24} />
          </TouchableOpacity>
        </View>
      </View>
    </Overlay>
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
    <View style={styles.container}>
      <BookSelector />

      <View style={styles.headerActions}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setShowBalanceModal(true);
            fetchBalanceCandidates();
          }}
        >
          <Icon name="account-balance" type="material" color="#1976d2" size={16} />
          <Text style={styles.actionButtonText}>平账</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setShowDuplicateModal(true);
            fetchDuplicateFlows();
          }}
        >
          <Icon name="filter-alt" type="material" color="#1976d2" size={16} />
          <Text style={styles.actionButtonText}>去重</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1976d2']}
            tintColor="#1976d2"
          />
        }
      >
        <Card containerStyle={styles.calendarCard}>
          <Calendar
              current={currentMonth}
              key={currentMonth}
              onDayPress={(day) => {
                handleDayPress(day);
              }}
              onMonthChange={handleMonthChange}
              markingType="custom"
              markedDates={calendarMarks}
              theme={{
                todayTextColor: '#1976d2',
                arrowColor: '#1976d2',
                monthTextColor: '#1976d2',
                selectedDayBackgroundColor: '#1976d2',
                selectedDayTextColor: 'white',
              }}
              monthFormat={'yyyy年 MM月'}
              renderHeader={(date) => (
                  <TouchableOpacity onPress={handleMonthHeaderPress} style={styles.calendarHeader}>
                    <Text style={styles.calendarHeaderText}>
                      {currentMonth ? `${currentMonth.split('-')[0]}年${currentMonth.split('-')[1]}月` : moment(date).format('YYYY年 MM月')}
                    </Text>
                    <Icon name="arrow-drop-down" type="material" size={24} color="#1976d2" />
                  </TouchableOpacity>
              )}
              dayComponent={({ date, state }) => (
                <TouchableOpacity
                  onPress={() => {
                    handleDayPress(date);
                  }}
                >
                  {renderCustomDay(date, state)}
                </TouchableOpacity>
              )}
          />

          {/* 将月度汇总直接放在日历卡片内部 */}
          <View style={styles.monthSummaryContent}>
            <View style={styles.monthSummaryRow}>
              <View style={styles.monthSummaryItem}>
                <Text style={styles.monthSummaryLabel}>总收入</Text>
                <Text style={[styles.monthSummaryValue, { color: '#4caf50' }]}>
                  {/* 计算总收入 */}
                  {Object.entries(dailyData)
                      .filter(([date]) => date.startsWith(currentMonth))
                      .reduce((sum, [, data]) => sum + (data.inSum || 0), 0)
                      .toFixed(2)}
                </Text>
              </View>

              <View style={styles.monthSummaryItem}>
                <Text style={styles.monthSummaryLabel}>总支出</Text>
                <Text style={[styles.monthSummaryValue, { color: '#f44336' }]}>
                  {/* 计算总支出 */}
                  {Object.entries(dailyData)
                      .filter(([date]) => date.startsWith(currentMonth))
                      .reduce((sum, [, data]) => sum + (data.outSum || 0), 0)
                      .toFixed(2)}
                </Text>
              </View>

              <View style={styles.monthSummaryItem}>
                <Text style={styles.monthSummaryLabel}>不计收支</Text>
                <Text style={[styles.monthSummaryValue, { color: '#070707' }]}>
                  {/* 计算不计收支 */}
                  {Object.entries(dailyData)
                      .filter(([date]) => date.startsWith(currentMonth))
                      .reduce((sum, [, data]) => sum + (data.zeroSum || 0), 0)
                      .toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </ScrollView>
      <DayCard
          selectedDate={dayCardData.selectedDate}
          dayFlows={dayCardData.dayFlows}
          onAddFlow={handleAddFlow}
      />
      {renderYearMonthSelector()}
      {renderDuplicateModal()}
      {renderBalanceModal()}
      {renderInvoiceViewer()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    padding: 0,
    margin: 0,
    flexGrow: 0,
  },
  bookSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'white',
    elevation: 2,
  },
  bookName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  calendarCard: {
    marginTop: 0,
    margin: 10,
    padding: 0,
    borderRadius: 10,
    borderBottomWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    marginBottom: 0,
  },
  dayCard: {
    marginTop: 5,
    margin: 10,
    borderRadius: 10,
  },
  dayCardContent: {
    marginTop: 0,
  },
  dayCardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  dayCardItem: {
    alignItems: 'center',
  },
  dayCardLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 0,
  },
  dayCardValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dayCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCardButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  emptyCard: {
    marginTop: 5,
    margin: 10,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: 10,
    color: '#757575',
  },
  emptyButton: {
    marginTop: 15,
    width: '100%',
  },
  loader: {
    marginTop: 50,
  },
  divider: {
    marginVertical: 10,
  },
  flowListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  flowListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 0.3,
  },
  flowList: {
    maxHeight: 300,
  },
  flowListContent: {
    paddingBottom: 10,
  },
  flowItem: {
    padding: 8,
    backgroundColor: 'white',
  },
  flowItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  flowItemDescLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flowItemName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  flowItemMoney: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  flowItemType: {
    fontSize: 11,
    color: '#757575',
    marginBottom: 2,
  },
  flowItemDesc: {
    fontSize: 11,
    color: '#9e9e9e',
    maxWidth: '80%',
  },
  photoIcon: {
    width: 50,
  },
  itemDivider: {
    marginVertical: 5,
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
  },
  monthSummaryContent: {
    marginTop: 5,
    backgroundColor: 'white',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  monthSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  monthSummaryLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 3,
  },
  monthSummaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  calendarHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  yearMonthOverlay: {
    width: '90%',
    borderRadius: 10,
    padding: 15,
  },
  yearMonthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  yearMonthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  yearMonthSelectorContainer: {
    width: '100%',
  },
  pickerContainer: {
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 5,
    backgroundColor: '#f5f5f5',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
    borderRadius: 5,
    marginTop: 10,
  },
  rowBack: {
    alignItems: 'center',
    backgroundColor: 'white',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 15,
    height: '100%',
  },
  backRightBtn: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 50,
  },
  backRightBtnLeft: {
    backgroundColor: '#2196F3',
    right: 50,
  },
  backCameraBtnLeft: {
    backgroundColor: '#2db300',
    right: 100,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  backRightBtnRight: {
    backgroundColor: '#F44336',
    right: 0,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  dayTotalsContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 2,
  },
  dayIncomeText: {
    fontSize: 9,
    color: '#4caf50',
    fontWeight: '500',
  },
  dayExpenseText: {
    fontSize: 9,
    color: '#f44336',
    fontWeight: '500',
  },
  flowSummary: {
    flex: 1,
    alignItems: 'center',
  },
  flowSummaryText: {
    fontSize: 12,
    color: '#757575',
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#1976d2',
    marginLeft: 4,
  },
  duplicateOverlay: {
    maxWidth: '85%',
    maxHeight: '75%',
    borderRadius: 10,
    padding: 0,
    overflow: 'hidden',
  },

  duplicateContainer: {
    flex: 1,
    width: '100%',
  },
  duplicateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  duplicateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  duplicateCriteria: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  duplicateCriteriaTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  duplicateCriteriaButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 0,
  },
  criteriaButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
    backgroundColor: '#f5f5f5',
  },
  criteriaButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  criteriaButtonText: {
    fontSize: 12,
    color: '#757575',
  },
  criteriaButtonTextActive: {
    color: '#ffffff',
  },
  duplicateContent: {
    flex: 1,
    padding: 10,
  },
  duplicateEmptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#757575',
  },
  duplicateGroup: {
    marginBottom: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
  },
  duplicateGroupTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1976d2',
  },
  duplicateItem: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  duplicateItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duplicateItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  duplicateItemMoney: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  duplicateItemDelete: {
    marginLeft: 8,
    padding: 4,
  },
  duplicateItemCompactDetails: {
    marginTop: 5,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  duplicateItemCompactDetail: {
    fontSize: 12,
    color: '#757575',
    marginRight: 8,
    marginBottom: 2,
  },
  duplicateTitleComment: {
    fontSize: 12,
    color: '#757575',
    marginRight: 20,
    marginTop: 5,
  },
  duplicateItemCompactLabel: {
    fontWeight: 'bold',
    color: '#424242',
  },
  duplicateItemDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 6,
  },
  // 平账弹窗样式
  balanceOverlay: {
    maxWidth: '85%',
    maxHeight: '75%',
    borderRadius: 10,
    padding: 0,
    overflow: 'hidden',
  },
  balanceContainer: {
    flex: 1,
    width: '100%',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  balanceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  balanceIgnoreAllButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 120,
  },
  balanceIgnoreAllText: {
    fontSize: 12,
    color: '#757575',
  },
  balanceContent: {
    flex: 1,
    minWidth:'100%',
    padding: 10,
  },
  balanceEmptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#757575',
  },
  balanceGroup: {
    marginBottom: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
  },
  balanceOutItem: {
    backgroundColor: '#fff8f8',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#f44336',
  },
  balanceInItem: {
    backgroundColor: '#f8fff8',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  balanceActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  balanceIgnoreButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  balanceIgnoreText: {
    fontSize: 12,
    color: '#757575',
  },
  balanceConfirmButton: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  balanceConfirmText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: 'bold',
  },
  leftSwipeActions: {
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
  },
  uploadInvoiceButton: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    width: '100%',
  },
  swipeActionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  flowRightContainer: {
    alignItems: 'flex-end',
  },
  flowActions: {
    flexDirection: 'row',
    marginTop: 5,
  },
  invoiceButton: {
    padding: 5,
    marginLeft: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 4,
  },
  invoiceViewerOverlay: {
    width: '90%',
    height: '70%',
    padding: 0,
    borderRadius: 10,
    overflow: 'hidden',
  },
  invoiceViewerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  fullImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  invoiceViewerControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  invoiceControlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.7)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  navigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageIndicator: {
    color: 'white',
    marginHorizontal: 10,
    fontSize: 16,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: 'white',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    color: '#1976d2',
    fontSize: 16,
  },
});

export default CalendarScreen;

﻿import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  ScrollView
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Text, Card, Button, Icon, Divider, Overlay } from '@rneui/themed';
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
import {DayState} from "react-native-calendars/src/types";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

// 配置中文日历
LocaleConfig.locales['zh'] = {
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

  // 使用 useRef 存储状态
  const dailyDataRef = useRef<DailyData>({});
  const calendarMarksRef = useRef<CalendarMark>({});

  // 使用 useMemo 缓存卡片数据
  const dayCardData = useMemo(() => ({
    selectedDate,
    dailyData,
    dayFlows
  }), [selectedDate, dailyData, dayFlows]);

  // 获取日历数据
  const fetchCalendarFlows = useCallback(async () => {
    if (!currentBook || !currentMonth) return;

    try {
      // 获取日历数据
      const { dailyData, calendarMarks } = await fetchCalendarData();

      // 更新日历数据引用，但不触发重新渲染
      dailyDataRef.current = dailyData;

      // 只有在初始加载或账本切换时才更新日历标记
      if (Object.keys(calendarMarksRef.current).length === 0) {
        // 保留当前选中日期的样式
        const updatedMarks = { ...calendarMarks };
        calendarMarksRef.current = updatedMarks;
        setCalendarMarks(updatedMarks);
      }
      // 始终更新下方卡片数据
      setDailyData(dailyData);
    } catch (error) {
      console.error('获取流水失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取流水失败');
    }
  }, [currentBook, selectedDate, fetchCalendarData]);

  // 获取某天的流水详情
  const fetchDayDetail = useCallback(async (date: string) => {
    if (!currentBook) return;

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

  // 处理日期选择 - 只更新下方卡片，不刷新日历
  const handleDayPress = useCallback((day: any) => {
    // 避免重复选择同一天
    if (selectedDate === day.dateString) return;
    if (calendarMarks[selectedDate]) {
      calendarMarks[selectedDate].customStyles = {
        container: {
          backgroundColor: '#ffffff',
        },
        text: {
          color: selectedDate === moment().format('YYYY-MM-DD') ? '#1976d2' : '#111111',
        },
      };
    }
    if (calendarMarks[day.dateString]) {
      calendarMarks[day.dateString].customStyles = {
        container: {
          backgroundColor: '#1976d2',
        },
        text: {
          color: 'white',
        },
      };
    } else {
      calendarMarks[day.dateString] = {
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
    setSelectedDate(day.dateString);
  }, [selectedDate]);

  // 处理月份变化
  const handleMonthChange = useCallback((month: any) => {
    setCurrentMonth(moment(month.dateString).format('YYYY-MM'));
  }, []);

  // 查看日详情
  const handleViewDayDetail = useCallback(async () => {
    await fetchDayDetail(selectedDate);
  }, [fetchDayDetail, selectedDate]);

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
    return (
      <Card containerStyle={styles.dayCard}>
        <View style={styles.dayCardContent}>
          <View style={styles.flowListHeader}>
            <Text style={styles.flowListTitle}>流水明细</Text>
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
                        <Text style={styles.flowItemDesc} numberOfLines={1}>
                          {item.description ? item.description : ''}
                        </Text>
                      </View>
                  )}
                  renderHiddenItem={({ item }) => (
                      <View style={styles.rowBack}>
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
                                          if (!currentBook) return;
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
                                      }
                                    }
                                  ]
                              );
                            }}
                        >
                          <Icon name="delete" type="material" color="white" size={20} />
                        </TouchableOpacity>
                      </View>
                  )}
                  leftOpenValue={0}
                  rightOpenValue={-140}
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
      await fetchCalendarFlows().catch(err => {
        console.error('获取月度流水失败', err instanceof Error ? err.message : String(err));
      });
    } finally {
      setRefreshing(false);
    }
  }, [fetchCalendarFlows]);

  // 自定义日期单元格渲染函数
  const renderCustomDay = (day: any, state: DayState | undefined) => {
    // 获取当天的收支数据
    const dayTotals = dailyData[day.dateString] || { income: 0, expense: 0 };
    const hasData = dayTotals.inSum > 0 || dayTotals.outSum > 0;

    return (
      <View style={{ alignItems: 'center' }}>
        {/* 日期数字 */}
        <Text
          style={{
            color: state === 'today' ? '#1976d2' : day.dateString === selectedDate ? 'white' : state === 'disabled' ? '#949494' : '#111111',
            fontWeight: day.dateString === moment().format('YYYY-MM-DD') ? 'bold' : 'normal'
          }}
        >
          {day.day}
        </Text>

        {/* 收支信息 */}
        {hasData && (
          <View style={styles.dayTotalsContainer}>
            {dayTotals.inSum > 0 && (
              <Text style={styles.dayIncomeText}>
                +{dayTotals.inSum.toFixed(0)}
              </Text>
            )}
            {dayTotals.outSum > 0 && (
              <Text style={styles.dayExpenseText}>
                -{dayTotals.outSum.toFixed(0)}
              </Text>
            )}
          </View>
        )}
      </View>
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
      <ScrollView
                  style={styles.scrollView}
                  refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#1976d2']}
                        tintColor="#1976d2"
                    />
                  }>
        <Card containerStyle={styles.calendarCard}>
          <Calendar
              current={currentMonth}
              key={currentMonth}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
              markingType="custom"
              markedDates={{
                ...calendarMarks,
                [selectedDate]: {
                  ...(calendarMarks[selectedDate] || {}),
                  selected: true,
                  customStyles: {
                    container: {
                      backgroundColor: '#1976d2',
                    },
                    text: {
                      color: 'white',
                    },
                  },
                },
              }}
              theme={{
                todayTextColor: '#1976d2',
                arrowColor: '#1976d2',
                monthTextColor: '#1976d2',
                selectedDayBackgroundColor: '#1976d2',
                selectedDayTextColor: 'white',
              }}
              monthFormat={'yyyy年 MM月'}
              // 添加自定义标题组件
              renderHeader={(date) => (
                  <TouchableOpacity onPress={handleMonthHeaderPress} style={styles.calendarHeader}>
                    <Text style={styles.calendarHeaderText}>
                      {currentMonth ? `${currentMonth.split('-')[0]}年${currentMonth.split('-')[1]}月` : moment(date).format('YYYY年 MM月')}
                    </Text>
                    <Icon name="arrow-drop-down" type="material" size={24} color="#1976d2" />
                  </TouchableOpacity>
              )}
              dayComponent={({ date, state }) => renderCustomDay(date, state)}
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
  },
  itemDivider: {
    marginVertical: 5,
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
  },
  monthSummaryCard: {
    margin: 10,
    marginTop: 0,
    borderRadius: 0,
    padding: 0,
    borderTopWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: 'transparent',
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
  calendarContainer: {
    position: 'relative',
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
  refreshIndicator: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
  },
  refreshTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
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
  swipeableContainer: {
    backgroundColor: 'transparent',
  },
  swipeableChildrenContainer: {
    backgroundColor: 'white',
  },
  swipeableActions: {
    flexDirection: 'row',
    width: 140,
    height: '100%',
  },
  swipeableAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAction: {
    backgroundColor: '#2196F3',
  },
  deleteAction: {
    backgroundColor: '#F44336',
  },
  swipeableActionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
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
    width: 70,
  },
  backRightBtnLeft: {
    backgroundColor: '#2196F3',
    right: 70,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  backRightBtnRight: {
    backgroundColor: '#F44336',
    right: 0,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  backTextWhite: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 4,
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
});

export default CalendarScreen;

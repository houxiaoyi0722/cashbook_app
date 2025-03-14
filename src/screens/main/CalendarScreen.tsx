import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { Text, Card, Button, Icon, FAB, Divider, Overlay } from '@rneui/themed';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useBookkeeping } from '../../context/BookkeepingContext';
import BookSelector from '../../components/BookSelector';
import { Flow, DailyData, CalendarMark } from '../../types';

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
  const [currentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dailyData, setDailyData] = useState<DailyData>({});
  const [calendarMarks, setCalendarMarks] = useState<CalendarMark>({});
  const [dayFlows, setDayFlows] = useState<Flow[]>([]);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);

  // 使用 useRef 存储状态
  const dailyDataRef = useRef<DailyData>({});
  const calendarMarksRef = useRef<CalendarMark>({});

  // 使用 useMemo 缓存卡片数据
  const dayCardData = useMemo(() => ({
    selectedDate,
    dailyData,
    dayFlows
  }), [selectedDate, dailyData, dayFlows]);

  // 获取日流水数据
  const fetchCalendarFlows = useCallback(async () => {
    if (!currentBook) return;

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
      console.error('获取月度流水失败', error instanceof Error ? error.message : String(error));
      Alert.alert('错误', '获取月度流水失败');
    }
  }, [currentBook, currentMonth, selectedDate, fetchCalendarData]);

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
          color: 'black',
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

  // 查看日详情
  const handleViewDayDetail = useCallback(async () => {
    await fetchDayDetail(selectedDate);
    setShowDayDetail(true);
  }, [fetchDayDetail, selectedDate]);

  // 添加流水
  const handleAddFlow = useCallback(() => {
    navigation.navigate('FlowForm', { date: selectedDate });
  }, [navigation, selectedDate]);

  // 查看流水详情
  const handleViewFlowDetail = useCallback((flow: Flow) => {
    setShowDayDetail(false);
    navigation.navigate('FlowDetail', { currentFlow: flow });
  }, [navigation]);

  // 渲染日详情项
  const renderDayFlowItem = useCallback(({ item }: { item: Flow }) => (
    <TouchableOpacity
      style={styles.flowItem}
      onPress={() => handleViewFlowDetail(item)}
    >
      <View style={styles.flowItemHeader}>
        <Text style={styles.flowItemName}>{item.name}</Text>
        <Text
          style={[
            styles.flowItemMoney,
            { color: item.flowType === '支出' ? '#f44336' : '#4caf50' },
          ]}
        >
          {item.flowType === '支出' ? '-' : '+'}
          {item.money.toFixed(2)}
        </Text>
      </View>
      <Text style={styles.flowItemType}>
        {item.flowType} | {item.industryType} | {item.payType}
      </Text>
      {item.description && (
        <Text style={styles.flowItemDesc} numberOfLines={1}>
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  ), [handleViewFlowDetail]);

  // 渲染日详情
  const renderDayDetail = useCallback(() => (
    <Overlay
      isVisible={showDayDetail}
      onBackdropPress={() => setShowDayDetail(false)}
      overlayStyle={styles.overlay}
    >
      <View style={styles.overlayHeader}>
        <Text h4>{selectedDate}</Text>
        <TouchableOpacity onPress={() => setShowDayDetail(false)}>
          <Icon
            name="close"
            type="material"
            size={24}
            color="#757575"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.daySummary}>
        <View style={styles.daySummaryItem}>
          <Text style={styles.daySummaryLabel}>收入</Text>
          <Text style={[styles.daySummaryValue, { color: '#4caf50' }]}>
            {dailyData[selectedDate]?.inSum.toFixed(2) || '0.00'}
          </Text>
        </View>
        <View style={styles.daySummaryItem}>
          <Text style={styles.daySummaryLabel}>支出</Text>
          <Text style={[styles.daySummaryValue, { color: '#f44336' }]}>
            {dailyData[selectedDate]?.outSum.toFixed(2) || '0.00'}
          </Text>
        </View>
        <View style={styles.daySummaryItem}>
          <Text style={styles.daySummaryLabel}>不计收支</Text>
          <Text style={styles.daySummaryValue}>
            {dailyData[selectedDate]?.zeroSum.toFixed(2) || '0.00'}
          </Text>
        </View>
      </View>

      <Divider style={styles.divider} />

      <View style={styles.flowListHeader}>
        <Text style={styles.flowListTitle}>流水明细</Text>
        <Button
          title="添加"
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
            setShowDayDetail(false);
            handleAddFlow();
          }}
        />
      </View>

      {dayDetailLoading ? (
        <ActivityIndicator size="large" color="#1976d2" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={dayFlows}
          renderItem={renderDayFlowItem}
          keyExtractor={(item) => item.id.toString()}
          style={styles.flowList}
          ItemSeparatorComponent={() => <Divider style={styles.itemDivider} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyList}>
              <Text>暂无流水记录</Text>
            </View>
          )}
        />
      )}
    </Overlay>
  ), [showDayDetail, selectedDate, dailyData, dayDetailLoading, dayFlows, renderDayFlowItem, handleAddFlow]);

  // 日卡片组件 - 使用 React.memo 避免不必要的重新渲染
  const DayCard = React.memo(({
    selectedDate,
    dailyData,
    onViewDetail,
    onAddFlow
  }: {
    selectedDate: string;
    dailyData: DailyData;
    dayFlows: Flow[];
    onViewDetail: () => void;
    onAddFlow: () => void;
  }) => {
    return (
      <Card containerStyle={styles.dayCard}>
        <Card.Title>{selectedDate}</Card.Title>

        <View style={styles.dayCardContent}>
          <View style={styles.dayCardSummary}>
            <View style={styles.dayCardItem}>
              <Text style={styles.dayCardLabel}>收入</Text>
              <Text style={[styles.dayCardValue, { color: '#4caf50' }]}>
                {dailyData[selectedDate]?.inSum.toFixed(2) || '0.00'}
              </Text>
            </View>

            <View style={styles.dayCardItem}>
              <Text style={styles.dayCardLabel}>支出</Text>
              <Text style={[styles.dayCardValue, { color: '#f44336' }]}>
                {dailyData[selectedDate]?.outSum.toFixed(2) || '0.00'}
              </Text>
            </View>

            <View style={styles.dayCardItem}>
              <Text style={styles.dayCardLabel}>不计收支</Text>
              <Text style={styles.dayCardValue}>
                {dailyData[selectedDate]?.zeroSum.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>

          <View style={styles.dayCardActions}>
            <Button
              title="查看详情"
              type="outline"
              onPress={onViewDetail}
              containerStyle={styles.dayCardButton}
            />
            <Button
              title="添加流水"
              onPress={onAddFlow}
              containerStyle={styles.dayCardButton}
            />
          </View>
        </View>
      </Card>
    );
  }, (prevProps, nextProps) => {
    // 只有当这些属性变化时才重新渲染
    return (
      prevProps.selectedDate === nextProps.selectedDate &&
      JSON.stringify(prevProps.dailyData[prevProps.selectedDate]) ===
      JSON.stringify(nextProps.dailyData[nextProps.selectedDate]) &&
      prevProps.dayFlows.length === nextProps.dayFlows.length
    );
  });

  // 当月数据汇总组件
  const MonthSummary = React.memo(({
    currentMonth,
    dailyData
  }: {
    currentMonth: string;
    dailyData: DailyData;
  }) => {
    // 计算当月总收入、总支出和不计收支
    const summary = useMemo(() => {
      let totalIncome = 0;
      let totalExpense = 0;
      let totalZero = 0;

      Object.entries(dailyData).forEach(([date, data]) => {
        if (date.startsWith(currentMonth)) {
          totalIncome += data.inSum || 0;
          totalExpense += data.outSum || 0;
          totalZero += data.zeroSum || 0;
        }
      });

      return {
        totalIncome,
        totalExpense,
        totalZero,
        balance: totalIncome - totalExpense
      };
    }, [currentMonth, dailyData]);

    return (
      <Card containerStyle={styles.monthSummaryCard}>
        <View style={styles.monthSummaryContent}>
          <View style={styles.monthSummaryRow}>
            <View style={styles.monthSummaryItem}>
              <Text style={styles.monthSummaryLabel}>总收入</Text>
              <Text style={[styles.monthSummaryValue, { color: '#4caf50' }]}>
                {summary.totalIncome.toFixed(2)}
              </Text>
            </View>

            <View style={styles.monthSummaryItem}>
              <Text style={styles.monthSummaryLabel}>总支出</Text>
              <Text style={[styles.monthSummaryValue, { color: '#f44336' }]}>
                {summary.totalExpense.toFixed(2)}
              </Text>
            </View>

            <View style={styles.monthSummaryItem}>
              <Text style={styles.monthSummaryLabel}>不计收支</Text>
              <Text style={[styles.monthSummaryValue, { color: '#070707' }]}>
                {summary.totalZero.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  }, (prevProps, nextProps) => {
    // 只有当月份变化或数据变化时才重新渲染
    return (
      prevProps.currentMonth === nextProps.currentMonth &&
      JSON.stringify(Object.keys(prevProps.dailyData).filter(date =>
        date.startsWith(prevProps.currentMonth)
      )) === JSON.stringify(Object.keys(nextProps.dailyData).filter(date =>
        date.startsWith(nextProps.currentMonth)
      ))
    );
  });

  if (!currentBook) {
    return (
      <View style={styles.container}>
        <BookSelector />
        <Card containerStyle={styles.emptyCard}>
          <Card.Title>未选择账本</Card.Title>
          <Text style={styles.emptyText}>
            请先选择或创建一个账本
          </Text>
          <Button
            title="选择账本"
            onPress={() => navigation.navigate('BookList')}
            containerStyle={styles.emptyButton}
          />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BookSelector />

      <Card containerStyle={styles.calendarCard}>
        <Calendar
          current={currentMonth}
          onDayPress={handleDayPress}
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

      {/* 使用 React.memo 包装的卡片组件 */}
      <DayCard
        selectedDate={dayCardData.selectedDate}
        dailyData={dayCardData.dailyData}
        dayFlows={dayCardData.dayFlows}
        onViewDetail={handleViewDayDetail}
        onAddFlow={handleAddFlow}
      />

      <FAB
        icon={<Icon name="add" color="white" size={24} />}
        color="#1976d2"
        placement="right"
        onPress={handleAddFlow}
      />

      {renderDayDetail()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    margin: 10,
    borderRadius: 10,
  },
  dayCardContent: {
    marginTop: 10,
  },
  dayCardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  dayCardItem: {
    alignItems: 'center',
  },
  dayCardLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 5,
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
  emptyButton: {
    marginTop: 15,
    width: '100%',
  },
  loader: {
    marginTop: 50,
  },
  overlay: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 10,
    padding: 15,
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  daySummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  daySummaryItem: {
    alignItems: 'center',
  },
  daySummaryLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 5,
  },
  daySummaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
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
  flowItem: {
    padding: 10,
  },
  flowItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  flowItemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  flowItemMoney: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  flowItemType: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 3,
  },
  flowItemDesc: {
    fontSize: 12,
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
});

export default CalendarScreen;

﻿import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { Text, Card, Button, Icon, FAB, Divider, Overlay } from '@rneui/themed';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useBookkeeping } from '../../context/BookkeepingContext';
import { Flow, DailyData, CalendarMark } from '../../types';
import moment from 'moment';

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
  const { currentBook, isLoading, fetchCalendarData, getFlowsByMonth, fetchDayFlows } = useBookkeeping();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calendarMarks, setCalendarMarks] = useState<CalendarMark>({});
  const [dailyData, setDailyData] = useState<DailyData>({});
  const [dailyFlows, setDailyFlows] = useState<Flow[]>([]);
  const [dayFlows, setDayFlows] = useState<Flow[]>([]);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);

  // 自定义账本选择器组件
  const BookSelector = useCallback(() => (
    <View style={styles.bookSelector}>
      <Text style={styles.bookName}>{currentBook?.bookName || '未选择账本'}</Text>
      <Button
        type="clear"
        icon={
          <Icon
            name="menu-book"
            type="material"
            color="#1976d2"
            size={24}
          />
        }
        onPress={() => navigation.navigate('BookList')}
      />
    </View>
  ), [currentBook, navigation]);

  // 获取月度流水数据
  const fetchMonthlyFlows = useCallback(async () => {
    if (!currentBook) return;

    try {
      // 获取日历数据
      const { dailyData, calendarMarks } = await fetchCalendarData(currentMonth);
      setDailyData(dailyData);
      setCalendarMarks(calendarMarks);

      // 获取选中日期的流水
      const flows = await getFlowsByMonth(currentMonth);
      updateDailyFlows(selectedDate, flows);
    } catch (error) {
      console.error('获取月度流水失败', error);
      Alert.alert('错误', '获取月度流水失败');
    }
  }, [currentBook, currentMonth, selectedDate, fetchCalendarData, getFlowsByMonth]);

  // 更新选中日期的流水
  const updateDailyFlows = useCallback((date: string, flows: Flow[]) => {
    const dailyFlows = flows.filter(flow => flow.flowTime.startsWith(date));
    setDailyFlows(dailyFlows);
  }, []);

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
    if (currentBook) {
      fetchMonthlyFlows();
    }
  }, [currentBook, fetchMonthlyFlows]);

  // 当页面获得焦点时，刷新数据
  useFocusEffect(
    useCallback(() => {
      if (currentBook) {
        fetchMonthlyFlows();
      }
      return () => {
        // 清理函数
      };
    }, [currentBook, fetchMonthlyFlows])
  );

  // 处理日期选择
  const handleDayPress = useCallback((day: any) => {
    setSelectedDate(day.dateString);

    // 更新标记
    const newMarks = { ...calendarMarks };

    // 重置之前选中的日期样式
    Object.keys(newMarks).forEach(date => {
      if (newMarks[date].customStyles) {
        newMarks[date].customStyles!.container = {
          backgroundColor: undefined,
        };
        newMarks[date].customStyles!.text = {
          color: undefined,
        };
      }
    });

    // 设置新选中的日期样式
    if (newMarks[day.dateString]) {
      newMarks[day.dateString].customStyles = {
        container: {
          backgroundColor: '#1976d2',
        },
        text: {
          color: 'white',
        },
      };
    } else {
      newMarks[day.dateString] = {
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

    setCalendarMarks(newMarks);
  }, [calendarMarks]);

  // 处理月份变化
  const handleMonthChange = useCallback((month: any) => {
    setCurrentMonth(moment(month.dateString).format('YYYY-MM'));
  }, []);

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
  const handleViewFlowDetail = useCallback((flowId: number) => {
    setShowDayDetail(false);
    navigation.navigate('FlowDetail', { flowId });
  }, [navigation]);

  // 渲染日详情项
  const renderDayFlowItem = useCallback(({ item }: { item: Flow }) => (
    <TouchableOpacity
      style={styles.flowItem}
      onPress={() => handleViewFlowDetail(item.id)}
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

      {isLoading ? (
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      ) : (
        <>
          <Card containerStyle={styles.calendarCard}>
            <Calendar
              current={currentMonth}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
              markingType="custom"
              markedDates={calendarMarks}
              theme={{
                todayTextColor: '#1976d2',
                arrowColor: '#1976d2',
                monthTextColor: '#1976d2',
              }}
            />
          </Card>

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
                  onPress={handleViewDayDetail}
                  containerStyle={styles.dayCardButton}
                />
                <Button
                  title="添加流水"
                  onPress={handleAddFlow}
                  containerStyle={styles.dayCardButton}
                />
              </View>
            </View>
          </Card>

          <FAB
            icon={
              <Icon
                name="add"
                color="white"
                size={24}
              />
            }
            color="#1976d2"
            placement="right"
            onPress={handleAddFlow}
          />
        </>
      )}

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
});

export default CalendarScreen;

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Card, Button, Icon, ListItem, Overlay } from '@rneui/themed';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useBookkeeping } from '../context/BookkeepingContext';
import LocalDataService from '../services/LocalDataService';
import api from '../services/api';
import { useTheme, getColors } from '../context/ThemeContext';
import { eventBus } from '../navigation';

const SyncManagementScreen: React.FC = () => {
  const { serverConfig } = useAuth();
  const { currentBook } = useBookkeeping();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [unsyncedFlows, setUnsyncedFlows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showBatchSyncConfirm, setShowBatchSyncConfirm] = useState(false);
  const [syncStats, setSyncStats] = useState({ total: 0, synced: 0, unsynced: 0 });

  // 加载未同步的流水
  const loadUnsyncedFlows = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('=== 开始加载未同步流水 ===');

      const allFlows = await LocalDataService.getUnsyncedFlows();
      console.log('未同步流水:', allFlows);
      setUnsyncedFlows(allFlows);

      // 更新统计信息
      const allLocalFlows = await LocalDataService.getAllLocalFlows();
      console.log('所有本地流水:', allLocalFlows);

      const syncedCount = allLocalFlows.filter(f => f.synced).length;
      console.log('已同步数量:', syncedCount, '未同步数量:', allLocalFlows.length - syncedCount);

      setSyncStats({
        total: allLocalFlows.length,
        synced: syncedCount,
        unsynced: allLocalFlows.length - syncedCount,
      });
    } catch (error) {
      console.error('加载未同步流水失败:', error);
      Alert.alert('错误', '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUnsyncedFlows();
  }, [loadUnsyncedFlows]);

  // 当页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadUnsyncedFlows();
    }, [loadUnsyncedFlows])
  );

  // 监听本地数据更新事件
  useEffect(() => {
    const handleRefreshLocalData = () => {
      console.log('收到本地数据更新事件，重新加载同步数据');
      loadUnsyncedFlows();
    };

    const subscription = eventBus.addListener('refreshLocalData', handleRefreshLocalData);

    return () => {
      subscription.remove();
    };
  }, [loadUnsyncedFlows]);

  // 执行同步
  const handleSync = useCallback(async (flow: any) => {
    if (!serverConfig || !currentBook) {
      Alert.alert('错误', '请先选择服务器和账本');
      return;
    }

    try {
      setIsLoading(true);

      // 同步流水到服务器
      const response = await api.flow.create({
        ...flow.data,
        bookId: currentBook.bookId,
      });

      if (response.c === 200) {
        // 标记为已同步
        await LocalDataService.markFlowAsSynced(flow.id);

        Alert.alert('成功', '流水同步成功');
        await loadUnsyncedFlows();
      } else {
        Alert.alert('错误', response.m || '同步失败');
      }
    } catch (error) {
      console.error('同步失败:', error);
      Alert.alert('错误', '同步失败');
    } finally {
      setIsLoading(false);
    }
  }, [serverConfig, currentBook, loadUnsyncedFlows]);

  // 批量同步
  const handleBatchSync = useCallback(async () => {
    if (!serverConfig || !currentBook) {
      Alert.alert('错误', '请先选择服务器和账本');
      return;
    }

    // 显示确认弹窗
    setShowBatchSyncConfirm(true);
  }, [serverConfig, currentBook]);

  // 确认批量同步
  const confirmBatchSync = useCallback(async () => {
    if (!serverConfig || !currentBook) {return;}

    try {
      setIsLoading(true);
      setShowBatchSyncConfirm(false);

      let successCount = 0;
      for (const flow of unsyncedFlows) {
        try {
          const response = await api.flow.create({
            ...flow.data,
            bookId: currentBook.bookId,
          });

          if (response.c === 200) {
            await LocalDataService.markFlowAsSynced(flow.id);
            successCount++;
          }
        } catch (error) {
          console.error(`同步流水 ${flow.id} 失败:`, error);
        }
      }

      Alert.alert('同步完成', `成功同步 ${successCount} 条流水`);
      await loadUnsyncedFlows();
    } catch (error) {
      console.error('批量同步失败:', error);
      Alert.alert('错误', '批量同步失败');
    } finally {
      setIsLoading(false);
    }
  }, [unsyncedFlows, serverConfig, currentBook, loadUnsyncedFlows]);

  // 渲染流水项
  const renderFlowItem = ({ item }: { item: any }) => (
    <ListItem
      bottomDivider
      containerStyle={[styles.listItem, { backgroundColor: colors.card }]}
      onPress={() => handleSync(item)}
    >
      <Icon
        name={item.data.flowType === '收入' ? 'trending-up' : 'trending-down'}
        type="material"
        color={item.data.flowType === '收入' ? '#4caf50' : '#f44336'}
      />
      <ListItem.Content>
        <ListItem.Title style={[styles.listTitle, { color: colors.text }]}>
          {item.data.name}
        </ListItem.Title>
        <ListItem.Subtitle style={[styles.listSubtitle, { color: colors.secondaryText }]}>
          {item.data.flowType} • ¥{item.data.money} • {item.data.day}
        </ListItem.Subtitle>
        <Text style={[styles.listMeta, { color: colors.secondaryText }]}>
          {item.data.industryType} • {item.data.payType}
        </Text>
      </ListItem.Content>
      <Icon name="sync" type="material" color={colors.primary} />
    </ListItem>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {
        // 离线模式 - 原有的同步管理界面
        <>
          {/* 统计卡片 */}
          <Card containerStyle={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statsTitle, { color: colors.text }]}>同步统计</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.primary }]}>{syncStats.total}</Text>
                <Text style={[styles.statLabel, { color: colors.secondaryText }]}>总计</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#4caf50' }]}>{syncStats.synced}</Text>
                <Text style={[styles.statLabel, { color: colors.secondaryText }]}>已同步</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#f44336' }]}>{syncStats.unsynced}</Text>
                <Text style={[styles.statLabel, { color: colors.secondaryText }]}>未同步</Text>
              </View>
            </View>
          </Card>

          {/* 操作按钮 */}
          <Card containerStyle={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* 当前同步目标显示 */}
            <View style={styles.syncTargetInfo}>
              <Text style={[styles.syncTargetTitle, { color: colors.text }]}>同步目标</Text>
              <Text style={[styles.syncTargetText, { color: colors.secondaryText }]}>
                服务器：{serverConfig?.name || '未选择'}
              </Text>
              <Text style={[styles.syncTargetText, { color: colors.secondaryText }]}>
                账本：{currentBook?.bookName || '未选择'}
              </Text>
            </View>

            <Button
              title={`批量同步 (${unsyncedFlows.length})`}
              icon={<Icon name="sync" type="material" color="white" size={20} />}
              buttonStyle={[styles.batchSyncButton, { backgroundColor: colors.primary }]}
              onPress={handleBatchSync}
              disabled={unsyncedFlows.length === 0 || isLoading || !serverConfig || !currentBook}
            />
          </Card>

          {/* 未同步流水列表 */}
          <FlatList
            data={unsyncedFlows}
            renderItem={renderFlowItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <Card containerStyle={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                  没有未同步的流水
                </Text>
              </Card>
            }
          />

          {/* 批量同步确认弹窗 */}
          <Overlay
            isVisible={showBatchSyncConfirm}
            onBackdropPress={() => setShowBatchSyncConfirm(false)}
            overlayStyle={[styles.modalOverlay, { backgroundColor: colors.card }]}
          >
            <View style={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>批量同步确认</Text>
              <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                确定要将所有 {unsyncedFlows.length} 条未同步流水同步到当前服务器和账本吗？
              </Text>
              <View style={styles.modalButtons}>
                <Button
                  title="取消"
                  type="outline"
                  containerStyle={styles.modalButton}
                  buttonStyle={{ borderColor: colors.primary }}
                  titleStyle={{ color: colors.primary }}
                  onPress={() => setShowBatchSyncConfirm(false)}
                />
                <Button
                  title="确定"
                  containerStyle={styles.modalButton}
                  buttonStyle={{ backgroundColor: colors.primary }}
                  onPress={confirmBatchSync}
                  loading={isLoading}
                />
              </View>
            </View>
          </Overlay>
        </>
      }
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  statsCard: {
    borderRadius: 10,
    marginBottom: 10,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 5,
  },
  actionCard: {
    borderRadius: 10,
    marginBottom: 10,
    paddingVertical: 10,
  },
  batchSyncButton: {
    borderRadius: 8,
  },
  listContainer: {
    paddingBottom: 20,
  },
  listItem: {
    borderRadius: 10,
    marginVertical: 5,
  },
  listTitle: {
    fontWeight: 'bold',
  },
  listSubtitle: {
    fontSize: 14,
    marginTop: 5,
  },
  listMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
  },
  modalOverlay: {
    width: '90%',
    borderRadius: 10,
    padding: 20,
  },
  modalContent: {
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  buttonGroup: {
    borderRadius: 8,
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 30,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  onlineModeCard: {
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    paddingVertical: 30,
  },
  onlineModeIcon: {
    marginBottom: 15,
  },
  onlineModeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  onlineModeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  syncTargetInfo: {
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#f0f0f0', // 示例背景色
    borderRadius: 5,
  },
  syncTargetTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  syncTargetText: {
    fontSize: 13,
  },
});

export default SyncManagementScreen;

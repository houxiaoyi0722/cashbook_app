import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { Button, Card, Divider, Icon } from '@rneui/themed';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logger } from '../../services/LogService';
import RNFS from 'react-native-fs';
import serverConfigManager from '../../services/serverConfig';
import { useTheme, getColors } from '../../context/ThemeContext';

type LogFile = {
  path: string;
  name: string;
  size: string;
  date: string;
};

const LogsScreen: React.FC = () => {
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);
  
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalSize, setTotalSize] = useState('0 B');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [selectedLogContent, setSelectedLogContent] = useState<string | null>(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [selectedLogName, setSelectedLogName] = useState<string>('');
  const [loggingEnabled, setLoggingEnabled] = useState<boolean>(false);
  const [serverName, setServerName] = useState<string>('');

  // 获取日志文件信息
  const fetchLogFiles = async () => {
    setLoading(true);
    setErrorMessage(null);
    setDebugInfo(null);

    try {
      // 记录调试信息
      let debug = '开始获取日志文件...\n';

      // 获取日志目录路径
      const logDir = (logger as any).getLogDirectoryPath?.() || '';
      debug += `日志目录: ${logDir}\n`;

      // 检查目录是否存在
      let dirExists = false;
      try {
        dirExists = await RNFS.exists(logDir);
        debug += `目录存在: ${dirExists}\n`;
      } catch (dirError: any) {
        debug += `检查目录失败: ${dirError?.message}\n`;
      }

      // 如果目录不存在，尝试创建
      if (!dirExists && logDir) {
        try {
          await RNFS.mkdir(logDir);
          debug += '已创建日志目录\n';
        } catch (mkdirError: any) {
          debug += `创建目录失败: ${mkdirError?.message}\n`;
        }
      }

      // 直接从文件系统读取日志文件
      debug += '尝试从文件系统读取日志文件...\n';
      let logFiles: LogFile[] = [];
      let totalBytes = 0;

      try {
        if (logDir) {
          const files = await RNFS.readDir(logDir);
          debug += `从文件系统读取到 ${files.length} 个文件\n`;

          // 过滤出日志文件
          const logFilePaths = files
            .filter(file => file.isFile() && file.name.endsWith('.log'))
            .map(file => file.path);

          debug += `找到 ${logFilePaths.length} 个日志文件\n`;

          // 处理每个日志文件
          for (const path of logFilePaths) {
            try {
              const stat = await RNFS.stat(path);
              const fileName = path.split('/').pop() || 'unknown';
              const fileSize = stat.size || 0;
              totalBytes += fileSize;

              logFiles.push({
                path,
                name: fileName,
                size: formatBytes(fileSize),
                date: new Date(stat.mtime || Date.now()).toLocaleString(),
              });

              debug += `成功添加文件: ${fileName}, 大小: ${formatBytes(fileSize)}\n`;
            } catch (err: any) {
              debug += `处理文件失败: ${err?.message}\n`;
            }
          }

          // 按修改时间倒序排序
          logFiles.sort((a, b) => {
            try {
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            } catch {
              return 0;
            }
          });
        }
      } catch (fsError: any) {
        debug += `从文件系统读取失败: ${fsError?.message}\n`;
      }

      setLogFiles(logFiles);
      setTotalSize(formatBytes(totalBytes));
      setDebugInfo(debug);
    } catch (error: any) {
      console.error('获取日志文件失败:', error);
      setErrorMessage(`获取日志文件失败: ${error?.message || '未知错误'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 格式化字节数
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) {return '0 B';}

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // 清理所有日志
  const handleClearLogs = () => {
    Alert.alert(
      '确认清理',
      '确定要清理所有日志文件吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // 使用日志服务删除所有日志
              await logger.deleteAllLogs();

              // 记录操作成功
              setTimeout(() => {
                logger.info('LogsScreen', '成功清理所有日志文件');
              }, 500);

              Alert.alert('成功', '已清理所有日志文件');
              fetchLogFiles();
            } catch (error: any) {
              console.error('清理日志文件失败:', error);
              Alert.alert('错误', '清理日志文件失败，请稍后重试');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 显示调试信息
  const handleShowDebugInfo = () => {
    if (debugInfo) {
      Alert.alert('调试信息', debugInfo, [{ text: '关闭' }]);
    } else {
      Alert.alert('提示', '暂无调试信息');
    }
  };

  // 查看日志文件内容
  const handleViewLogFile = async (filePath: string, fileName: string) => {
    try {
      setLoading(true);

      // 检查文件是否存在
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        setLoading(false);
        Alert.alert('错误', '文件不存在或已被删除');
        return;
      }

      const content = await RNFS.readFile(filePath, 'utf8');
      setSelectedLogContent(content);
      setSelectedLogName(fileName);
      setLogModalVisible(true);
      setLoading(false);
    } catch (error: any) {
      setLoading(false);
      console.error('读取日志文件失败:', error);
      Alert.alert('错误', '无法读取日志文件: ' + (error?.message || '未知错误'));
    }
  };

  // 刷新日志列表
  const onRefresh = () => {
    setRefreshing(true);
    fetchLogFiles();
  };

  // 加载日志开关状态
  const loadLoggingState = async () => {
    try {
      // 获取当前服务器配置
      const serverConfig = await serverConfigManager.getCurrentServer();
      if (serverConfig) {
        setServerName(serverConfig.name);
        // 如果服务器配置中有日志开关设置，使用它
        if (serverConfig.loggingEnabled !== undefined) {
          setLoggingEnabled(serverConfig.loggingEnabled);
          return;
        }
      }

      // 否则使用日志服务中的状态
      setLoggingEnabled((logger as any).isLoggingEnabled?.() || false);
    } catch (error) {
      console.error('加载日志开关状态失败:', error);
      setLoggingEnabled(false);
    }
  };

  // 切换日志开关
  const toggleLoggingEnabled = async (value: boolean) => {
    try {
      setLoading(true);

      // 更新日志服务中的开关状态
      await (logger as any).setLoggingEnabled?.(value);

      // 更新UI状态
      setLoggingEnabled(value);

      // 显示提示
      Alert.alert(
        '提示',
        value ? '日志记录已启用' : '日志记录已禁用',
        [{ text: '确定' }]
      );
    } catch (error: any) {
      console.error('设置日志开关状态失败:', error);
      Alert.alert('错误', `设置日志开关状态失败: ${error?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取日志文件列表和日志开关状态
  useEffect(() => {
    fetchLogFiles();
    loadLoggingState();
    return () => {};
  }, []);

  // 渲染日志文件项
  const renderLogFileItem = ({ item }: { item: LogFile }) => (
    <TouchableOpacity onPress={() => handleViewLogFile(item.path, item.name)}>
      <Card containerStyle={[styles.fileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.fileHeader}>
          <Icon name="description" type="material" size={20} color={colors.primary} />
          <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Divider style={[styles.divider, { backgroundColor: colors.divider }]} />
        <View style={styles.fileInfo}>
          <Text style={[styles.fileInfoText, { color: colors.secondaryText }]}>
            <Text style={[styles.fileInfoLabel, { color: colors.text }]}>大小：</Text>
            {item.size}
          </Text>
          <Text style={[styles.fileInfoText, { color: colors.secondaryText }]}>
            <Text style={[styles.fileInfoLabel, { color: colors.text }]}>修改时间：</Text>
            {item.date}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleClearLogs}
          >
            <Icon name="delete" type="material" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={handleShowDebugInfo}
          >
            <Icon name="bug-report" type="material" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* 日志开关卡片 */}
        <Card containerStyle={[styles.switchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.switchContainer}>
            <View style={styles.switchTextContainer}>
              <Text style={[styles.switchTitle, { color: colors.text }]}>日志记录</Text>
              <Text style={[styles.switchDescription, { color: colors.secondaryText }]}>
                {loggingEnabled ? '已启用' : '已禁用'}
                {serverName ? ` (${serverName})` : ''}
              </Text>
            </View>
            <Switch
              value={loggingEnabled}
              onValueChange={toggleLoggingEnabled}
              trackColor={{ false: colors.divider, true: `${colors.primary}80` }}
              thumbColor={loggingEnabled ? colors.primary : '#f4f3f4'}
              disabled={loading}
            />
          </View>
          <Text style={[styles.switchHint, { color: colors.hint }]}>
            启用后将记录应用运行日志，可能会占用额外存储空间
          </Text>
        </Card>

        <Card containerStyle={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>日志文件数</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{logFiles.length}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>总大小</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{totalSize}</Text>
            </View>
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>日志文件列表</Text>

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }]}>加载中...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorContainer}>
            <Icon name="error" type="material" size={48} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
            <Button
              title="重试"
              buttonStyle={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={fetchLogFiles}
            />
          </View>
        ) : logFiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="description" type="material" size={48} color={colors.divider} />
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>暂无日志文件</Text>
          </View>
        ) : (
          <FlatList
            data={logFiles}
            renderItem={renderLogFileItem}
            keyExtractor={(item) => item.path}
            contentContainerStyle={styles.fileList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          />
        )}

        {/* 日志内容查看模态框 */}
        <Modal
          visible={logModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setLogModalVisible(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedLogName}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setLogModalVisible(false)}
              >
                <Icon name="close" type="material" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={[styles.logContentContainer, { backgroundColor: colors.card }]}>
              <Text style={[styles.logContent, { color: colors.text }]}>{selectedLogContent}</Text>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deleteButton: {
    padding: 4,
    marginRight: 0,
  },
  debugButton: {
    padding: 4,
    marginLeft: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 32,
  },
  summaryCard: {
    margin: 12,
    borderRadius: 10,
    padding: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryDivider: {
    height: '100%',
    width: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 120,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  fileList: {
    paddingBottom: 16,
  },
  fileCard: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 8,
    padding: 12,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
  divider: {
    marginVertical: 8,
  },
  fileInfo: {
    marginTop: 4,
  },
  fileInfoText: {
    fontSize: 13,
    marginVertical: 2,
  },
  fileInfoLabel: {
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
  // 日志内容模态框样式
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  logContentContainer: {
    flex: 1,
    padding: 16,
  },
  logContent: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  switchCard: {
    margin: 12,
    borderRadius: 10,
    padding: 15,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchTextContainer: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  switchHint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default LogsScreen;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { aiConfigService, AIConfig } from '../../services/AIConfigService';
import { useTheme, getColors } from '../../context/ThemeContext';
import { MainStackParamList } from '../../navigation/types';
import { KeyboardAvoidingView } from 'react-native';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const AIConfigScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [_loading, _setLoading] = useState(false);
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [switchingConfig, setSwitchingConfig] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editingConfigName, setEditingConfigName] = useState<string>('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // 获取所有配置
      const allConfigs = await aiConfigService.getAllConfigs();
      setConfigs(allConfigs);

      // 获取活动配置
      const activeConfig = await aiConfigService.getActiveConfig();
      if (activeConfig) {
        setActiveConfigId(activeConfig.id);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) {return '未知时间';}
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleSwitchConfig = async (configId: string) => {
    if (switchingConfig === configId) {return;}

    setSwitchingConfig(configId);
    try {
      await aiConfigService.setActiveConfig(configId);
      setActiveConfigId(configId);
      // 重新加载配置以更新UI
      await loadConfig();
    } catch (error) {
      Alert.alert('错误', '切换配置失败');
    } finally {
      setSwitchingConfig(null);
    }
  };

  const handleCopyConfig = async (config: AIConfig) => {
    try {
      await aiConfigService.addConfig(config);
      // 重新加载配置以更新UI
      await loadConfig();
    } catch (error) {
      Alert.alert('错误', '复制配置失败');
    }
  };

  const handleRenameConfig = async (configId: string, newName: string) => {
    if (!newName.trim()) {
      Alert.alert('错误', '配置名称不能为空');
      return;
    }

    try {
      const success = await aiConfigService.updateConfig(configId, { name: newName });
      if (success) {
        Alert.alert('成功', '配置名称已更新');
        await loadConfig();
        setEditingName(false);
        setEditingConfigId(null);
      } else {
        Alert.alert('失败', '重命名失败');
      }
    } catch (error) {
      Alert.alert('错误', '重命名失败');
    }
  };

  const handleDeleteConfig = async (configId: string, configName: string) => {
    Alert.alert(
      '删除配置',
      `确定要删除"${configName}"吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            const success = await aiConfigService.deleteConfig(configId);
            if (success) {
              await loadConfig();
            } else {
              Alert.alert('失败', '删除配置失败');
            }
          },
        },
      ]
    );
  };

  const handleEditConfig = (configId: string) => {
    navigation.navigate('AIConfigEdit', { configId });
  };

  const handleNewConfig = () => {
    navigation.navigate('AIConfigEdit', {});
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* 配置管理部分 */}
          <View style={styles.section}>
            <View style={styles.configHeader}>
              <Text style={[styles.label, {color: colors.text}]}>配置管理</Text>
              <TouchableOpacity
                style={[styles.newConfigButton, {backgroundColor: colors.primary}]}
                onPress={handleNewConfig}
              >
                <Icon name="add" type="material" color="#fff" size={20}/>
                <Text style={styles.newConfigButtonText}>新建配置</Text>
              </TouchableOpacity>
            </View>

            {configs.length === 0 ? (
              <View style={[styles.noConfigsContainer, {backgroundColor: colors.card}]}>
                <Text style={[styles.noConfigsText, {color: colors.secondaryText}]}>
                  暂无配置，请创建一个新配置
                </Text>
              </View>
            ) : (
              <View style={styles.configsList}>
                {configs.map((config) => (
                  <View
                    key={config.id}
                    style={[
                      styles.configItem,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        shadowColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        shadowOffset: {width: 0, height: 2},
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 3,
                      },
                      editingConfigId === config.id && styles.configItemActive,
                      activeConfigId === config.id && styles.configItemActiveBorder,
                    ]}
                  >
                    <View style={styles.configItemHeader}>
                      <View style={styles.configItemInfo}>
                        <View style={styles.configTitleRow}>
                          {editingName && editingConfigId === config.id ? (
                            <View style={styles.nameEditContainer}>
                              <TextInput
                                style={[styles.configNameInput, {color: colors.text, borderColor: colors.primary}]}
                                value={editingConfigName}
                                onChangeText={setEditingConfigName}
                                autoFocus
                              />
                              <TouchableOpacity
                                style={[styles.nameEditButton, {backgroundColor: colors.success}]}
                                onPress={() => handleRenameConfig(config.id, editingConfigName)}
                              >
                                <Icon name="check" type="material" color="#fff" size={16}/>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.nameEditButton, {backgroundColor: colors.error}]}
                                onPress={() => {
                                  setEditingName(false);
                                  setEditingConfigId(null);
                                }}
                              >
                                <Icon name="close" type="material" color="#fff" size={16}/>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleEditConfig(config.id)}
                              style={styles.configNameTouchable}
                            >
                              <Text style={[styles.configName, {color: colors.text}]}>
                                {config.name}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {activeConfigId === config.id && (
                            <View style={[styles.activeBadge, {backgroundColor: colors.success}]}>
                              <Text style={styles.activeBadgeText}>活动</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.configProvider, {color: colors.secondaryText}]}>
                          {config.provider} • {config.model}
                        </Text>

                        {/* 时间信息 */}
                        <View style={styles.timeInfoContainer}>
                          <View style={styles.timeInfoItem}>
                            <Icon name="access-time" type="material" color={colors.hint} size={10}/>
                            <Text style={[styles.timeInfoText, {color: colors.hint}]}>
                              创建: {formatTime(config.createdAt)}
                            </Text>
                          </View>
                          <View style={styles.timeInfoItem}>
                            <Icon name="update" type="material" color={colors.hint} size={10}/>
                            <Text style={[styles.timeInfoText, {color: colors.hint}]}>
                              更新: {formatTime(config.updatedAt)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* 操作按钮区域 */}
                      <View style={styles.configItemActions}>
                        <TouchableOpacity
                          onPress={() => setShowActionMenu(showActionMenu === config.id ? null : config.id)}
                          style={styles.moreActionButton}
                        >
                          <Icon name="more-vert" type="material" color={colors.secondaryText} size={20}/>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* API Key状态 */}
                    <View style={styles.configStatusRow}>
                      {config.apiKey ? (
                        <View style={[styles.statusBadge, {backgroundColor: colors.success + '20'}]}>
                          <Icon name="key" type="material" color={colors.success} size={12}/>
                          <Text style={[styles.statusBadgeText, {color: colors.success}]}>
                            API Key已配置
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, {backgroundColor: colors.warning + '20'}]}>
                          <Icon name="warning" type="material" color={colors.warning} size={12}/>
                          <Text style={[styles.statusBadgeText, {color: colors.warning}]}>
                            未配置API Key
                          </Text>
                        </View>
                      )}

                      {/* 切换配置按钮 */}
                      <TouchableOpacity
                        onPress={() => handleSwitchConfig(config.id)}
                        style={[
                          styles.switchConfigButton,
                          {
                            backgroundColor: activeConfigId === config.id ? colors.success + '20' : colors.primary + '20',
                            borderColor: activeConfigId === config.id ? colors.success : colors.primary,
                          },
                        ]}
                        disabled={switchingConfig === config.id || activeConfigId === config.id}
                      >
                        {switchingConfig === config.id ? (
                          <ActivityIndicator size="small" color={colors.primary}/>
                        ) : (
                          <>
                            <Icon
                              name={activeConfigId === config.id ? 'check-circle' : 'swap-horiz'}
                              type="material"
                              color={activeConfigId === config.id ? colors.success : colors.primary}
                              size={14}
                            />
                            <Text style={[
                              styles.switchConfigText,
                              {color: activeConfigId === config.id ? colors.success : colors.primary},
                            ]}>
                              {activeConfigId === config.id ? '当前使用' : '切换使用'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* 快速操作菜单 */}
                    {showActionMenu === config.id && (
                      <View style={[styles.actionMenu, {backgroundColor: colors.card, borderColor: colors.border}]}>
                        <TouchableOpacity
                          style={styles.actionMenuItem}
                          onPress={() => {
                            setEditingConfigName(config.name);
                            setEditingConfigId(config.id);
                            setEditingName(true);
                            setShowActionMenu(null);
                          }}
                        >
                          <Icon name="edit" type="material" color={colors.primary} size={16}/>
                          <Text style={[styles.actionMenuText, {color: colors.text}]}>重命名</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionMenuItem}
                          onPress={async () => {
                            setShowActionMenu(null);
                            await handleCopyConfig(config);
                          }}
                        >
                          <Icon name="content-copy" type="material" color={colors.success} size={16}/>
                          <Text style={[styles.actionMenuText, {color: colors.text}]}>复制</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionMenuItem}
                          onPress={async () => {
                            setShowActionMenu(null);
                            handleDeleteConfig(config.id, config.name);
                          }}
                        >
                          <Icon name="delete" type="material" color={colors.error} size={16}/>
                          <Text style={[styles.actionMenuText, {color: colors.text}]}>删除</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  newConfigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newConfigButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  noConfigsContainer: {
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  noConfigsText: {
    fontSize: 14,
  },
  configsList: {
    gap: 12,
  },
  configItem: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  configItemActive: {
    borderColor: '#007AFF',
  },
  configItemActiveBorder: {
    borderWidth: 2,
  },
  configItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  configItemInfo: {
    flex: 1,
  },
  configTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  configNameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    marginRight: 4,
  },
  nameEditButton: {
    padding: 4,
    borderRadius: 4,
    marginLeft: 4,
  },
  configNameTouchable: {
    flex: 1,
  },
  configName: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  configProvider: {
    fontSize: 12,
    marginBottom: 8,
  },
  timeInfoContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInfoText: {
    fontSize: 10,
    marginLeft: 4,
  },
  configItemActions: {
    marginLeft: 8,
  },
  moreActionButton: {
    padding: 4,
  },
  configStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  switchConfigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  switchConfigText: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  actionMenu: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 120,
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  actionMenuText: {
    fontSize: 12,
    marginLeft: 8,
  },
});

export default AIConfigScreen;

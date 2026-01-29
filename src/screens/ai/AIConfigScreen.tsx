import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@rneui/themed';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { aiConfigService, AIConfig } from '../../services/AIConfigService';
import { useTheme, getColors } from '../../context/ThemeContext';
import { MainStackParamList } from '../../navigation/types';
import { KeyboardAvoidingView } from 'react-native';
import { Picker } from '@react-native-picker/picker';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const AIConfigScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [_loading, _setLoading] = useState(false);
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editingConfigName, setEditingConfigName] = useState<string>('');

  // 新增状态：全局设置
  const [aiSuggestionEnabled, setAiSuggestionEnabled] = useState(true);
  const [chatModelConfigId, setChatModelConfigId] = useState<string | null>(null);
  const [suggestionModelConfigId, setSuggestionModelConfigId] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 预定义的工具列表
  const ALL_TOOLS = [
    'search_flows',
    'create_flow',
    'update_flow',
    'delete_flow',
    'get_statistics',
    'analyze_spending',
    'predict_expenses',
    'categorize_flow',
  ];

  const loadConfig = useCallback(async () => {
    try {
      // 获取所有配置
      const allConfigs = await aiConfigService.getAllConfigs();
      setConfigs(allConfigs);

      // 加载全局设置
      const globalSettings = await aiConfigService.getGlobalSettings();
      setAiSuggestionEnabled(globalSettings.aiSuggestionEnabled);
      setChatModelConfigId(globalSettings.chatModelConfigId);
      setSuggestionModelConfigId(globalSettings.suggestionModelConfigId);
      setAvailableTools(globalSettings.availableTools);
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 当页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [loadConfig])
  );

  // 处理全局设置
  const handleSaveGlobalSettings = async () => {
    try {
      setSaving(true);
      const success = await aiConfigService.updateGlobalSettings({
        aiSuggestionEnabled,
        chatModelConfigId,
        suggestionModelConfigId,
        availableTools,
      });

      if (success) {
        Alert.alert('成功', '全局设置已保存');
      } else {
        Alert.alert('错误', '保存全局设置失败');
      }
    } catch (error) {
      console.error('保存全局设置失败:', error);
      Alert.alert('错误', '保存全局设置时发生错误');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAiSuggestion = (value: boolean) => {
    setAiSuggestionEnabled(value);
  };

  const handleChatModelChange = (configId: string) => {
    setChatModelConfigId(configId);
  };

  const handleSuggestionModelChange = (configId: string) => {
    setSuggestionModelConfigId(configId);
  };

  const handleToolToggle = (toolName: string) => {
    setAvailableTools(prev => {
      if (prev.includes(toolName)) {
        return prev.filter(t => t !== toolName);
      } else {
        return [...prev, toolName];
      }
    });
  };

  const handleSelectAllTools = () => {
    setAvailableTools(ALL_TOOLS);
  };

  const handleClearAllTools = () => {
    setAvailableTools([]);
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) {return '未知时间';}
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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
      return;
    }

    try {
      const success = await aiConfigService.updateConfig(configId, { name: newName });
      if (success) {
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
          {/* 全局 AI 设置部分 */}
          <View style={[styles.section, { marginBottom: 24 }]}>
            <View style={styles.configHeader}>
              <Text style={[styles.label, {color: colors.text}]}>AI助手 设置</Text>
            </View>

            {/* AI 建议开关 */}
            <View style={[styles.row, { marginBottom: 16 }]}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>启用 AI 建议</Text>
              <Switch
                value={aiSuggestionEnabled}
                onValueChange={handleToggleAiSuggestion}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={aiSuggestionEnabled ? colors.primary : colors.secondaryText}
              />
            </View>

            {/* 聊天模型选择 */}
            <View style={[styles.row, { marginBottom: 16 }]}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>聊天模型配置</Text>
              <View style={[styles.pickerContainer, { borderColor: colors.border }]}>
                <Picker
                  selectedValue={chatModelConfigId || ''}
                  onValueChange={handleChatModelChange}
                  style={[styles.picker, { color: colors.text }]}
                  dropdownIconColor={colors.text}
                >
                  {configs.map(config => (
                    <Picker.Item
                      key={config.id}
                      label={config.name}
                      value={config.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* 建议模型选择 */}
            <View style={[styles.row, { marginBottom: 16 }]}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>建议模型配置</Text>
              <View style={[styles.pickerContainer, { borderColor: colors.border }]}>
                <Picker
                  selectedValue={suggestionModelConfigId || ''}
                  onValueChange={handleSuggestionModelChange}
                  style={[styles.picker, { color: colors.text }]}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="使用聊天模型" value="" />
                  {configs.map(config => (
                    <Picker.Item
                      key={config.id}
                      label={config.name}
                      value={config.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* 可用工具管理 */}
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.rowLabel, { color: colors.text, marginBottom: 8 }]}>可用工具管理</Text>
              <Text style={[styles.toolHint, { color: colors.secondaryText }]}>
                如果列表为空，则所有工具都可用
              </Text>

              <View style={styles.toolButtonRow}>
                <TouchableOpacity
                  style={[styles.toolButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={handleSelectAllTools}
                >
                  <Text style={[styles.toolButtonText, { color: colors.primary }]}>全选</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toolButton, { backgroundColor: colors.error + '20' }]}
                  onPress={handleClearAllTools}
                >
                  <Text style={[styles.toolButtonText, { color: colors.error }]}>清空</Text>
                </TouchableOpacity>
              </View>

              {ALL_TOOLS.map((tool, index) => (
                <TouchableOpacity
                  key={tool}
                  style={[
                    styles.toolItem,
                    index === ALL_TOOLS.length - 1 ? { borderBottomWidth: 0 } : null
                  ]}
                  onPress={() => handleToolToggle(tool)}
                >
                  <Switch
                    value={availableTools.length === 0 || availableTools.includes(tool)}
                    onValueChange={() => handleToolToggle(tool)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={(availableTools.length === 0 || availableTools.includes(tool)) ? colors.primary : colors.secondaryText}
                  />
                  <Text style={[styles.toolLabel, { color: colors.text }]}>{tool}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 保存按钮 */}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSaveGlobalSettings}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>保存全局设置</Text>
              )}
            </TouchableOpacity>
          </View>

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
                  <TouchableOpacity
                    onPress={() => handleEditConfig(config.id)}
                    style={styles.configNameTouchable}
                  >
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
                        (chatModelConfigId === config.id || suggestionModelConfigId === config.id) && styles.configItemActiveBorder,
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
                              <Text style={[styles.configName, {color: colors.text}]}>
                                {config.name}
                              </Text>
                            )}
                            {(chatModelConfigId === config.id || suggestionModelConfigId === config.id) && (
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
                      </View>

                      {/* 快速操作菜单 */}
                      {showActionMenu === config.id && (
                        <View style={[styles.actionMenu, {backgroundColor: colors.card, borderColor: colors.border}]}>
                          <TouchableOpacity
                            style={[
                              styles.actionMenuItem,
                              {borderBottomWidth: 1, borderBottomColor: colors.border}
                            ]}
                            activeOpacity={0.7}
                            onPress={() => {
                              setEditingConfigName(config.name);
                              setEditingConfigId(config.id);
                              setEditingName(true);
                              setShowActionMenu(null);
                            }}
                          >
                            <Icon name="edit" type="material" color={colors.primary} size={14}/>
                            <Text style={[styles.actionMenuText, {color: colors.text}]}>重命名</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.actionMenuItem,
                              {borderBottomWidth: 1, borderBottomColor: colors.border}
                            ]}
                            activeOpacity={0.7}
                            onPress={async () => {
                              setShowActionMenu(null);
                              await handleCopyConfig(config);
                            }}
                          >
                            <Icon name="content-copy" type="material" color={colors.success} size={14}/>
                            <Text style={[styles.actionMenuText, {color: colors.text}]}>复制</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionMenuItem}
                            activeOpacity={0.7}
                            onPress={async () => {
                              setShowActionMenu(null);
                              handleDeleteConfig(config.id, config.name);
                            }}
                          >
                            <Icon name="delete" type="material" color={colors.error} size={14}/>
                            <Text style={[styles.actionMenuText, {color: colors.text}]}>删除</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
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
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
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
  actionMenu: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionMenuText: {
    fontSize: 11,
    marginLeft: 8,
    lineHeight: 24,
  },
  // 新增样式
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rowLabel: {
    fontSize: 14,
    flex: 1,
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    marginLeft: 12,
    height: 40,
    justifyContent: 'center',
  },
  picker: {
    height: 40,
    width: '100%',
  },
  toolHint: {
    fontSize: 12,
    marginBottom: 12,
  },
  toolButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  toolButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  toolButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  toolLabel: {
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  saveButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AIConfigScreen;

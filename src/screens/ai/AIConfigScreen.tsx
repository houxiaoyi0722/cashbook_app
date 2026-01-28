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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@rneui/themed';
import DropDownPicker from 'react-native-dropdown-picker';
import { aiConfigService, AIConfig } from '../../services/AIConfigService';
import { useTheme, getColors } from '../../context/ThemeContext';

const AIConfigScreen: React.FC = () => {
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  // 存储所有配置列表
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  // 当前活动配置ID
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  // 当前正在编辑的配置ID（null表示新建配置）
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  // 当前编辑的配置数据
  const [editingConfig, setEditingConfig] = useState<Partial<AIConfig>>({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    maxTokens: 5000,
    temperature: 0,
    baseURL: 'https://api.openai.com/v1',
  });
  // 配置名称编辑状态
  const [editingName, setEditingName] = useState(false);
  // 确保 model 总是有值
  const modelValue = editingConfig.model || 'gpt-3.5-turbo';
  // 存储每个供应商的配置
  const [models, setModels] = useState<Array<{id: string, name: string, description?: string}>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [validationState, setValidationState] = useState<'none' | 'validating' | 'success' | 'error'>('none');
  // 添加模型加载错误状态
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  // 添加模型缓存状态
  const [cachedModels, setCachedModels] = useState<Record<string, Array<{id: string, name: string}>>>({});
  // 缓存键生成函数
  const getCacheKey = useCallback((provider: string, apiKey: string) => {
    return `${provider}_${apiKey.substring(0, 10)}`;
  }, []);

  // 下拉选择器状态
  const [open, setOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState<Array<{label: string, value: string}>>([]);

  useEffect(() => {
    loadConfig();
  }, []);

  // 当API Key或提供商变化时，触发模型加载（带防抖）
  useEffect(() => {
    if (editingConfig.apiKey && editingConfig.provider) {
      loadModels(); // 这会触发防抖加载
    } else {
      setModels([]);
      setModelLoadError(null);
    }

    // 清理函数
    return () => {};
  }, [editingConfig.apiKey, editingConfig.provider]);

  // 当models变化时，更新下拉选择器的items
  useEffect(() => {
    const items = models.map(model => ({
      label: model.name || model.id,
      value: model.id,
    }));
    // 合并用户自定义项
    const allItems = [...items];
    setDropdownItems(allItems);
  }, [models]);

  const loadConfig = async () => {
    try {
      // 获取所有配置
      const allConfigs = await aiConfigService.getAllConfigs();
      setConfigs(allConfigs);

      // 获取活动配置
      const activeConfig = await aiConfigService.getActiveConfig();

      if (activeConfig) {
        setActiveConfigId(activeConfig.id);
        setEditingConfigId(activeConfig.id);
        setEditingConfig(activeConfig);
      } else if (allConfigs.length > 0) {
        // 如果没有活动配置，但存在配置，使用第一个配置
        const firstConfig = allConfigs[0];
        setActiveConfigId(firstConfig.id);
        setEditingConfigId(firstConfig.id);
        setEditingConfig(firstConfig);
      } else {
        // 没有任何配置，创建一个默认配置
        const defaultConfig: Partial<AIConfig> = {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          maxTokens: 5000,
          temperature: 0,
          baseURL: 'https://api.openai.com/v1',
        };
        setEditingConfigId(null); // null表示新建配置
        setEditingConfig(defaultConfig);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const loadModels = useCallback(async (immediate = false) => {
    if (!editingConfig.apiKey || !editingConfig.provider) {
      setModels([]);
      setModelLoadError(null);
      return;
    }

    // 如果不是立即加载，则设置防抖延迟
    if (!immediate) {
      loadModels(true);
      return;
    }

    // 检查缓存
    const cacheKey = getCacheKey(editingConfig.provider, editingConfig.apiKey);
    const cached = cachedModels[cacheKey];

    if (cached && cached.length > 0) {
      console.log('使用缓存的模型列表');
      setModels(cached);
      setModelLoadError(null);

      // 检查当前选择的模型是否在缓存列表中
      if (cached.length > 0) {
        const currentModelExists = cached.some(model => model.id === modelValue);
        if (!currentModelExists) {
          setEditingConfig((prev: any) => ({ ...prev, model: cached[0].id }));
        }
      }
      return;
    }

    // 所有提供商（包括自定义提供商）都可以尝试从API获取模型
    // 自定义提供商使用 OpenAI 兼容的端点，应该能够获取模型列表
    setLoadingModels(true);
    setModelLoadError(null);

    try {
      // 传递当前配置给 getAvailableModels
      const availableModels = await aiConfigService.getAvailableModels(editingConfig);

      // 更新缓存
      if (availableModels.length > 0) {
        setCachedModels(prev => ({
          ...prev,
          [cacheKey]: availableModels,
        }));
      }

      setModels(availableModels);

      // 如果当前选择的模型不在新获取的列表中，且列表不为空，则选择第一个模型
      if (availableModels.length > 0) {
        const currentModelExists = availableModels.some(model => model.id === modelValue);
        if (!currentModelExists) {
          setEditingConfig((prev: any) => ({ ...prev, model: availableModels[0].id }));
        }
      }

      // 如果没有获取到模型，设置错误信息
      if (availableModels.length === 0) {
        setModelLoadError('无法获取模型列表，可能是API Key无效或网络问题');
      }
    } catch (error: any) {
      console.error('加载模型列表失败:', error);
      setModels([]);
      setModelLoadError(`加载失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingModels(false);
    }
  }, [editingConfig, modelValue, cachedModels, getCacheKey]);

  const [switchingConfig, setSwitchingConfig] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  const handleSave = async () => {
    // 添加确认对话框
    Alert.alert(
      '确认保存',
      `确定要${editingConfigId ? '更新' : '保存'}配置"${editingConfig.name || '未命名配置'}"吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            if (!editingConfig.apiKey?.trim()) {
              Alert.alert('错误', '请输入API Key');
              return;
            }

            // 确保配置有名称
            const configToSave = {
              ...editingConfig,
              name: editingConfig.name || `配置 ${new Date().toLocaleDateString()}`,
            };

            setLoading(true);
            try {
              let success;

              if (editingConfigId) {
                // 更新现有配置
                success = await aiConfigService.updateConfig(editingConfigId, configToSave);
                if (success) {
                  Alert.alert('成功', '配置已更新');
                }
              } else {
                // 创建新配置
                const newConfig = await aiConfigService.addConfig({
                  name: configToSave.name,
                  provider: configToSave.provider || 'openai',
                  apiKey: configToSave.apiKey || '',
                  model: configToSave.model || 'gpt-3.5-turbo',
                  baseURL: configToSave.baseURL,
                  maxTokens: configToSave.maxTokens,
                  temperature: configToSave.temperature,
                });

                // 设置为活动配置
                await aiConfigService.setActiveConfig(newConfig.id);
                success = true;
                Alert.alert('成功', '新配置已创建并设为活动配置');
              }

              if (success) {
                // 保存后重新加载配置
                await loadConfig();
              } else {
                Alert.alert('失败', '保存配置失败，请重试');
              }
            } catch (error: any) {
              Alert.alert('错误', error.message || '保存配置失败');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
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

  // 创建验证配置的辅助函数
  const createValidationConfig = (): AIConfig => {
    return {
      id: editingConfigId || 'temp-validation-id',
      name: editingConfig.name || '验证配置',
      provider: editingConfig.provider || 'openai',
      apiKey: editingConfig.apiKey || '',
      model: editingConfig.model || 'gpt-3.5-turbo',
      baseURL: editingConfig.baseURL,
      maxTokens: editingConfig.maxTokens,
      temperature: editingConfig.temperature,
    };
  };

  // 解析错误消息的辅助函数
  const parseErrorMessage = (error: any): string => {
    if (!error) {return '未知错误';}

    // 如果是字符串类型的错误
    if (typeof error === 'string') {
      return error;
    }

    // 如果是Error对象
    if (error.message) {
      return error.message;
    }

    // 如果是包含status的对象
    if (error.status) {
      switch (error.status) {
        case 401:
          return 'API Key无效或已过期';
        case 403:
          return '权限不足，请检查API Key的权限设置';
        case 404:
          return 'API端点不存在，请检查API地址';
        case 429:
          return '请求过于频繁，请稍后再试';
        case 500:
          return '服务器内部错误，请稍后再试';
        case 503:
          return '服务暂时不可用，请稍后再试';
        default:
          return `服务器错误 (${error.status})`;
      }
    }

    // 如果是包含statusText的对象
    if (error.statusText) {
      return error.statusText;
    }

    // 默认返回
    return '验证过程中发生未知错误';
  };

  const handleValidate = async () => {
    if (!editingConfig.apiKey?.trim()) {
      Alert.alert('验证提示', '请输入API Key进行验证');
      return;
    }

    if (!editingConfig.provider) {
      Alert.alert('验证提示', '请选择AI服务商');
      return;
    }

    if (!editingConfig.model?.trim()) {
      Alert.alert('验证提示', '请选择或输入模型名称');
      return;
    }

    setValidating(true);
    setValidationState('validating');

    try {
      // 使用辅助函数创建验证配置
      const validationConfig = createValidationConfig();

      // 显示验证开始提示
      Alert.alert(
        '验证开始',
        `正在验证 ${validationConfig.provider} 配置...\n\n` +
        `模型: ${validationConfig.model}\n` +
        `API地址: ${validationConfig.baseURL || '使用默认地址'}`,
        [{ text: '确定' }]
      );

      // 执行验证
      const isValid = await aiConfigService.validateConfig(validationConfig);

      if (isValid) {
        setValidationState('success');

        // 验证成功后自动加载模型列表
        await loadModels();

        // 显示成功消息
        Alert.alert(
          '验证成功',
          `✅ ${validationConfig.provider} 配置验证通过！\n\n` +
          'API Key: 有效\n' +
          `模型: ${validationConfig.model}\n` +
          `服务商: ${validationConfig.provider}`,
          [{ text: '确定' }]
        );

        // 如果验证成功且是新建配置，自动填充名称
        if (!editingConfig.name && !editingConfigId) {
          setEditingConfig(prev => ({
            ...prev,
            name: `${validationConfig.provider} 配置`,
          }));
        }
      } else {
        setValidationState('error');

        // 显示详细的错误信息
        Alert.alert(
          '验证失败',
          `❌ ${validationConfig.provider} 配置验证失败\n\n` +
          '可能的原因：\n' +
          '• API Key 无效或已过期\n' +
          '• 模型名称不正确\n' +
          '• API 地址配置错误\n' +
          '• 网络连接问题\n\n' +
          '请检查配置后重试。',
          [{ text: '确定' }]
        );
      }
    } catch (error: any) {
      setValidationState('error');

      // 解析并显示详细的错误信息
      const errorMessage = parseErrorMessage(error);
      console.error('验证失败详情:', error);

      Alert.alert(
        '验证异常',
        '❌ 验证过程中发生错误\n\n' +
        `错误信息: ${errorMessage}\n\n` +
        '建议操作：\n' +
        '1. 检查网络连接\n' +
        '2. 确认API Key权限\n' +
        '3. 验证API地址是否正确\n' +
        '4. 稍后重试',
        [{ text: '确定' }]
      );
    } finally {
      setValidating(false);

      // 3秒后重置验证状态（如果是错误状态）
      if (validationState === 'error') {
        setTimeout(() => {
          setValidationState('none');
        }, 3000);
      }
    }
  };

  const handleClear = async () => {
    Alert.alert(
      '确认',
      '确定要清除当前编辑的配置吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            const currentProvider = editingConfig.provider || 'openai';

            // 为当前供应商设置默认配置
            let defaultBaseURL = '';
            let defaultModel = '';
            switch (currentProvider) {
              case 'openai':
                defaultBaseURL = 'https://api.openai.com/v1';
                defaultModel = 'gpt-3.5-turbo';
                break;
              case 'anthropic':
                defaultBaseURL = 'https://api.anthropic.com/v1';
                defaultModel = 'claude-3-haiku-20240307';
                break;
              case 'google':
                defaultBaseURL = 'https://generativelanguage.googleapis.com/v1';
                defaultModel = 'gemini-pro';
                break;
              case 'deepseek':
                defaultBaseURL = 'https://api.deepseek.com';
                defaultModel = 'deepseek-chat';
                break;
              case 'custom':
                defaultBaseURL = '';
                defaultModel = '';
                break;
            }

            // 确保 model 有值
            const modelToUse = defaultModel || 'gpt-3.5-turbo';

            // 更新当前配置状态
            setEditingConfig({
              ...editingConfig,
              apiKey: '',
              model: modelToUse,
              baseURL: defaultBaseURL,
              maxTokens: 5000,
              temperature: 0,
            });

            // 重置验证状态和模型列表
            setValidationState('none');
            setModels([]);

            Alert.alert('已清除', '当前配置已清除');
          },
        },
      ]
    );
  };

  const handleProviderSelect = (provider: AIConfig['provider']) => {
    // 为每个提供商设置默认的 baseURL
    let defaultBaseURL = '';
    switch (provider) {
      case 'openai':
        defaultBaseURL = 'https://api.openai.com/v1';
        break;
      case 'anthropic':
        defaultBaseURL = 'https://api.anthropic.com/v1';
        break;
      case 'google':
        defaultBaseURL = 'https://generativelanguage.googleapis.com/v1';
        break;
      case 'deepseek':
        defaultBaseURL = 'https://api.deepseek.com';
        break;
      case 'custom':
        defaultBaseURL = '';
        break;
    }

    setEditingConfig({
      ...editingConfig,
      provider,
      baseURL: defaultBaseURL,
      model: getDefaultModelForProvider(provider),
      // 保留现有的API Key，因为用户可能只是切换提供商但想使用相同的密钥
      // 如果用户想要清除，可以使用清除按钮
    });

    // 切换服务商时重置验证状态
    setValidationState('none');
    setModels([]);
    // 重置加载状态，取消任何正在进行的模型加载
    setLoadingModels(false);
  };

  // 辅助函数：获取默认模型
  const getDefaultModelForProvider = (provider: AIConfig['provider']): string => {
    switch (provider) {
      case 'deepseek':
        return 'deepseek-chat';
      case 'openai':
        return 'gpt-3.5-turbo';
      case 'anthropic':
        return 'claude-3-haiku-20240307';
      case 'google':
        return 'gemini-pro';
      case 'custom':
        return '';
      default:
        return 'gpt-3.5-turbo';
    }
  };

  const handleModelSelect = (modelId: string | number | boolean | null | undefined) => {
    // 只处理字符串类型
    if (typeof modelId === 'string') {
      setEditingConfig((prev: Partial<AIConfig>) => ({ ...prev, model: modelId }));
    } else if (typeof modelId === 'number') {
      setEditingConfig((prev: Partial<AIConfig>) => ({ ...prev, model: modelId.toString() }));
    } else if (typeof modelId === 'boolean') {
      setEditingConfig((prev: Partial<AIConfig>) => ({ ...prev, model: modelId.toString() }));
    } else {
      // 对于 null 或 undefined，使用默认值
      setEditingConfig((prev: Partial<AIConfig>) => ({ ...prev, model: 'gpt-3.5-turbo' }));
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 配置管理部分 */}
        <View style={styles.section}>
          <View style={styles.configHeader}>
            <Text style={[styles.label, {color: colors.text}]}>配置管理</Text>
            <TouchableOpacity
              style={[styles.newConfigButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                // 创建新配置
                const newConfig: Partial<AIConfig> = {
                  provider: 'openai',
                  model: 'gpt-3.5-turbo',
                  maxTokens: 5000,
                  temperature: 0,
                  baseURL: 'https://api.openai.com/v1',
                  name: `配置 ${configs.length + 1}`,
                  apiKey: '',
                };
                setEditingConfigId(null);
                setEditingConfig(newConfig);
                setValidationState('none');
                setModels([]);
              }}
            >
              <Icon name="add" type="material" color="#fff" size={20} />
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
                      shadowOffset: { width: 0, height: 2 },
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
                          <TextInput
                            style={[styles.configNameInput, {color: colors.text, borderColor: colors.primary}]}
                            value={editingConfig.name}
                            onChangeText={(text) => setEditingConfig(prev => ({...prev, name: text}))}
                            onBlur={() => setEditingName(false)}
                            autoFocus
                          />
                        ) : (
                          <TouchableOpacity
                            onPress={() => {
                              setEditingConfigId(config.id);
                              setEditingConfig(config);
                              setValidationState('none');
                              setModels([]);
                            }}
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
                          <Icon name="access-time" type="material" color={colors.hint} size={10} />
                          <Text style={[styles.timeInfoText, {color: colors.hint}]}>
                            创建: {formatTime(config.createdAt)}
                          </Text>
                        </View>
                        <View style={styles.timeInfoItem}>
                          <Icon name="update" type="material" color={colors.hint} size={10} />
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
                        <Icon name="more-vert" type="material" color={colors.secondaryText} size={20} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* API Key状态 */}
                  <View style={styles.configStatusRow}>
                    {config.apiKey ? (
                      <View style={[styles.statusBadge, {backgroundColor: colors.success + '20'}]}>
                        <Icon name="key" type="material" color={colors.success} size={12} />
                        <Text style={[styles.statusBadgeText, {color: colors.success}]}>
                          API Key已配置
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, {backgroundColor: colors.warning + '20'}]}>
                        <Icon name="warning" type="material" color={colors.warning} size={12} />
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
                        <ActivityIndicator size="small" color={colors.primary} />
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
                            { color: activeConfigId === config.id ? colors.success : colors.primary },
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
                          setEditingName(true);
                          setShowActionMenu(null);
                        }}
                      >
                        <Icon name="edit" type="material" color={colors.primary} size={16} />
                        <Text style={[styles.actionMenuText, {color: colors.text}]}>重命名</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionMenuItem}
                        onPress={async () => {
                          setShowActionMenu(null);
                          Alert.alert(
                            '设为活动配置',
                            `确定要将"${config.name}"设为活动配置吗？`,
                            [
                              { text: '取消', style: 'cancel' },
                              {
                                text: '确定',
                                onPress: async () => {
                                  await handleSwitchConfig(config.id);
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Icon name="check-circle" type="material" color={colors.success} size={16} />
                        <Text style={[styles.actionMenuText, {color: colors.text}]}>设为活动</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionMenuItem}
                        onPress={async () => {
                          setShowActionMenu(null);
                          Alert.alert(
                            '删除配置',
                            `确定要删除"${config.name}"吗？`,
                            [
                              { text: '取消', style: 'cancel' },
                              {
                                text: '确定',
                                onPress: async () => {
                                  const success = await aiConfigService.deleteConfig(config.id);
                                  if (success) {
                                    Alert.alert('成功', '配置已删除');
                                    await loadConfig();
                                    // 如果删除的是当前编辑的配置，切换到新建状态
                                    if (editingConfigId === config.id) {
                                      setEditingConfigId(null);
                                      setEditingConfig({
                                        provider: 'openai',
                                        model: 'gpt-3.5-turbo',
                                        maxTokens: 5000,
                                        temperature: 0,
                                        baseURL: 'https://api.openai.com/v1',
                                        name: `配置 ${configs.length}`,
                                        apiKey: '',
                                      });
                                    }
                                  } else {
                                    Alert.alert('失败', '删除配置失败');
                                  }
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Icon name="delete" type="material" color={colors.error} size={16} />
                        <Text style={[styles.actionMenuText, {color: colors.text}]}>删除</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 当前编辑配置标题 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: colors.text}]}>
            {editingConfigId ? '编辑配置' : '新建配置'}
            {editingConfigId && editingConfig.name && `: ${editingConfig.name}`}
          </Text>
        </View>

        {/* 配置名称 */}
        <View style={styles.section}>
          <Text style={[styles.label, {color: colors.text}]}>配置名称</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={editingConfig.name}
            onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, name: text }))}
            placeholder="输入配置名称"
            placeholderTextColor={colors.hint}
          />
        </View>

        {/* 服务商选择 */}
        <View style={styles.section}>
          <Text style={[styles.label, {color: colors.text}]}>AI服务商</Text>
          <View style={styles.providerContainer}>
            {[
              { id: 'openai' as const, name: 'OpenAI' },
              { id: 'anthropic' as const, name: 'Anthropic' },
              { id: 'google' as const, name: 'Google' },
              { id: 'deepseek' as const, name: 'DeepSeek' },
              { id: 'custom' as const, name: '自定义(OpenAI兼容)' },
            ].map((provider) => (
              <TouchableOpacity
                key={provider.id}
                style={[
                  styles.providerButton,
                  { backgroundColor: colors.card },
                  editingConfig.provider === provider.id && [
                    styles.providerButtonActive,
                    { backgroundColor: colors.primary },
                  ],
                ]}
                onPress={() => handleProviderSelect(provider.id)}
              >
                <Text style={[
                  styles.providerText,
                  { color: colors.text },
                  editingConfig.provider === provider.id && styles.providerTextActive,
                ]}>
                  {provider.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <View style={styles.labelContainer}>
            <Text style={[styles.label, {color: colors.text}]}>API Key *</Text>
            {validationState !== 'none' && (
              <View style={[
                styles.validationStatusBadge,
                {
                  backgroundColor: validationState === 'validating' ? colors.warning + '20' :
                                  validationState === 'success' ? colors.success + '20' :
                                  colors.error + '20',
                },
              ]}>
                <Text style={[
                  styles.validationStatusText,
                  {
                    color: validationState === 'validating' ? colors.warning :
                           validationState === 'success' ? colors.success :
                           colors.error,
                  },
                ]}>
                  {validationState === 'validating' ? '验证中...' :
                   validationState === 'success' ? '验证成功' :
                   '验证失败'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  color: colors.text,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
                validating && {
                  borderColor: colors.warning,
                  borderWidth: 2,
                },
                validationState === 'success' && {
                  borderColor: colors.success,
                  borderWidth: 2,
                },
                validationState === 'error' && {
                  borderColor: colors.error,
                  borderWidth: 2,
                },
              ]}
              value={editingConfig.apiKey}
              onChangeText={(text) => {
                setEditingConfig((prev: any) => ({ ...prev, apiKey: text }));
                // 如果API Key发生变化，重置验证状态
                if (validationState !== 'none') {
                  setValidationState('none');
                }
              }}
              placeholder={getApiKeyPlaceholder(editingConfig.provider)}
              placeholderTextColor={colors.hint}
              secureTextEntry
              multiline
              numberOfLines={2}
              editable={!validating}
            />
            {validating && (
              <View style={styles.inputLoading}>
                <ActivityIndicator size="small" color={colors.warning} />
              </View>
            )}
            {validationState === 'success' && !validating && (
              <View style={styles.inputSuccess}>
                <Icon name="check-circle" type="material" color={colors.success} size={20} />
              </View>
            )}
            {validationState === 'error' && !validating && (
              <View style={styles.inputError}>
                <Icon name="error" type="material" color={colors.error} size={20} />
              </View>
            )}
          </View>
          <Text style={[styles.helperText, {color: colors.secondaryText}]}>
            {getApiKeyHelperText(editingConfig.provider)}
          </Text>

          {/* 验证状态详细提示 */}
          {validationState === 'validating' && (
            <View style={[styles.validationDetailContainer, {backgroundColor: colors.warning + '10'}]}>
              <ActivityIndicator size="small" color={colors.warning} style={styles.validationDetailIcon} />
              <Text style={[styles.validationDetailText, {color: colors.warning}]}>
                正在验证API Key，请稍候...
              </Text>
            </View>
          )}
          {validationState === 'error' && (
            <View style={[styles.validationDetailContainer, {backgroundColor: colors.error + '10'}]}>
              <Icon name="error-outline" type="material" color={colors.error} size={16} style={styles.validationDetailIcon} />
              <Text style={[styles.validationDetailText, {color: colors.error}]}>
                API Key验证失败，请检查：
                1. API Key是否正确
                2. 服务商选择是否匹配
                3. 网络连接是否正常
              </Text>
            </View>
          )}
          {validationState === 'success' && (
            <View style={[styles.validationDetailContainer, {backgroundColor: colors.success + '10'}]}>
              <Icon name="check-circle-outline" type="material" color={colors.success} size={16} style={styles.validationDetailIcon} />
              <Text style={[styles.validationDetailText, {color: colors.success}]}>
                API Key验证成功！当前配置可用
              </Text>
            </View>
          )}
        </View>

        {/* 模型选择 */}
        <View style={styles.section}>
          <View style={styles.modelHeader}>
            <Text style={[styles.label, {color: colors.text}]}>模型</Text>
            {editingConfig.apiKey && (
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: colors.card }]}
                onPress={() => loadModels(true)} // 立即加载
                disabled={loadingModels}
              >
                {loadingModels ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name="refresh" type="material" color={colors.primary} size={18} />
                )}
                <Text style={[styles.refreshText, {color: colors.primary}]}>
                  {loadingModels ? '加载中...' : '刷新'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingModels ? (
            <View style={[styles.loadingContainer, {backgroundColor: colors.card}]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, {color: colors.secondaryText}]}>
                正在加载模型列表...
              </Text>
            </View>
          ) : (
            <>
              {/* 模型选择下拉框 */}
              <View style={styles.dropdownContainer}>
                <DropDownPicker
                  open={open}
                  setOpen={setOpen}
                  value={modelValue}
                  setValue={(callback) => {
                    const newValue = typeof callback === 'function' ? callback(modelValue) : callback;
                    if (newValue !== undefined) {
                      handleModelSelect(newValue);
                    }
                  }}
                  items={dropdownItems}
                  setItems={setDropdownItems}
                  searchable={true}
                  searchPlaceholder="输入关键词搜索模型..."
                  placeholder={models.length > 0 ? '选择模型' : '正在加载模型...'}
                  listMode="MODAL"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                  }}
                  style={[
                    styles.dropdown,
                    {
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    },
                  ]}
                  dropDownContainerStyle={[
                    styles.dropdownList,
                    {
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                      maxHeight: 400,
                    },
                  ]}
                  textStyle={{
                    color: colors.text,
                    fontSize: 16,
                  }}
                  searchTextInputStyle={{
                    color: colors.text,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  }}
                  placeholderStyle={{
                    color: colors.hint,
                  }}
                  selectedItemLabelStyle={{
                    fontWeight: '600',
                    color: colors.primary,
                  }}
                  selectedItemContainerStyle={{
                    backgroundColor: colors.primary + '20',
                  }}
                  searchPlaceholderTextColor={colors.hint}
                  onChangeValue={(value) => {
                    if (value) {
                      handleModelSelect(value);
                    }
                  }}
                  onSelectItem={(item) => {
                    if (item.value) {
                      handleModelSelect(item.value);
                    }
                  }}
                  disabled={loadingModels || models.length === 0}
                  loading={loadingModels}
                  listItemLabelStyle={{
                    color: colors.text,
                  }}
                  listItemContainerStyle={{
                    paddingVertical: 8,
                  }}
                  modalTitle="选择模型"
                  modalAnimationType="slide"
                  modalContentContainerStyle={{
                    backgroundColor: colors.input,
                  }}
                  categorySelectable={false}
                  closeAfterSelecting={true}
                  closeOnBackPressed={true}
                  showTickIcon={true}
                  extendableBadgeContainer={true}
                />
              </View>

              {/* 模型名称输入字段（始终显示） */}
              <View style={styles.manualInputContainer}>
                <Text style={[styles.manualInputLabel, {color: colors.secondaryText}]}>
                  {models.length > 0 ? '或手动输入模型名称：' : '手动输入模型名称：'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.marginTop,
                    {
                      backgroundColor: colors.input,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={modelValue}
                  onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, model: text }))}
                  placeholder={models.length > 0 ? '输入模型ID' : '无法获取模型列表，请手动输入模型名称'}
                  placeholderTextColor={colors.hint}
                />
              </View>
            </>
          )}

          {/* 模型加载错误提示 */}
          {modelLoadError && !loadingModels && editingConfig.apiKey && (
            <View style={[styles.errorContainer, {backgroundColor: colors.error + '10'}]}>
              <Icon name="error-outline" type="material" color={colors.error} size={20} />
              <View style={styles.errorTextContainer}>
                <Text style={[styles.errorTitle, {color: colors.error}]}>
                  加载模型列表失败
                </Text>
                <Text style={[styles.errorMessage, {color: colors.secondaryText}]}>
                  {modelLoadError}
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, {backgroundColor: colors.error}]}
                  onPress={() => loadModels(true)}
                >
                  <Text style={styles.retryButtonText}>重试</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {models.length === 0 && !loadingModels && !modelLoadError && editingConfig.apiKey && (
            <View style={[styles.noModelsContainer, {backgroundColor: colors.card}]}>
              <Icon name="info" type="material" color={colors.warning} size={24} />
              <Text style={[styles.noModelsText, {color: colors.warning}]}>
                无法获取模型列表
              </Text>
              <Text style={[styles.noModelsSubtext, {color: colors.secondaryText}]}>
                请检查API Key是否正确，或手动输入模型名称
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, {backgroundColor: colors.primary, marginTop: 8}]}
                onPress={() => loadModels(true)}
              >
                <Text style={styles.retryButtonText}>重新加载</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* API地址 - 始终可见 */}
        <View style={styles.section}>
          <Text style={[styles.label, {color: colors.text}]}>API地址</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={editingConfig.baseURL}
            onChangeText={(text) => setEditingConfig((prev: any) => ({ ...prev, baseURL: text }))}
            placeholder={getBaseURLPlaceholder(editingConfig.provider)}
            placeholderTextColor={colors.hint}
          />
          <Text style={[styles.helperText, {color: colors.secondaryText}]}>
            {getBaseURLHelperText(editingConfig.provider)}
          </Text>
        </View>

        {/* 高级设置开关 */}
        <TouchableOpacity
          style={[
            styles.advancedToggle,
            { backgroundColor: colors.card },
          ]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Icon
            name={showAdvanced ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            type="material"
            color={colors.primary}
            size={24}
          />
          <Text style={[styles.advancedToggleText, {color: colors.primary}]}>
            {showAdvanced ? '隐藏' : '显示'}高级设置
          </Text>
        </TouchableOpacity>

        {/* 高级设置 */}
        {showAdvanced && (
          <>
            <View style={styles.section}>
              <Text style={[styles.label, {color: colors.text}]}>最大令牌数</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.input,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={editingConfig.maxTokens?.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text);
                  if (!isNaN(num) && num > 0) {
                    setEditingConfig((prev: any) => ({ ...prev, maxTokens: num }));
                  } else if (text === '') {
                    setEditingConfig((prev: any) => ({ ...prev, maxTokens: undefined }));
                  }
                }}
                placeholder="5000"
                placeholderTextColor={colors.hint}
                keyboardType="numeric"
              />
              <Text style={[styles.helperText, {color: colors.secondaryText}]}>
                控制AI回复的最大长度，值越大回复越详细
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, {color: colors.text}]}>温度 (0-2)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.input,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={editingConfig.temperature?.toString()}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  if (!isNaN(num) && num >= 0 && num <= 2) {
                    setEditingConfig((prev: any) => ({ ...prev, temperature: num }));
                  } else if (text === '') {
                    setEditingConfig((prev: any) => ({ ...prev, temperature: undefined }));
                  }
                }}
                placeholder="0"
                placeholderTextColor={colors.hint}
                keyboardType="numeric"
              />
              <Text style={[styles.helperText, {color: colors.secondaryText}]}>
                数值越高，回答越随机；数值越低，回答越确定
              </Text>
            </View>
          </>
        )}

        {/* 操作按钮 */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.validateButton,
              { backgroundColor: colors.warning },
            ]}
            onPress={handleValidate}
            disabled={validating}
          >
            {validating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>参数验证</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.clearButton,
              { backgroundColor: colors.error },
            ]}
            onPress={handleClear}
          >
            <Text style={styles.buttonText}>清除配置</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.saveButton,
              { backgroundColor: colors.success },
            ]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>保存配置</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 使用说明 */}
        <View style={[styles.infoContainer, {backgroundColor: colors.card}]}>
          <Text style={[styles.infoTitle, {color: colors.primary}]}>使用说明：</Text>
          <View style={styles.infoItem}>
            <Icon name="info" type="material" color={colors.success} size={16} />
            <Text style={[styles.infoText, {color: colors.text}]}>
              前往模型官网注册并获取API Key
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="info" type="material" color={colors.success} size={16} />
            <Text style={[styles.infoText, {color: colors.text}]}>
              输入API Key并选择模型
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="info" type="material" color={colors.success} size={16} />
            <Text style={[styles.infoText, {color: colors.text}]}>
              点击"验证API Key"确认有效
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="info" type="material" color={colors.success} size={16} />
            <Text style={[styles.infoText, {color: colors.text}]}>
              保存配置后即可使用AI助手
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// 辅助函数：获取API Key占位符文本
const getApiKeyPlaceholder = (provider?: string) => {
  switch (provider) {
    case 'openai': return '输入OpenAI API Key';
    case 'anthropic': return '输入Anthropic API Key';
    case 'google': return '输入Google API Key';
    case 'deepseek': return '输入DeepSeek API Key';
    case 'custom': return '输入自定义API Key';
    default: return '输入API Key';
  }
};

// 辅助函数：获取API Key帮助文本
const getApiKeyHelperText = (provider?: string) => {
  switch (provider) {
    case 'openai': return '可以在 OpenAI 官网获取API Key';
    case 'anthropic': return '可以在 Anthropic 官网获取API Key';
    case 'google': return '可以在 Google AI Studio 获取API Key';
    case 'deepseek': return '可以在 DeepSeek 官网获取API Key';
    case 'custom': return '输入自定义服务的API Key';
    default: return '请输入API Key';
  }
};

// 辅助函数：获取Base URL占位符文本
const getBaseURLPlaceholder = (provider?: string) => {
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1';
    case 'anthropic': return 'https://api.anthropic.com/v1';
    case 'google': return 'https://generativelanguage.googleapis.com/v1';
    case 'deepseek': return 'https://api.deepseek.com';
    case 'custom': return 'https://api.example.com/v1';
    default: return '输入API地址';
  }
};

// 辅助函数：获取Base URL帮助文本
const getBaseURLHelperText = (provider?: string) => {
  switch (provider) {
    case 'openai': return 'OpenAI官方API地址：https://api.openai.com/v1';
    case 'anthropic': return 'Anthropic官方API地址：https://api.anthropic.com/v1';
    case 'google': return 'Google官方API地址：https://generativelanguage.googleapis.com/v1';
    case 'deepseek': return 'DeepSeek官方API地址：https://api.deepseek.com';
    case 'custom': return '输入自定义服务的API地址';
    default: return '请输入API地址';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  configTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  timeInfoContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 8,
  },
  timeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeInfoText: {
    fontSize: 10,
  },
  configStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  switchConfigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  switchConfigText: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreActionButton: {
    padding: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  actionMenuText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  validationStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  validationStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  validationDetailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  validationDetailIcon: {
    marginRight: 8,
  },
  validationDetailText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  newConfigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  newConfigButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  noConfigsContainer: {
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  noConfigsText: {
    fontSize: 14,
  },
  configsList: {
    gap: 8,
  },
  configItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  configItemActive: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  configItemActiveBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  configItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  configItemInfo: {
    flex: 1,
  },
  configNameTouchable: {
    paddingVertical: 2,
  },
  configName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  configNameInput: {
    fontSize: 16,
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingVertical: 2,
    marginBottom: 2,
  },
  configProvider: {
    fontSize: 12,
  },
  configItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  configActionButton: {
    padding: 4,
  },
  configApiKeyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  configApiKeyText: {
    fontSize: 11,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  dropdownContainer: {
    marginBottom: 12,
    zIndex: 1000, // 确保下拉框在其他元素之上
    minHeight: 50,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 50,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 300,
    overflow: 'scroll',
    zIndex: 1000,
    elevation: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    paddingRight: 40, // 为图标留出空间
  },
  inputLoading: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  inputSuccess: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  inputError: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  successText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  providerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  providerButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 4,
    flex: 1,
    minWidth: '22%',
    alignItems: 'center',
  },
  providerButtonActive: {},
  providerText: {
    fontSize: 14,
  },
  providerTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 12,
  },
  modelCard: {
    width: '48%',
    marginHorizontal: '1%',
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modelCardActive: {
    borderWidth: 1,
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  modelId: {
    fontSize: 11,
    marginBottom: 4,
  },
  modelDesc: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  manualInputContainer: {
    marginTop: 12,
  },
  manualInputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  marginTop: {
    marginTop: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  noModelsContainer: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  noModelsText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  noModelsSubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  advancedToggleText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 30,
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  validateButton: {},
  clearButton: {},
  saveButton: {},
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  infoContainer: {
    padding: 16,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
});

export default AIConfigScreen;

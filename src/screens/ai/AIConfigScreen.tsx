import React, { useState, useEffect } from 'react';
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
  const [config, setConfig] = useState<Partial<AIConfig>>({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    maxTokens: 5000,
    temperature: 0,
    baseURL: 'https://api.openai.com/v1',
  });
  // 存储每个供应商的配置
  const [models, setModels] = useState<Array<{id: string, name: string, description?: string}>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [validationState, setValidationState] = useState<'none' | 'validating' | 'success' | 'error'>('none');

  // 下拉选择器状态
  const [open, setOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState<Array<{label: string, value: string}>>([]);

  useEffect(() => {
    loadConfig();
  }, []);

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
      const savedConfig = await aiConfigService.getConfig();
      if (savedConfig) {
        setConfig(savedConfig);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const loadModels = async () => {
    if (!config.apiKey || !config.provider) {
      setModels([]);
      return;
    }

    // 所有提供商（包括自定义提供商）都可以尝试从API获取模型
    // 自定义提供商使用 OpenAI 兼容的端点，应该能够获取模型列表
    setLoadingModels(true);
    try {
      // 传递当前配置给 getAvailableModels
      const availableModels = await aiConfigService.getAvailableModels(config);
      setModels(availableModels);

      // 如果当前选择的模型不在新获取的列表中，且列表不为空，则选择第一个模型
      if (availableModels.length > 0) {
        const currentModelExists = availableModels.some(model => model.id === config.model);
        if (!currentModelExists) {
          setConfig((prev: any) => ({ ...prev, model: availableModels[0].id }));
        }
      }
    } catch (error) {
      console.error('加载模型列表失败:', error);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    if (!config.apiKey?.trim()) {
      Alert.alert('错误', '请输入API Key');
      return;
    }

    setLoading(true);
    try {
      const success = await aiConfigService.saveConfig(config);
      if (success) {
        Alert.alert('成功', 'AI配置已保存');
      } else {
        Alert.alert('失败', '保存配置失败，请重试');
      }
    } catch (error: any) {
      Alert.alert('错误', error.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!config.apiKey?.trim()) {
      Alert.alert('提示', '请输入API Key进行验证');
      return;
    }

    setValidating(true);
    setValidationState('validating');
    try {
      // 创建一个完整的 AIConfig 对象用于验证
      const validationConfig: AIConfig = {
        provider: config.provider || 'openai',
        apiKey: config.apiKey,
        model: config.model || 'gpt-3.5-turbo',
        baseURL: config.baseURL,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      };
      const isValid = await aiConfigService.validateConfig(validationConfig);
      if (isValid) {
        setValidationState('success');
        // 验证成功后自动加载模型列表
        loadModels();
      } else {
        setValidationState('error');
      }
    } catch (error: any) {
      setValidationState('error');
      console.error('验证失败:', error);
    } finally {
      setValidating(false);
    }
  };

  const handleClear = async () => {
    Alert.alert(
      '确认',
      '确定要清除当前供应商的配置吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            const currentProvider = config.provider || 'openai';

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

            // 更新当前配置状态
            setConfig({
              provider: currentProvider,
              apiKey: '',
              model: defaultModel,
              baseURL: defaultBaseURL,
              maxTokens: 5000,
              temperature: 0,
            });

            // 同时清除 AsyncStorage 中的配置
            await aiConfigService.clearConfig();

            // 重置验证状态和模型列表
            setValidationState('none');
            setModels([]);

            Alert.alert('已清除', '当前供应商配置已清除');
          },
        },
      ]
    );
  };

  const handleProviderSelect = (provider: AIConfig['provider']) => {
    // 使用函数式更新来确保获取最新的 providerConfigs
    // 1. 保存当前供应商的配置到providerConfigs
    const updatedProviderConfigs = {
      [config.provider || 'openai']: {
        ...config,
        provider: config.provider || 'openai',
      },
    };

    // 2. 检查要切换到的供应商是否有已保存的配置
    const savedProviderConfig = updatedProviderConfigs[provider];

    if (savedProviderConfig) {
      // 如果有，则恢复该供应商的配置（包括API Key）
      setConfig(savedProviderConfig);
    } else {
      // 如果没有，则使用默认配置
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

      setConfig({
        provider,
        // 总是更新为新的默认 baseURL
        baseURL: defaultBaseURL,
        // 为不同服务商设置默认模型
        model: provider === 'deepseek' ? 'deepseek-chat' :
          provider === 'openai' ? 'gpt-3.5-turbo' :
            provider === 'anthropic' ? 'claude-3-haiku-20240307' :
              provider === 'google' ? 'gemini-pro' : '',
        // 只有在没有保存配置时才清空API Key
        apiKey: '',
        maxTokens: 5000,
        temperature: 0,
      });
    }
    // 切换服务商时重置验证状态
    setValidationState('none');
    setModels([]);
    // 重置加载状态，取消任何正在进行的模型加载
    setLoadingModels(false);
  };

  const handleModelSelect = (modelId: string | number | boolean | null | undefined) => {
    // 只处理字符串类型
    if (typeof modelId !== 'string') {
      return;
    }
    setConfig((prev: Partial<AIConfig>) => ({ ...prev, model: modelId }));
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

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
                  config.provider === provider.id && [
                    styles.providerButtonActive,
                    { backgroundColor: colors.primary },
                  ],
                ]}
                onPress={() => handleProviderSelect(provider.id)}
              >
                <Text style={[
                  styles.providerText,
                  { color: colors.text },
                  config.provider === provider.id && styles.providerTextActive,
                ]}>
                  {provider.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <Text style={[styles.label, {color: colors.text}]}>API Key *</Text>
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
                validating && { borderColor: colors.warning },
                validationState === 'success' && { borderColor: colors.success },
                validationState === 'error' && { borderColor: colors.error },
              ]}
              value={config.apiKey}
              onChangeText={(text) => {
                setConfig((prev: any) => ({ ...prev, apiKey: text }));
                setValidationState('none'); // 重置验证状态
              }}
              placeholder={getApiKeyPlaceholder(config.provider)}
              placeholderTextColor={colors.hint}
              secureTextEntry
              multiline
              numberOfLines={2}
              editable={!validating}
            />
            {validating && (
              <View style={styles.inputLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            {validationState === 'success' && (
              <View style={styles.inputSuccess}>
                <Icon name="check-circle" type="material" color={colors.success} size={20} />
              </View>
            )}
            {validationState === 'error' && (
              <View style={styles.inputError}>
                <Icon name="error" type="material" color={colors.error} size={20} />
              </View>
            )}
          </View>
          <Text style={[styles.helperText, {color: colors.secondaryText}]}>
            {getApiKeyHelperText(config.provider)}
          </Text>
          {validationState === 'error' && (
            <Text style={[styles.errorText, {color: colors.error}]}>
              API Key验证失败，请检查是否正确
            </Text>
          )}
          {validationState === 'success' && (
            <Text style={[styles.successText, {color: colors.success}]}>
              API Key验证成功！
            </Text>
          )}
        </View>

        {/* 模型选择 */}
        <View style={styles.section}>
          <View style={styles.modelHeader}>
            <Text style={[styles.label, {color: colors.text}]}>模型</Text>
            {config.apiKey && (
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: colors.card }]}
                onPress={loadModels}
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
                  value={config.model}
                  setValue={(callback) => {
                    const newValue = typeof callback === 'function' ? callback(config.model) : callback;
                    if (newValue !== undefined) {
                      handleModelSelect(newValue);
                    }
                  }}
                  items={dropdownItems}
                  setItems={setDropdownItems}
                  searchable={true}
                  searchPlaceholder="搜索模型..."
                  placeholder="选择模型"
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
                  searchIconStyle={{
                    tintColor: colors.text,
                  }}
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
                  disabled={loadingModels}
                  loading={loadingModels}
                  listItemLabelStyle={{
                    color: colors.text,
                  }}
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
                  value={config.model}
                  onChangeText={(text) => setConfig((prev: any) => ({ ...prev, model: text }))}
                  placeholder={models.length > 0 ? '输入模型ID' : '无法获取模型列表，请手动输入模型名称'}
                  placeholderTextColor={colors.hint}
                />
              </View>
            </>
          )}

          {models.length === 0 && !loadingModels && config.apiKey && (
            <View style={[styles.noModelsContainer, {backgroundColor: colors.card}]}>
              <Icon name="info" type="material" color={colors.warning} size={24} />
              <Text style={[styles.noModelsText, {color: colors.warning}]}>
                无法获取模型列表
              </Text>
              <Text style={[styles.noModelsSubtext, {color: colors.secondaryText}]}>
                请检查API Key是否正确，或手动输入模型名称
              </Text>
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
            value={config.baseURL}
            onChangeText={(text) => setConfig((prev: any) => ({ ...prev, baseURL: text }))}
            placeholder={getBaseURLPlaceholder(config.provider)}
            placeholderTextColor={colors.hint}
          />
          <Text style={[styles.helperText, {color: colors.secondaryText}]}>
            {getBaseURLHelperText(config.provider)}
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
                value={config.maxTokens?.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text);
                  if (!isNaN(num) && num > 0) {
                    setConfig((prev: any) => ({ ...prev, maxTokens: num }));
                  } else if (text === '') {
                    setConfig((prev: any) => ({ ...prev, maxTokens: undefined }));
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
                value={config.temperature?.toString()}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  if (!isNaN(num) && num >= 0 && num <= 2) {
                    setConfig((prev: any) => ({ ...prev, temperature: num }));
                  } else if (text === '') {
                    setConfig((prev: any) => ({ ...prev, temperature: undefined }));
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
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
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

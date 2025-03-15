import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, Card, Button, Input, ButtonGroup, Divider } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import { MainStackParamList } from '../../navigation/types';
import api from '../../services/api';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';
import {eventBus} from '../../navigation';
import {useAuth} from "../../context/AuthContext.tsx";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'FlowForm'>;

const flowTypes = ['收入', '支出', '不计收支'] as const;
type FlowType = typeof flowTypes[number];

// 用于 ButtonGroup 的可变数组
const flowTypeButtons = [...flowTypes];

const defaultIndustryTypes = {
  '收入': ['工资', '奖金', '转账红包', '其他'],
  '支出': ['餐饮美食', '日用百货', '交通出行', '充值缴费', '服饰装扮', '公共服务', '商业服务', '家居家装', '文化休闲', '爱车养车', '生活服务', '运动户外', '亲友代付', '其他'],
  '不计收支': ['信用借还', '投资理财', '退款', '报销', '收款', '其他'],
};

// todo 融合接口数据和固定数据后去重,固定数据交由设置页面编辑
const defaultPayTypes = ['现金', '支付宝', '微信', '银行卡', '信用卡', '其他'];

const FlowFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { currentFlow, date } = route.params || {};
  const { currentBook, remotePayType, remoteAttributions } = useBookkeeping();
  const {userInfo} = useAuth();

  const [name, setName] = useState('');
  const [money, setMoney] = useState('');
  const [description, setDescription] = useState('');
  const [flowType, setFlowType] = useState<FlowType>('支出');
  const [industryType, setIndustryType] = useState('');
  const [payType, setPayType] = useState('');
  const [flowDate, setFlowDate] = useState(date ? new Date(date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [attribution, setAttribution] = useState<string>('');

  const [industryTypes, setIndustryTypes] = useState<string[]>([]);
  const [payTypes, setPayTypes] = useState<string[]>([]);
  const [attributions, setAttributions] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching] = useState(false);

  // 获取流水详情
  useEffect(() => {
    const fetchFlowDetail = async () => {
      if (!currentFlow) return;
      setName(currentFlow.name);
      setMoney(currentFlow.money.toString());
      setDescription(currentFlow.description || '');
      setFlowType(currentFlow.flowType);
      setIndustryType(currentFlow.industryType);
      setPayType(currentFlow.payType);
      setFlowDate(new Date(currentFlow.day));
      setAttribution(currentFlow.attribution || '');
    };

    fetchFlowDetail();
  }, [currentFlow]);

  // 根据流水类型设置默认的行业类型和支付方式
  useEffect(() => {
    const init = async () => {
      const mergedPayTypes = [...new Set([...defaultPayTypes, ...remotePayType])];
      setPayTypes(mergedPayTypes);

      const mergedAttributions = [...new Set([userInfo?.name!, ...remoteAttributions])];
      setAttributions(mergedAttributions);

      if (!payType || !mergedPayTypes.includes(payType)) {
        setPayType(defaultPayTypes[0]);
      }
    };
    init();
  }, [flowType, payType]);

  useEffect(() => {
    const init = async () => {
      let defaultIndustryType = defaultIndustryTypes[flowType];
      let apiResponse = await api.flow.industryType(currentBook?.bookId!,flowType);
      const merged = [...new Set([...defaultIndustryType, ...apiResponse.d.map(item => item.industryType)])];
      setIndustryTypes(merged);
      if (!industryType || !merged.includes(industryType)) {
        setIndustryType(defaultIndustryTypes[flowType][0]);
      }
    };
    init();
  }, []);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入交易方名称');
      return false;
    }

    if (!money || isNaN(Number(money)) || Number(money) <= 0) {
      Alert.alert('错误', '请输入有效的金额');
      return false;
    }

    if (!industryType) {
      Alert.alert('错误', '请选择交易类型');
      return false;
    }

    if (!payType) {
      Alert.alert('错误', '请选择支付方式');
      return false;
    }

    return true;
  };

  // 处理保存
  const handleSave = async () => {
    if (!validateForm() || !currentBook) return;

    try {
      setIsLoading(true);
      if (currentFlow) {
        // 更新流水
        await api.flow.update({
          id: currentFlow.id,
          bookId: currentBook.bookId,
          name,
          money: Number(money),
          flowType,
          industryType,
          payType,
          attribution,
          description: description.trim() || undefined,
          day: moment(flowDate).format('YYYY-MM-DD'),
        });
        Alert.alert('成功', '流水已更新');
        eventBus.emit('refreshCalendarFlows');
      } else {
        // 创建流水
        await api.flow.create({
          bookId: currentBook.bookId,
          name,
          money: Number(money),
          flowType,
          industryType,
          payType,
          attribution,
          description: description.trim() || undefined,
          day: moment(flowDate).format('YYYY-MM-DD'),
        });
        Alert.alert('成功', '流水已创建');
        eventBus.emit('refreshCalendarFlows');
      }

      navigation.goBack();
    } catch (error) {
      console.error('保存流水失败', error);
      Alert.alert('错误', '保存流水失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理日期变更
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFlowDate(selectedDate);
    }
  };

  if (isFetching) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <Card containerStyle={styles.card}>
          <Card.Title>{currentFlow ? '编辑流水' : '创建流水'}</Card.Title>

          <ButtonGroup
            buttons={flowTypeButtons}
            selectedIndex={flowTypes.indexOf(flowType)}
            onPress={(index) => setFlowType(flowTypes[index])}
            containerStyle={styles.buttonGroup}
            selectedButtonStyle={{ backgroundColor: '#1976d2' }}
            disabled={isLoading}
          />

          <Input
            label="交易方名称"
            placeholder="请输入交易方名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'shopping-cart', color: '#1976d2' }}
            errorMessage={name.trim() ? '' : '交易方名称不能为空'}
          />

          <Input
            label="金额"
            placeholder="请输入金额"
            value={money}
            onChangeText={setMoney}
            keyboardType="numeric"
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'attach-money', color: '#1976d2' }}
            errorMessage={money && !isNaN(Number(money)) && Number(money) > 0 ? '' : '请输入有效的金额'}
          />

          <Text style={styles.label}>交易类型</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.typeContainer}>
              {industryTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeItem,
                    industryType === type && styles.selectedTypeItem,
                  ]}
                  onPress={() => setIndustryType(type)}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.typeText,
                      industryType === type && styles.selectedTypeText,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Divider style={styles.divider} />

          <Text style={styles.label}>支付方式</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.typeContainer}>
              {payTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeItem,
                    payType === type && styles.selectedTypeItem,
                  ]}
                  onPress={() => setPayType(type)}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.typeText,
                      payType === type && styles.selectedTypeText,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>归属人</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.typeContainer}>
              {attributions.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.typeItem,
                    attribution === item && styles.selectedTypeItem,
                  ]}
                  onPress={() => setAttribution(item)}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.typeText,
                      attribution === item && styles.selectedTypeText,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Divider style={styles.divider} />

          <Text style={styles.label}>交易日期</Text>
          <TouchableOpacity
            style={styles.dateContainer}
            onPress={() => setShowDatePicker(true)}
            disabled={isLoading}
          >
            <Text style={styles.dateText}>
              {moment(flowDate).format('YYYY-MM-DD')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={flowDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}

          <Input
            label="备注（可选）"
            placeholder="请输入备注"
            value={description}
            onChangeText={setDescription}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'description', color: '#1976d2' }}
            multiline
            numberOfLines={3}
          />

          <View style={styles.buttonContainer}>
            <Button
              title="取消"
              type="outline"
              containerStyle={styles.button}
              onPress={() => navigation.goBack()}
              disabled={isLoading}
            />

            <Button
              title={isLoading ? '保存中...' : '保存'}
              containerStyle={styles.button}
              onPress={handleSave}
              disabled={isLoading}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  buttonGroup: {
    marginBottom: 20,
    borderRadius: 5,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#86939e',
    marginLeft: 10,
    marginBottom: 10,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  typeItem: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  selectedTypeItem: {
    backgroundColor: '#1976d2',
  },
  typeText: {
    color: '#757575',
  },
  selectedTypeText: {
    color: 'white',
  },
  divider: {
    marginVertical: 15,
  },
  dateContainer: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginHorizontal: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#f0f0f0',
  },
  dateText: {
    fontSize: 16,
    color: '#1976d2',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    width: '48%',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FlowFormScreen;

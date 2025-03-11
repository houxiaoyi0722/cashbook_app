import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, Card, Button, Input, ButtonGroup, Divider } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import { useBook } from '../../context/BookContext';
import { MainStackParamList } from '../../navigation/types';
import { Flow } from '../../types';
import api from '../../services/api';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'FlowForm'>;

const flowTypes = ['收入', '支出', '不计收支'] as const;
type FlowType = typeof flowTypes[number];

// 用于 ButtonGroup 的可变数组
const flowTypeButtons = [...flowTypes];

const defaultIndustryTypes = {
  '收入': ['工资', '奖金', '投资', '报销', '其他'],
  '支出': ['餐饮', '购物', '交通', '住房', '娱乐', '医疗', '教育', '其他'],
  '不计收支': ['转账', '还款', '借出', '收款', '其他'],
};
const defaultPayTypes = ['现金', '支付宝', '微信', '银行卡', '信用卡', '其他'];

const FlowFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { flowId, date } = route.params || {};
  const { currentBook } = useBook();
  
  const [name, setName] = useState('');
  const [money, setMoney] = useState('');
  const [description, setDescription] = useState('');
  const [flowType, setFlowType] = useState<FlowType>('支出');
  const [industryType, setIndustryType] = useState('');
  const [payType, setPayType] = useState('');
  const [flowDate, setFlowDate] = useState(date ? new Date(date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [industryTypes, setIndustryTypes] = useState<string[]>([]);
  const [payTypes, setPayTypes] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // 获取流水详情
  useEffect(() => {
    const fetchFlowDetail = async () => {
      if (!flowId) return;
      
      try {
        setIsFetching(true);
        const response = await api.flow.get(flowId);
        
        if (response.c === 200 && response.d) {
          const flow = response.d;
          setName(flow.name);
          setMoney(flow.money.toString());
          setDescription(flow.description || '');
          setFlowType(flow.flowType);
          setIndustryType(flow.industryType);
          setPayType(flow.payType);
          setFlowDate(new Date(flow.flowTime));
        } else {
          Alert.alert('错误', response.m || '获取流水详情失败');
          navigation.goBack();
        }
      } catch (error) {
        console.error('获取流水详情失败', error);
        Alert.alert('错误', '获取流水详情失败');
        navigation.goBack();
      } finally {
        setIsFetching(false);
      }
    };
    
    fetchFlowDetail();
  }, [flowId, navigation]);

  // 根据流水类型设置默认的行业类型和支付方式
  useEffect(() => {
    setIndustryTypes(defaultIndustryTypes[flowType]);
    setPayTypes(defaultPayTypes);
    
    if (!industryType || !defaultIndustryTypes[flowType].includes(industryType)) {
      setIndustryType(defaultIndustryTypes[flowType][0]);
    }
    
    if (!payType || !defaultPayTypes.includes(payType)) {
      setPayType(defaultPayTypes[0]);
    }
  }, [flowType, industryType, payType]);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入交易名称');
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
      
      const flowData = {
        bookId: currentBook.id,
        name,
        money: Number(money),
        flowType,
        industryType,
        payType,
        description: description.trim() || undefined,
        flowTime: moment(flowDate).format('YYYY-MM-DD HH:mm:ss'),
      };
      
      if (flowId) {
        // 更新流水
        await api.flow.update(flowId, flowData);
        Alert.alert('成功', '流水已更新');
      } else {
        // 创建流水
        await api.flow.create(flowData);
        Alert.alert('成功', '流水已创建');
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
          <Card.Title>{flowId ? '编辑流水' : '创建流水'}</Card.Title>
          
          <ButtonGroup
            buttons={flowTypeButtons}
            selectedIndex={flowTypes.indexOf(flowType)}
            onPress={(index) => setFlowType(flowTypes[index])}
            containerStyle={styles.buttonGroup}
            selectedButtonStyle={{ backgroundColor: '#1976d2' }}
            disabled={isLoading}
          />
          
          <Input
            label="交易名称"
            placeholder="请输入交易名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'shopping-cart', color: '#1976d2' }}
            errorMessage={name.trim() ? '' : '交易名称不能为空'}
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
import React, { useState, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Button } from '@rneui/themed';
import dayjs from 'dayjs';

interface YearMonthPickerProps {
  value?: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
  onClose: () => void;
  visible: boolean;
}

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 5;

const YearMonthPicker: React.FC<YearMonthPickerProps> = ({ value, onChange, onClose, visible }) => {
  const [tempYear, setTempYear] = useState(value?.year() || dayjs().year());
  const [tempMonth, setTempMonth] = useState(value?.month() || dayjs().month());
  const yearScrollViewRef = useRef<ScrollView>(null);
  const monthScrollViewRef = useRef<ScrollView>(null);

  useLayoutEffect(() => {
    if (visible) {
      const yearToScroll = tempYear;
      const monthToScroll = tempMonth;
      setTimeout(() => {
        yearScrollViewRef.current?.scrollTo({ y: (yearToScroll - 1970) * ITEM_HEIGHT, animated: false });
        monthScrollViewRef.current?.scrollTo({ y: monthToScroll * ITEM_HEIGHT, animated: false });
      }, 0);
    }
  }, [visible, tempYear, tempMonth]);

  useLayoutEffect(() => {
    if (value) {
      setTempYear(value.year());
      setTempMonth(value.month());
    }
  }, [value]);

  const handleConfirm = () => {
    onChange(dayjs().year(tempYear).month(tempMonth));
    onClose();
  };

  const handleCancel = () => {
    setTempYear(value?.year() || dayjs().year());
    setTempMonth(value?.month() || dayjs().month());
    onClose();
  };

  const handleYearScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const selectedYear = Math.round(y / ITEM_HEIGHT) + 1970;
    setTempYear(selectedYear);
  };

  const handleMonthScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const selectedMonth = Math.round(y / ITEM_HEIGHT);
    setTempMonth(selectedMonth);
  };

  const renderYears = () => {
    const years = [];
    for (let i = 1970; i <= 2100; i++) {
      years.push(
        <View key={i} style={styles.itemContainer}>
          <Text style={styles.itemText}>{i}年</Text>
        </View>
      );
    }
    return years;
  };

  const renderMonths = () => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      months.push(
        <View key={i} style={styles.itemContainer}>
          <Text style={styles.itemText}>{i + 1}月</Text>
        </View>
      );
    }
    return months;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>选择年月</Text>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerColumnContainer}>
              <ScrollView
                ref={yearScrollViewRef}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                onMomentumScrollEnd={handleYearScroll}
                decelerationRate="fast"
              >
                <View style={styles.paddingView} />
                {renderYears()}
                <View style={styles.paddingView} />
              </ScrollView>
              <View style={styles.selectionOverlay} pointerEvents="none" />
            </View>
            <View style={styles.pickerColumnContainer}>
              <ScrollView
                ref={monthScrollViewRef}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                onMomentumScrollEnd={handleMonthScroll}
                decelerationRate="fast"
              >
                <View style={styles.paddingView} />
                {renderMonths()}
                <View style={styles.paddingView} />
              </ScrollView>
              <View style={styles.selectionOverlay} pointerEvents="none" />
            </View>
          </View>
          <View style={styles.buttonContainer}>
            <Button
              title="取消"
              onPress={handleCancel}
              buttonStyle={styles.cancelButton}
              containerStyle={styles.buttonStyle}
            />
            <Button
              title="确定"
              onPress={handleConfirm}
              buttonStyle={styles.confirmButton}
              containerStyle={styles.buttonStyle}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
  },
  pickerColumnContainer: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  itemContainer: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 18,
  },
  selectionOverlay: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1976d2',
  },
  paddingView: {
    height: ITEM_HEIGHT * 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonStyle: {
    width: '45%',
  },
  cancelButton: {
    backgroundColor: '#9e9e9e',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
});

export default YearMonthPicker;

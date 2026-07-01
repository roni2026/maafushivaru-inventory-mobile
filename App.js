import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppProvider, useApp } from './src/context/AppContext';
import { colors } from './src/lib/theme';

import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';
import ItemFormScreen from './src/screens/ItemFormScreen';
import RequisitionsScreen from './src/screens/RequisitionsScreen';
import RequisitionDetailScreen from './src/screens/RequisitionDetailScreen';
import BoatNoteScreen from './src/screens/BoatNoteScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ScanScreen from './src/screens/ScanScreen';
import FuelScreen from './src/screens/FuelScreen';
import ExpiryManagerScreen from './src/screens/ExpiryManagerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SetupScreen from './src/screens/SetupScreen';
import LoginScreen from './src/screens/LoginScreen';
import StoresScreen from './src/screens/StoresScreen';
import StoreFormScreen from './src/screens/StoreFormScreen';
import StoreTasksScreen from './src/screens/StoreTasksScreen';
import StoreTaskFormScreen from './src/screens/StoreTaskFormScreen';
import NotArrivedScreen from './src/screens/NotArrivedScreen';
import OrderGenScreen from './src/screens/OrderGenScreen';
import { initNotifications } from './src/lib/notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primaryLight,
    notification: colors.primary,
  },
};

const screenHeader = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' },
  contentStyle: { backgroundColor: colors.bg },
};

const TAB_ICONS = {
  Home: 'home',
  Inventory: 'cube',
  Scan: 'camera',
  BoatNote: 'boat',
  Alerts: 'notifications',
};

// Raised circular camera button in the bottom-middle of the tab bar.
function CenterScanButton({ children, onPress }) {
  return (
    <TouchableOpacity style={styles.centerWrap} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.centerBtn}>{children}</View>
    </TouchableOpacity>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenHeader,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 60, paddingBottom: 6, paddingTop: 6 },
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarIcon: ({ color, size }) => {
          const base = TAB_ICONS[route.name] || 'ellipse';
          return <Ionicons name={color === colors.primaryLight ? base : `${base}-outline`} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          title: 'Scan',
          tabBarLabel: () => null,
          headerShown: true,
          tabBarIcon: () => <Ionicons name="camera" size={28} color="#fff" />,
          tabBarButton: (props) => <CenterScanButton {...props} />,
        }}
      />
      <Tab.Screen name="BoatNote" component={BoatNoteScreen} options={{ title: 'Boat Notes' }} />
      <Tab.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Alerts' }} />
    </Tab.Navigator>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" color={colors.primaryLight} />
    </View>
  );
}

function Root() {
  const { ready, configured, signedIn, authChecked } = useApp();

  if (!ready) return <Splash />;

  // Not connected to a backend yet → first-run setup.
  if (!configured) {
    return (
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={screenHeader}>
          <Stack.Screen name="Setup" component={SetupScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Connected but auth state still resolving.
  if (!authChecked) return <Splash />;

  return (
    <NavigationContainer theme={navTheme}>
      {!signedIn ? (
        <Stack.Navigator screenOptions={screenHeader}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={screenHeader}>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="Fuel" component={FuelScreen} options={{ title: 'Dive Centre Fuel' }} />
          <Stack.Screen name="ExpiryManager" component={ExpiryManagerScreen} options={{ title: 'Manage Expiry' }} />
          <Stack.Screen name="Requisitions" component={RequisitionsScreen} options={{ title: 'Requisitions' }} />
          <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item details' }} />
          <Stack.Screen name="ItemForm" component={ItemFormScreen} options={{ title: 'Item' }} />
          <Stack.Screen name="RequisitionDetail" component={RequisitionDetailScreen} options={{ title: 'Requisition' }} />
          <Stack.Screen name="Stores" component={StoresScreen} options={{ title: 'Manage stores' }} />
          <Stack.Screen name="StoreForm" component={StoreFormScreen} options={{ title: 'Store' }} />
          <Stack.Screen name="StoreTasks" component={StoreTasksScreen} options={{ title: 'Store Tasks' }} />
          <Stack.Screen name="StoreTaskForm" component={StoreTaskFormScreen} options={{ title: 'Task' }} />
          <Stack.Screen name="NotArrived" component={NotArrivedScreen} options={{ title: 'Not Arrived' }} />
          <Stack.Screen name="OrderGen" component={OrderGenScreen} options={{ title: 'Generate Order' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => { initNotifications(); }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  centerWrap: { top: -18, justifyContent: 'center', alignItems: 'center', flex: 1 },
  centerBtn: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: colors.bg,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
});

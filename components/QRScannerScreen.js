import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  Vibration,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Button, IconButton, ActivityIndicator } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import appConfig from '../app.json';
import DatabaseConfig, {
  resolveApiBaseUrl,
  findWorkingApiUrl,
  createApiConfig,
  API_CONFIG,
  ENV_CONFIG,
  logConfiguration
} from '../config/database';

// Initialize configuration logging
logConfiguration();

// Use environment-based API resolution
const API_BASE_URL = resolveApiBaseUrl();
const api = axios.create(createApiConfig(API_BASE_URL));

console.log('🚀 QRScannerScreen - Using API Base URL:', API_BASE_URL);
console.log('🚀 QRScannerScreen - Environment:', ENV_CONFIG.APP_ENV);
console.log('🚀 QRScannerScreen - Debug Mode:', ENV_CONFIG.DEBUG_MODE);

// Use environment-based backend discovery
const findWorkingBackend = findWorkingApiUrl;

// Helper function for haptic feedback with fallback
const triggerHaptic = async (type = 'light') => {
  try {
    switch (type) {
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'light':
      default:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  } catch (error) {
    // Fallback to vibration if haptics not available
    console.log('Haptics not available, using vibration fallback');
    Vibration.vibrate(type === 'error' ? [100, 50, 100] : 100);
  }
};

export default function QRScannerScreen({ user, onLogout }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workingApiUrl, setWorkingApiUrl] = useState(API_BASE_URL);
  const [apiClient, setApiClient] = useState(() => axios.create({ baseURL: API_BASE_URL, timeout: 10000 }));

  useEffect(() => {
    getCameraPermissions();
    initializeBackend();
  }, []);

  const initializeBackend = async () => {
    try {
      console.log('🚀 QRScannerScreen - Resolved API Base URL:', API_BASE_URL);
      console.log('Testing connection to backend...', API_BASE_URL);
      
      const workingUrl = await findWorkingBackend();
      setWorkingApiUrl(workingUrl);
      
      const newApiClient = axios.create({ baseURL: workingUrl, timeout: 10000 });
      setApiClient(newApiClient);
      
      console.log('Backend connection successful');
    } catch (error) {
      console.error('Failed to initialize backend:', error);
    }
  };

  const getCameraPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStore.deleteItemAsync('authToken');
              await SecureStore.deleteItemAsync('userData');
              onLogout();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned || loading) return;
    
    setScanned(true);
    setLoading(true);

    // Haptic feedback for scan detection
    await triggerHaptic('medium');

    try {
      // Get auth token
      const authToken = await SecureStore.getItemAsync('authToken');
      
      console.log('🔍 QR Scan - Working API URL:', workingApiUrl);
      console.log('🔍 QR Scan - QR Data:', data);
      console.log('🔍 QR Scan - Auth Token:', authToken ? 'Present' : 'Not present');
      console.log('🔍 QR Scan - API Client:', apiClient ? 'Present' : 'Not present');
      
      // Ensure we have a working API client
      let currentApiClient = apiClient;
      if (!currentApiClient || typeof currentApiClient.post !== 'function') {
        console.log('🔧 API Client not ready, creating new one...');
        const workingUrl = await findWorkingBackend();
        currentApiClient = axios.create({ baseURL: workingUrl, timeout: 10000 });
        setApiClient(currentApiClient);
        setWorkingApiUrl(workingUrl);
      }
      
      // Test network connectivity first
      console.log('🌐 Testing network connectivity...');
      try {
        const healthResponse = await currentApiClient.get(API_CONFIG.HEALTH_ENDPOINT);
        console.log('✅ Health check passed:', healthResponse.data);
      } catch (healthError) {
        console.error('❌ Health check failed:', healthError.message);
        console.error('❌ Health error details:', {
          message: healthError.message,
          code: healthError.code,
          request: healthError.request ? 'Request made' : 'No request',
          response: healthError.response ? 'Response received' : 'No response'
        });
        
        // Try to reinitialize if health check fails
        console.log('🔄 Reinitializing API client...');
        const workingUrl = await findWorkingBackend();
        currentApiClient = axios.create({ baseURL: workingUrl, timeout: 10000 });
        setApiClient(currentApiClient);
        setWorkingApiUrl(workingUrl);
      }
      
      // Verify QR with backend using environment configuration
      const response = await currentApiClient.post(API_CONFIG.QR_VERIFY_ENDPOINT, 
        { qr_data: data },
        authToken ? { headers: { Authorization: 'Bearer ' + authToken } } : {}
      );

      console.log('✅ QR Scan - Response:', response.data);

      if (response.data.success) {
        if (response.data.already_used) {
          await triggerHaptic('error');
          Alert.alert('Already Used', 'This QR code has already been used.', [
            { text: 'OK', onPress: resetScanner }
          ]);
        } else {
          await triggerHaptic('success');
          // Mark as used and show success
          Alert.alert(
            'Valid Ticket', 
            'Ticket verified successfully!\nGuest: ' + (response.data.guest_name || 'Unknown'),
            [
              { text: 'Mark as Used', onPress: () => markAsUsed(data) },
              { text: 'Cancel', onPress: resetScanner }
            ]
          );
        }
      } else {
        await triggerHaptic('error');
        Alert.alert('Invalid QR', 'This QR code is not valid.', [
          { text: 'OK', onPress: resetScanner }
        ]);
      }
    } catch (error) {
      console.error('❌ QR verification error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        response: error.response?.status,
        responseData: error.response?.data
      });
      await triggerHaptic('error');
      Alert.alert('Error', 'Failed to verify QR code. Please try again.', [
        { text: 'OK', onPress: resetScanner }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const markAsUsed = async (qrData) => {
    try {
      setLoading(true);
      await triggerHaptic('light'); // Light feedback for action start
      
      const authToken = await SecureStore.getItemAsync('authToken');
      
      // Ensure we have a working API client
      let currentApiClient = apiClient;
      if (!currentApiClient || typeof currentApiClient.post !== 'function') {
        console.log('🔧 API Client not ready for mark-used, creating new one...');
        const workingUrl = await findWorkingBackend();
        currentApiClient = axios.create({ baseURL: workingUrl, timeout: 10000 });
        setApiClient(currentApiClient);
        setWorkingApiUrl(workingUrl);
      }
      
      const response = await currentApiClient.post(API_CONFIG.QR_MARK_USED_ENDPOINT,
        { qr_data: qrData },
        authToken ? { headers: { Authorization: 'Bearer ' + authToken } } : {}
      );

      if (response.data.success) {
        await triggerHaptic('success');
        Alert.alert('Success', 'Ticket marked as used successfully!', [
          { text: 'OK', onPress: resetScanner }
        ]);
      } else {
        await triggerHaptic('error');
        Alert.alert('Error', 'Failed to mark ticket as used.', [
          { text: 'OK', onPress: resetScanner }
        ]);
      }
    } catch (error) {
      console.error('Mark as used error:', error);
      await triggerHaptic('error');
      Alert.alert('Error', 'Failed to mark ticket as used.', [
        { text: 'OK', onPress: resetScanner }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    triggerHaptic('light'); // Gentle feedback for reset
  };

  const testNetworkConnectivity = async () => {
    try {
      setLoading(true);
      console.log('🌐 Manual network test - API URL:', workingApiUrl);
      
      // Ensure we have a working API client
      let currentApiClient = apiClient;
      if (!currentApiClient || typeof currentApiClient.get !== 'function') {
        console.log('🔧 API Client not ready for test, creating new one...');
        const workingUrl = await findWorkingBackend();
        currentApiClient = axios.create({ baseURL: workingUrl, timeout: 10000 });
        setApiClient(currentApiClient);
        setWorkingApiUrl(workingUrl);
      }
      
        const healthResponse = await currentApiClient.get(API_CONFIG.HEALTH_ENDPOINT);
      console.log('✅ Manual health check passed:', healthResponse.data);
      
      Alert.alert('Success', `Backend connection successful!\nUsing: ${workingApiUrl}`, [
        { text: 'OK' }
      ]);
    } catch (error) {
      console.error('❌ Manual network test failed:', error);
      console.error('❌ Manual test error details:', {
        message: error.message,
        code: error.code,
        request: error.request ? 'Request made' : 'No request',
        response: error.response ? 'Response received' : 'No response'
      });
      
      // Try to find a working backend again
      try {
        console.log('🔄 Retrying backend discovery...');
        const newWorkingUrl = await findWorkingBackend();
        setWorkingApiUrl(newWorkingUrl);
        const newApiClient = axios.create({ baseURL: newWorkingUrl, timeout: 10000 });
        setApiClient(newApiClient);
        
        Alert.alert('Retry Success', `Found working backend at:\n${newWorkingUrl}`, [
          { text: 'OK' }
        ]);
      } catch (retryError) {
        Alert.alert('Network Error', `Failed to connect to backend:\n${error.message}\n\nRetry also failed.`, [
          { text: 'OK' }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
        <Button mode="contained" onPress={getCameraPermissions}>
          Grant Permission
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ff6b35" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>QR Scanner</Text>
        <View style={styles.headerButtons}>
          <IconButton icon="wifi" iconColor="white" onPress={testNetworkConnectivity} />
          <IconButton icon="logout" iconColor="white" onPress={handleLogout} />
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <Text style={styles.instructionText}>Position QR code in the frame</Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff6b35" />
          <Text style={styles.loadingText}>Verifying QR code...</Text>
        </View>
      )}

      {/* Reset Button */}
      {scanned && !loading && (
        <View style={styles.buttonContainer}>
          <Button mode="contained" onPress={resetScanner}>
            Scan Again
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#ff6b35',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  cameraContainer: {
    flex: 1,
    margin: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
  },
  buttonContainer: {
    padding: 20,
  },
  text: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
});
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Database Configuration for QR Verifier
 * Handles environment-based database connections and API endpoints
 */

// Helper function to get environment variables
const getEnvVar = (key, defaultValue = '') => {
  // Check Expo Constants first
  const extraConfig = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
  
  // Map the key to the correct property name in app.json extra config
  const keyMapping = {
    'API_BASE_URL': 'apiBaseUrl',
    'API_TIMEOUT': 'apiTimeout',
    'NODE_ENV': 'nodeEnv',
    'APP_ENV': 'appEnv',
    'HEALTH_ENDPOINT': 'healthEndpoint',
    'QR_VERIFY_ENDPOINT': 'qrVerifyEndpoint',
    'QR_MARK_USED_ENDPOINT': 'qrMarkUsedEndpoint',
    'AUTH_LOGIN_ENDPOINT': 'authLoginEndpoint',
    'AUTH_SIGNUP_ENDPOINT': 'authSignupEndpoint',
    'ANDROID_EMULATOR_API_URL': 'androidEmulatorApiUrl',
    'IOS_SIMULATOR_API_URL': 'iosSimulatorApiUrl',
    'DEVICE_API_URL': 'deviceApiUrl',
    'FALLBACK_API_URLS': 'fallbackApiUrls',
    'DEBUG_MODE': 'debugMode',
    'ENABLE_NETWORK_DEBUGGING': 'enableNetworkDebugging',
    'ENABLE_API_LOGGING': 'enableApiLogging',
    'SECURE_STORE_KEY_PREFIX': 'secureStoreKeyPrefix'
  };
  
  const mappedKey = keyMapping[key] || key;
  const envValue = extraConfig[mappedKey] || process.env[key];
  
  return envValue || defaultValue;
};

// Environment configuration
export const ENV_CONFIG = {
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  APP_ENV: getEnvVar('APP_ENV', 'development'),
  DEBUG_MODE: getEnvVar('DEBUG_MODE', 'true') === 'true',
  ENABLE_NETWORK_DEBUGGING: getEnvVar('ENABLE_NETWORK_DEBUGGING', 'true') === 'true',
  ENABLE_API_LOGGING: getEnvVar('ENABLE_API_LOGGING', 'true') === 'true',
};

// API Configuration
export const API_CONFIG = {
  BASE_URL: getEnvVar('API_BASE_URL', ''), // Set a default empty string
  TIMEOUT: parseInt(getEnvVar('API_TIMEOUT', '10000'), 10),
  
  // Endpoints
  HEALTH_ENDPOINT: getEnvVar('HEALTH_ENDPOINT', '/api/health'),
  QR_VERIFY_ENDPOINT: getEnvVar('QR_VERIFY_ENDPOINT', '/api/bookings/qr-details'),
  QR_MARK_USED_ENDPOINT: getEnvVar('QR_MARK_USED_ENDPOINT', '/api/bookings/mark-used'),
  AUTH_LOGIN_ENDPOINT: getEnvVar('AUTH_LOGIN_ENDPOINT', '/api/auth/login'),
  AUTH_SIGNUP_ENDPOINT: getEnvVar('AUTH_SIGNUP_ENDPOINT', '/api/auth/sign-up'),
};

// Platform-specific API URLs
export const PLATFORM_API_CONFIG = {
  ANDROID_EMULATOR: getEnvVar('ANDROID_EMULATOR_API_URL', 'http://10.0.2.2:5000'),
  IOS_SIMULATOR: getEnvVar('IOS_SIMULATOR_API_URL', 'http://localhost:5000'),
  DEVICE: getEnvVar('DEVICE_API_URL', ''), // This will be dynamically determined
};

// Fallback URLs for auto-discovery
export const FALLBACK_URLS = getEnvVar('FALLBACK_API_URLS', 
  'http://10.0.2.2:5000,http://localhost:5000'
).split(',').map(url => url.trim());

// Database Configuration (for direct connections if needed)
export const DB_CONFIG = {
  URL: getEnvVar('DATABASE_URL', 'postgresql://username:password@localhost:5432/dandiya_platform'),
  SSL: getEnvVar('PG_SSL', 'false') === 'true',
};

// Security Configuration
export const SECURITY_CONFIG = {
  SECURE_STORE_KEY_PREFIX: getEnvVar('SECURE_STORE_KEY_PREFIX', 'dandiya_qr_'),
};

// Firebase Configuration
export const FIREBASE_CONFIG = {
  PROJECT_ID: getEnvVar('FIREBASE_PROJECT_ID', ''),
  API_KEY: getEnvVar('FIREBASE_API_KEY', ''),
  AUTH_DOMAIN: getEnvVar('FIREBASE_AUTH_DOMAIN', ''),
};

/**
 * Resolve the appropriate API base URL based on platform and device type.
 * This function now dynamically determines the API URL.
 */
export const resolveApiBaseUrl = () => {
  console.log('🔧 API URL Resolution:');

  // In development, derive the URL from the debugger host
  const expoConfig = Constants.expoConfig;
  if (__DEV__ && expoConfig?.hostUri) {
    const devUrl = `http://${expoConfig.hostUri.split(':')[0]}:5000`;
    console.log('🔧 - Using Dev URL from hostUri:', devUrl);
    return devUrl;
  }

  // Always prefer configured URL first if provided in app.json
  const configuredBaseUrl = getEnvVar('API_BASE_URL');
  if (configuredBaseUrl) {
    console.log('🔧 - Using configured URL from app.json:', configuredBaseUrl);
    return configuredBaseUrl;
  }
  
  // Platform-specific resolution
  if (Constants.isDevice) {
    // For a real device, we expect the dynamic dev URL logic above to work.
    // If it falls through, it might be a production build.
    // A production build should have the API URL configured in app.json.
    console.warn('🔧 - Warning: No dynamic dev URL and no configured API_BASE_URL for a device.');
    return ''; // Return empty and let connection fail clearly
  } else if (Platform.OS === 'android') {
    // Android emulator
    console.log('🔧 - Using Android emulator URL:', PLATFORM_API_CONFIG.ANDROID_EMULATOR);
    return PLATFORM_API_CONFIG.ANDROID_EMULATOR;
  } else if (Platform.OS === 'ios') {
    // iOS simulator
    console.log('🔧 - Using iOS simulator URL:', PLATFORM_API_CONFIG.IOS_SIMULATOR);
    return PLATFORM_API_CONFIG.IOS_SIMULATOR;
  }
  
  // Fallback for any other case (e.g., web)
  console.log('🔧 - Using fallback URL for web or unknown:', PLATFORM_API_CONFIG.IOS_SIMULATOR);
  return PLATFORM_API_CONFIG.IOS_SIMULATOR; // Default to localhost for web
};

/**
 * Test connectivity to multiple API URLs and return the first working one
 */
export const findWorkingApiUrl = async (timeout = 3000) => {
  // Defensive: if caller accidentally passed a string (e.g. a URL) instead of a number
  // reset to default so that setTimeout doesn't treat it as 0 and abort immediately.
  if (typeof timeout !== 'number' || isNaN(timeout) || timeout < 50) {
    timeout = 3000;
  }
  const testUrls = [
    resolveApiBaseUrl(),
    ...FALLBACK_URLS,
  ].filter((url, index, arr) => arr.indexOf(url) === index); // Remove duplicates
  
  console.log('🔍 Testing API URLs (health endpoint:', API_CONFIG.HEALTH_ENDPOINT, '):', testUrls);
  
  for (const url of testUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`${url}${API_CONFIG.HEALTH_ENDPOINT}`, {
        signal: controller.signal,
        method: 'GET',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('✅ Working API found at:', url);
        return url;
      }
    } catch (error) {
      console.log(`❌ Failed to connect to ${url}:`, error.message);
    }
  }
  
  console.log('⚠️ No working API found, using default:', resolveApiBaseUrl());
  return resolveApiBaseUrl();
};

/**
 * Create axios configuration with proper settings
 */
export const createApiConfig = (baseURL) => {
  return {
    baseURL,
    timeout: API_CONFIG.TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  };
};

/**
 * Log configuration for debugging
 */
export const logConfiguration = () => {
  if (ENV_CONFIG.DEBUG_MODE) {
    console.log('🔧 QR Verifier Configuration:');
    console.log('🔧 - Environment:', ENV_CONFIG.APP_ENV);
    console.log('🔧 - Debug Mode:', ENV_CONFIG.DEBUG_MODE);
    console.log('🔧 - API Base URL:', API_CONFIG.BASE_URL);
    console.log('🔧 - Platform:', Platform.OS);
    console.log('🔧 - Is Device:', Constants.isDevice);
    console.log('🔧 - Fallback URLs:', FALLBACK_URLS);
  }
};

// Export default configuration
export default {
  ENV_CONFIG,
  API_CONFIG,
  PLATFORM_API_CONFIG,
  FALLBACK_URLS,
  DB_CONFIG,
  SECURITY_CONFIG,
  FIREBASE_CONFIG,
  resolveApiBaseUrl,
  findWorkingApiUrl,
  createApiConfig,
  logConfiguration,
};

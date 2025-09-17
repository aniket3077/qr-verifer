import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export class FirebaseAuthService {
  
  // Sign in with email and password
  static async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get additional user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || userData.name || 'User',
          role: userData.role || 'verifier',
          ...userData
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error.code)
      };
    }
  }

  // Create new user account
  static async signUp(email, password, displayName, role = 'verifier') {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update profile
      await updateProfile(user, { displayName });
      
      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        name: displayName,
        email: email,
        role: role,
        createdAt: new Date().toISOString(),
        isActive: true
      });
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: displayName,
          role: role
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error.code)
      };
    }
  }

  // Sign out
  static async signOut() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error.code)
      };
    }
  }

  // Get current user
  static getCurrentUser() {
    return auth.currentUser;
  }

  // Listen to auth state changes
  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

  // Demo authentication for testing (when Firebase is not configured)
  static async demoAuth(username, password) {
    // Demo credentials for testing
    if (username === 'admin@dandiya.com' && password === 'admin123') {
      return {
        success: true,
        user: {
          uid: 'demo-user-123',
          email: 'admin@dandiya.com',
          displayName: 'Admin User',
          role: 'verifier',
          isDemo: true
        }
      };
    } else if (username === 'staff@dandiya.com' && password === 'staff123') {
      return {
        success: true,
        user: {
          uid: 'demo-user-456',
          email: 'staff@dandiya.com',
          displayName: 'Event Staff',
          role: 'verifier',
          isDemo: true
        }
      };
    } else {
      return {
        success: false,
        error: 'Invalid credentials. Try admin@dandiya.com/admin123 or staff@dandiya.com/staff123'
      };
    }
  }

  // Convert Firebase error codes to user-friendly messages
  static getErrorMessage(errorCode) {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }
}

export default FirebaseAuthService;
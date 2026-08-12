/**
 * firebaseAuth.ts
 * Wraps @react-native-firebase/auth for phone number sign-in.
 *
 * Flow:
 *   1. sendOtp(phone)  → Firebase sends SMS, returns verificationId
 *   2. verifyOtp(verificationId, otp) → Firebase verifies, returns ID Token
 *   3. Backend POST /auth/firebase-verify { idToken } → issues our own JWT
 */
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

// Kept in module scope so the confirmation object survives navigation
let _confirmation: FirebaseAuthTypes.ConfirmationResult | null = null;

export const firebaseAuthService = {
  /**
   * Trigger Firebase OTP to the given Indian phone number.
   * Returns the verificationId which must be passed to verifyOtp().
   */
  async sendOtp(phone: string): Promise<string> {
    // Firebase expects E.164 format (+91XXXXXXXXXX for India)
    const e164 = `+91${phone}`;
    const confirmation = await auth().signInWithPhoneNumber(e164);
    _confirmation = confirmation;
    return confirmation.verificationId;
  },

  /**
   * Confirm the OTP entered by the user.
   * Returns a Firebase ID Token which the backend will verify.
   */
  async verifyOtp(verificationId: string, otp: string): Promise<string> {
    // Use stored confirmation if available (same session), otherwise recreate credential
    let userCredential: FirebaseAuthTypes.UserCredential;

    if (_confirmation) {
      userCredential = await _confirmation.confirm(otp);
    } else {
      // Fallback: recreate credential from verificationId (e.g. after app restart)
      const credential = auth.PhoneAuthProvider.credential(verificationId, otp);
      userCredential = await auth().signInWithCredential(credential);
    }

    // Get a fresh ID token (valid for 1 hour; our backend verifies it)
    const idToken = await userCredential.user.getIdToken();
    return idToken;
  },

  /**
   * Sign out from Firebase (does NOT affect our own JWT session,
   * which is cleared separately by authStore.logout).
   */
  async signOut(): Promise<void> {
    try {
      await auth().signOut();
    } catch {
      // Non-critical — our JWT session is the source of truth
    } finally {
      _confirmation = null;
    }
  },
};

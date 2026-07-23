import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ערכים אלה נועדו להיות פומביים בקוד צד-לקוח.
// האבטחה נאכפת ב-Firestore Security Rules, לא בהסתרת המפתחות.
const firebaseConfig = {
  apiKey: "AIzaSyDkqN3M19jXibRbsh5J7SYsS26KrUmUdJQ",
  authDomain: "shaul-tamrukim-tofes-101.firebaseapp.com",
  projectId: "shaul-tamrukim-tofes-101",
  storageBucket: "shaul-tamrukim-tofes-101.firebasestorage.app",
  messagingSenderId: "713234481484",
  appId: "1:713234481484:web:0e01542c170e2fc6ab8fe9",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/** מחזיר uid אנונימי. אימות אנונימי לבדו אינו מקנה שום הרשאה — ראה data.js */
export function ensureAnonUser() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop();
          resolve(user);
        } else {
          signInAnonymously(auth).catch(reject);
        }
      },
      reject,
    );
  });
}

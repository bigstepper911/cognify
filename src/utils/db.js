import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase"; // Your secure vault

// 1. Load their data when they log in
export const loadUserData = async (userId) => {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // Welcome back! Here is your saved data.
    return userSnap.data();
  } else {
    // First time ever logging in! Create a new file for them.
    const newData = { focusCoins: 0 };
    await setDoc(userRef, newData);
    return newData;
  }
};

// 2. Save their coins when they get a question right
export const saveFocusCoins = async (userId, newTotal) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { focusCoins: newTotal });
};
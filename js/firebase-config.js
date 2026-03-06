import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAI95FerJyyAL37kuP0uk0nUDCEL0VZQa4',
  authDomain: 'smart-attendance-cbf53.firebaseapp.com',
  projectId: 'smart-attendance-cbf53',
  storageBucket: 'smart-attendance-cbf53.firebasestorage.app',
  messagingSenderId: '320228804891',
  appId: '1:320228804891:web:0b1624c30f158740e22bbe',
  measurementId: 'G-RKXXP7V3N9',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export {
  db,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  updateDoc,
};

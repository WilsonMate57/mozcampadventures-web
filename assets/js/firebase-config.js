import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCBGW6fW89t17Is4WJfC7ua2czRecFM5Pg",
  authDomain: "moz-camp-adventures.firebaseapp.com",
  projectId: "moz-camp-adventures",
  storageBucket: "moz-camp-adventures.firebasestorage.app",
  messagingSenderId: "887984138681",
  appId: "1:887984138681:web:f2a4cad5a8e233c4c6ee68"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

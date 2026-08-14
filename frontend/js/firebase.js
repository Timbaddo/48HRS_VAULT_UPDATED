// frontend/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5MiEWFKtoQpkE7EtI2AC2W6ME8bqqDGg",
  authDomain: "hrs-vault-722a4.firebaseapp.com",
  projectId: "hrs-vault-722a4",
  storageBucket: "hrs-vault-722a4.firebasestorage.app",
  messagingSenderId: "497889983659",
  appId: "1:497889983659:web:a7d4ede5507af9de2b4bee",
  measurementId: "G-8466QCHSY1"
}; // <--- Fixed missing closing brace here

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;

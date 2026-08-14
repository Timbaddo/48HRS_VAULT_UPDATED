import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"; 
import { auth } from "./firebase.js"; 

// SIGN UP 
export async function signup(email, password) {   
  try {     
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);     
    return { success: true, user: userCredential.user };   
  } catch (error) {     
    return { success: false, code: error.code, message: getAuthErrorMessage(error.code) };   
  }
}

// LOGIN 
export async function login(email, password) {   
  try {     
    const userCredential = await signInWithEmailAndPassword(auth, email, password);     
    return { success: true, user: userCredential.user };   
  } catch (error) {     
    return { success: false, code: error.code, message: getAuthErrorMessage(error.code) };   
  }
}

// LOGOUT 
export async function logout() {   
  try {     
    await signOut(auth);     
    return { success: true };   
  } catch (error) {     
    return { success: false, code: error.code, message: error.message };   
  }
}

// AUTH STATE LISTENERS 
export function watchAuth(callback) {   
  return onAuthStateChanged(auth, callback); 
}

// CURRENT USER GETTER 
export function getCurrentUser() {   
  return auth.currentUser; 
}

// ERROR MESSAGES MAPPER 
function getAuthErrorMessage(code) {   
  switch (code) {     
    case "auth/email-already-in-use":       
      return "This email address is already registered.";     
    case "auth/invalid-email":       
      return "Please enter a valid email address.";     
    case "auth/weak-password":       
      return "Password is too weak. Use at least 6 characters.";     
    case "auth/invalid-credential":       
      return "Incorrect email or password.";     
    case "auth/user-not-found":       
      return "No account was found with this email.";     
    case "auth/wrong-password":       
      return "Incorrect password.";     
    case "auth/too-many-requests":       
      return "Too many attempts. Please try again later.";     
    default:       
      return "Something went wrong. Please try again.";   
  }
}

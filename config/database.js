import mongoose from "mongoose"; 

export async function connectDB() {   
  try {     
    const conn = await mongoose.connect(process.env.MONGODB_URI);     
    console.log(`MongoDB Connected: ${conn.connection.host}`);   
  } catch (error) {     
    console.error(`Error connecting to MongoDB: ${error.message}`);     
    process.exit(1);   
  }
}

// Default export added so server.js import works smoothly
export default connectDB;
 
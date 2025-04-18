const mongoose = require('mongoose');

// Use your MongoDB Atlas connection string
const connectionString = 'mongodb+srv://supunprabodha789:ThMYqJYjCxHhqI0r@mediconnect.psqgq.mongodb.net/?retryWrites=true&w=majority&appName=MediConnect';

mongoose.connect(connectionString)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });

// List of collections you want to clear
const collectionsToClear = [
  'appointments',
  'doctorcalendars',
  'medicalrecords',
  'notifications',
  'payments',
  'reviews',
];

async function clearCollections() {
  try {
    for (const collectionName of collectionsToClear) {
      const collection = mongoose.connection.collection(collectionName);
      const result = await collection.deleteMany({});
      console.log(`🧹 Cleared ${collectionName}: ${result.deletedCount} documents deleted.`);
    }
    console.log('\n🎯 All selected collections cleared! (Users collection untouched)');
  } catch (error) {
    console.error('❌ Error clearing collections:', error);
  } finally {
    mongoose.connection.close();
  }
}

clearCollections();
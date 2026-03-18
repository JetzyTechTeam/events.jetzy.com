const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function checkQuestions() {
  const uri = process.env.NEXT_EVENTS_DB_URL;
  if (!uri) throw new Error('DB URL not found');
  
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const event = await db.collection('events').findOne({ _id: new ObjectId('69baa22149e8a89a0b550e5e') });
    
    if (!event) console.log('Event not found');
    else {
      console.log('Event found.');
      console.log('Questions field exists:', 'questions' in event);
      if (event.questions) {
        console.log('Number of questions:', event.questions.length);
      }
    }
  } finally {
    await client.close();
  }
}

checkQuestions().catch(console.error);

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

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
        console.log('Questions:', JSON.stringify(event.questions, null, 2));
      }
    }
  } finally {
    await client.close();
  }
}

checkQuestions().catch(console.error);

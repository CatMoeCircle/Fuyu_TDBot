import { getDatabase } from "./index.ts";

export async function createDocument(type: string, data: any) {
  const db = await getDatabase();
  const collection = db.collection("config");
  const result = await collection.insertOne({ type, ...data });
  return result;
}

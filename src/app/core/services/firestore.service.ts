import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { getFirestoreDb } from '../../environment/firebase.environment';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  private readonly firestore = getFirestoreDb();

  streamCollection<T>(
    path: string,
    mapper: (id: string, data: DocumentData) => T,
  ): Observable<T[]> {
    if (!this.shouldUseFirestore()) {
      return of([]);
    }

    return new Observable<T[]>((subscriber) => {
      const unsubscribe = onSnapshot(
        collection(this.firestore, path),
        (snapshot) => {
          subscriber.next(snapshot.docs.map((documentSnapshot) => mapper(documentSnapshot.id, documentSnapshot.data())));
        },
        (error) => {
          subscriber.error(error);
        },
      );

      return unsubscribe;
    });
  }

  async addDocument(path: string, payload: Record<string, unknown>): Promise<string> {
    const documentReference = await addDoc(collection(this.firestore, path), payload);

    return documentReference.id;
  }

  async getDocument<T extends DocumentData>(path: string, id: string): Promise<T | null> {
    if (!this.shouldUseFirestore()) {
      return null;
    }

    const snapshot = await getDoc(doc(this.firestore, path, id));

    return snapshot.exists() ? (snapshot.data() as T) : null;
  }

  async setDocument(path: string, id: string, payload: Record<string, unknown>): Promise<void> {
    await setDoc(doc(this.firestore, path, id), payload);
  }

  async updateDocument(
    path: string,
    id: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, path, id), payload);
  }

  private shouldUseFirestore(): boolean {
    return typeof window !== 'undefined' && !window.navigator.userAgent.toLowerCase().includes('jsdom');
  }
}
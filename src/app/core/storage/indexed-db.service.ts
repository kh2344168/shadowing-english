import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private readonly dbName = 'english-shadowing-platform-db-v1';
  private readonly dbStoreName = 'files';

  async putBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readwrite');
      tx.objectStore(this.dbStoreName).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }

  async getBlob(key: string): Promise<Blob | null> {
    const db = await this.openDb();

    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readonly');
      const request = tx.objectStore(this.dbStoreName).get(key);
      request.onsuccess = () => resolve((request.result as Blob) || null);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  }


  async deleteBlobsByPrefix(prefix: string): Promise<void> {
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readwrite');
      const store = tx.objectStore(this.dbStoreName);
      const request = store.openKeyCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key || '');
        if (key.startsWith(prefix)) {
          store.delete(cursor.key);
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }
  async deleteBlob(key: string): Promise<void> {
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.dbStoreName, 'readwrite');
      tx.objectStore(this.dbStoreName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.dbStoreName)) {
          db.createObjectStore(this.dbStoreName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

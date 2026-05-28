export type PendingOrderStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type PendingOrder = {
  id: string;
  clientId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  product: string;
  notes: string;
  status: PendingOrderStatus;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  syncedOrderId?: string;
  error?: string;
};

const dbName = 'lia-pwa-offline-v1';
const storeName = 'pending-orders';
let dbPromise: Promise<IDBDatabase> | undefined;

export async function listPendingOrders(): Promise<PendingOrder[]> {
  const db = await openQueueDb();
  const rows = await requestToPromise<PendingOrder[]>(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePendingOrder(order: PendingOrder): Promise<void> {
  const db = await openQueueDb();
  await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(order));
}

export async function updatePendingOrder(id: string, patch: Partial<PendingOrder>): Promise<PendingOrder> {
  const db = await openQueueDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const current = await requestToPromise<PendingOrder | undefined>(store.get(id));
  if (!current) throw new Error(`Pedido local ${id} não encontrado`);
  const updated: PendingOrder = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await requestToPromise(store.put(updated));
  return updated;
}

export async function clearSyncedOrders(): Promise<void> {
  const db = await openQueueDb();
  const rows = await listPendingOrders();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  await Promise.all(rows.filter((order) => order.status === 'synced').map((order) => requestToPromise(store.delete(order.id))));
}

function openQueueDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('clientId', 'clientId', { unique: true });
      }
    };

    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('Operação IndexedDB falhou'));
    request.onsuccess = () => resolve(request.result);
  });
}

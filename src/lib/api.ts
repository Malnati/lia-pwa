import { apiUrl } from './config';
import type { PendingAttachment, PendingOrder, SyncedArtifacts } from './offline-queue';

export type PublishedOrder = {
  id: string;
  clientId?: string;
  status: string;
  syncedArtifacts: SyncedArtifacts;
};

export async function publishPendingOrder(order: PendingOrder, accessToken: string): Promise<PublishedOrder> {
  const created = await jsonFetch<PublishedOrderResponse>(`${apiUrl}/api/orders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      clientId: order.clientId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      product: order.product,
      notes: order.notes
    })
  });
  const syncedArtifacts: SyncedArtifacts = {};

  if (order.checkpoint) {
    await jsonFetch<PublishedOrderResponse>(`${apiUrl}/api/orders/${created.id}/checkpoints/${order.checkpoint.key}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        completed: true,
        actor: order.checkpoint.actor,
        timestamp: order.checkpoint.timestamp,
        notes: order.checkpoint.notes
      })
    });
    syncedArtifacts.checkpoint = true;
  }

  if (order.payment && order.payment.amount > 0) {
    await jsonFetch<PaymentIntentResponse>(`${apiUrl}/api/orders/${created.id}/payment-intents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(order.payment)
    });
    syncedArtifacts.payment = true;
  }

  if (order.attachment) {
    await uploadAttachment(created.id, order.attachment, accessToken);
    syncedArtifacts.attachment = true;
  }

  return { ...created, syncedArtifacts };
}

type PublishedOrderResponse = {
  id: string;
  clientId?: string;
  status: string;
};

type PaymentIntentResponse = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
};

async function uploadAttachment(orderId: string, attachment: PendingAttachment, accessToken: string): Promise<void> {
  const form = new FormData();
  form.set('kind', attachment.kind);
  form.set('clientAttachmentId', attachment.clientAttachmentId);
  form.set('capturedAt', attachment.capturedAt);
  form.set('file', new File([attachment.data], attachment.filename, { type: attachment.contentType }));

  await jsonFetch<unknown>(`${apiUrl}/api/orders/${orderId}/attachments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: form
  });
}

async function jsonFetch<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `API retornou HTTP ${response.status}`);
  }

  return await response.json() as T;
}

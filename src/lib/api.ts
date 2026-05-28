import { apiUrl } from './config';
import type { PendingOrder } from './offline-queue';

export type PublishedOrder = {
  id: string;
  clientId?: string;
  status: string;
};

export async function publishPendingOrder(order: PendingOrder, accessToken: string): Promise<PublishedOrder> {
  const response = await fetch(`${apiUrl}/api/orders`, {
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

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `API retornou HTTP ${response.status}`);
  }

  return await response.json() as PublishedOrder;
}

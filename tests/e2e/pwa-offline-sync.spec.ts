import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = normalizeUrl(process.env.LIA_E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_PROJECT_URL ?? '');
const supabasePublishableKey = process.env.LIA_E2E_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_PUBLIC_KEY ??
  '';
const apiUrl = normalizeUrl(process.env.LIA_E2E_API_URL ?? 'https://api.aneety.com');

const requiredEnv = ['LIA_E2E_ADMIN_EMAIL', 'LIA_E2E_ADMIN_PASSWORD'] as const;
const runE2E = process.env.LIA_E2E_ENABLED === '1' ? test : test.skip;

runE2E('PWA salva pedido offline e sincroniza com API/Postgres real', async ({ page, context, baseURL }) => {
  assertConfig();
  const e2eRun = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const customerName = `PWA E2E Offline ${e2eRun}`;
  const attachmentFilename = `pwa-offline-${e2eRun}.png`;

  const pwaUrl = new URL(baseURL ?? 'https://pwa.aneety.com/');
  pwaUrl.searchParams.set('e2e', e2eRun);
  await page.goto(pwaUrl.toString());
  await page.getByLabel('E-mail').fill(process.env.LIA_E2E_ADMIN_EMAIL!);
  await page.getByLabel('Senha').fill(process.env.LIA_E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Sessão ativa', { exact: true })).toBeVisible();

  for (const tabName of ['Pedidos', 'Novo', 'Retirada', 'Entrega', 'Anexos', 'Pagamento', 'Sync', 'Perfil']) {
    await expect(page.getByRole('tab', { name: tabName })).toBeVisible();
  }

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByRole('tab', { name: 'Sync' }).click();
  await expect(page.getByText('offline', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Novo' }).click();

  await page.getByLabel('Paciente/cliente').fill(customerName);
  await page.getByLabel('Telefone').fill('+595 21 555 000');
  await page.getByLabel('Produto').fill('Molde prótese PWA E2E');
  await page.getByLabel('Endereço de entrega').fill('PWA offline, Asunción');
  await page.getByLabel('Observações').fill('Criado offline no navegador e sincronizado depois.');
  await page.getByLabel('Responsável pelo checkpoint').fill('Codex PWA E2E');
  await page.getByLabel('Notas do checkpoint').fill('Checkpoint criado offline e publicado via Worker.');
  await page.getByLabel('Valor do pagamento').fill('125000');
  await page.setInputFiles('#attachmentFile', {
    name: attachmentFilename,
    mimeType: 'image/png',
    buffer: Buffer.from(onePixelPng())
  });
  await page.getByRole('button', { name: 'Salvar offline' }).click();
  await page.getByRole('tab', { name: 'Pedidos' }).click();
  await expect(page.getByText('pendente local')).toBeVisible();
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText(`anexo: ${attachmentFilename}`)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('tab', { name: 'Sync' }).click();
  await expect(page.getByText('online', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sincronizar fila' }).click();
  await expect(page.getByText('sincronizado', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('checkpoint sincronizado')).toBeVisible();
  await expect(page.getByText('pagamento sincronizado')).toBeVisible();
  await expect(page.getByText('anexo sincronizado')).toBeVisible();

  const accessToken = await signInForApi();
  const orders = await fetch(`${apiUrl}/api/orders`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  expect(orders.status).toBe(200);
  const payload = await orders.json() as OrderResponse[];
  const syncedOrder = payload.find((order) => (order.customerName ?? order.customer_name) === customerName);
  expect(syncedOrder?.id).toBeTruthy();
  expect(syncedOrder?.checkpoints?.some((checkpoint) =>
    checkpoint.key === 'pickup_checkin' &&
    checkpoint.completed === true &&
    checkpoint.actor === 'Codex PWA E2E'
  )).toBe(true);

  const attachments = await fetch(`${apiUrl}/api/orders/${syncedOrder!.id}/attachments`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  expect(attachments.status).toBe(200);
  const attachmentPayload = await attachments.json() as AttachmentResponse[];
  expect(attachmentPayload.some((attachment) => attachment.filename === attachmentFilename && attachment.contentType === 'image/png')).toBe(true);

  const supabase = createAuthedSupabase(accessToken);
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_intents')
    .select('amount,currency,order_id,status')
    .eq('order_id', syncedOrder!.id);
  expect(paymentsError).toBeNull();
  expect(payments?.some((payment) =>
    payment.amount === 125000 &&
    payment.currency === 'PYG' &&
    payment.status === 'pending'
  )).toBe(true);
});

type OrderResponse = {
  id: string;
  customerName?: string;
  customer_name?: string;
  checkpoints?: Array<{ key: string; completed: boolean; actor?: string }>;
};

type AttachmentResponse = {
  filename: string;
  contentType: string;
};

function assertConfig(): void {
  const missing = [
    ...requiredEnv.filter((name) => !process.env[name]?.trim()),
    !supabaseUrl ? 'VITE_SUPABASE_URL' : '',
    !supabasePublishableKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : ''
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing E2E env vars: ${missing.join(', ')}`);
  }
}

async function signInForApi(): Promise<string> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.LIA_E2E_ADMIN_EMAIL!,
    password: process.env.LIA_E2E_ADMIN_PASSWORD!
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Supabase Auth não retornou token');
  }
  return data.session.access_token;
}

function createPublicSupabase() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function createAuthedSupabase(accessToken: string) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function onePixelPng(): number[] {
  return [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a,
    0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
    0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ];
}

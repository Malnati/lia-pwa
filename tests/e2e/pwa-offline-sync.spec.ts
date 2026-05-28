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

  const pwaUrl = new URL(baseURL ?? 'https://pwa.aneety.com/');
  pwaUrl.searchParams.set('e2e', e2eRun);
  await page.goto(pwaUrl.toString());
  await page.getByLabel('E-mail').fill(process.env.LIA_E2E_ADMIN_EMAIL!);
  await page.getByLabel('Senha').fill(process.env.LIA_E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Sessão ativa', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('offline', { exact: true })).toBeVisible();

  await page.getByLabel('Paciente/cliente').fill(customerName);
  await page.getByLabel('Telefone').fill('+595 21 555 000');
  await page.getByLabel('Produto').fill('Molde prótese PWA E2E');
  await page.getByLabel('Endereço de entrega').fill('PWA offline, Asunción');
  await page.getByLabel('Observações').fill('Criado offline no navegador e sincronizado depois.');
  await page.getByRole('button', { name: 'Salvar offline' }).click();
  await expect(page.getByText('pendente local')).toBeVisible();
  await expect(page.getByText(customerName)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('online', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sincronizar fila' }).click();
  await expect(page.getByText('sincronizado', { exact: true })).toBeVisible({ timeout: 30_000 });

  const accessToken = await signInForApi();
  const orders = await fetch(`${apiUrl}/api/orders`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  expect(orders.status).toBe(200);
  const payload = await orders.json() as Array<{ customerName?: string; customer_name?: string }>;
  expect(payload.some((order) => (order.customerName ?? order.customer_name) === customerName)).toBe(true);
});

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
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.LIA_E2E_ADMIN_EMAIL!,
    password: process.env.LIA_E2E_ADMIN_PASSWORD!
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Supabase Auth não retornou token');
  }
  return data.session.access_token;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, CloudOff, CreditCard, Database, FileImage, LoaderCircle, MapPinned, PackageCheck, ShieldCheck, UserCircle, Wifi } from 'lucide-react';

import { publishPendingOrder } from '@/lib/api';
import { apiUrl, hasSupabaseConfig } from '@/lib/config';
import {
  clearSyncedOrders,
  listPendingOrders,
  savePendingOrder,
  updatePendingOrder,
  type PendingOrder
} from '@/lib/offline-queue';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const checkpointOptions = [
  { key: 'pickup_checkin', label: 'Retirada · check-in' },
  { key: 'pickup_checkout', label: 'Retirada · check-out' },
  { key: 'lab_checkin', label: 'Laboratório · check-in' },
  { key: 'lab_checkout', label: 'Laboratório · check-out' },
  { key: 'delivery_checkin', label: 'Entrega · check-in' },
  { key: 'delivery_checkout', label: 'Entrega · check-out' },
  { key: 'customer_confirmation', label: 'Confirmação cliente' },
  { key: 'payment_confirmation', label: 'Confirmação pagamento' }
] as const;

const links = [
  { label: 'Portal', href: 'https://aneety.com/' },
  { label: 'API health', href: 'https://api.aneety.com/api/health' },
  { label: 'Core', href: 'https://core.aneety.com/' }
];

const operationTabs = [
  { value: 'pedidos', label: 'Pedidos' },
  { value: 'novo', label: 'Novo' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'anexos', label: 'Anexos' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'sync', label: 'Sync' },
  { value: 'perfil', label: 'Perfil' }
] as const;

type CheckpointKey = (typeof checkpointOptions)[number]['key'];
type PaymentCurrency = 'PYG' | 'USD';

type OrderDraft = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  product: string;
  notes: string;
  checkpointKey: CheckpointKey;
  checkpointActor: string;
  checkpointNotes: string;
  paymentAmount: string;
  paymentCurrency: PaymentCurrency;
  attachmentKind: 'photo' | 'signature';
};

const defaultDraft: OrderDraft = {
  customerName: '',
  customerPhone: '',
  deliveryAddress: '',
  product: 'Molde prótese',
  notes: '',
  checkpointKey: 'pickup_checkin',
  checkpointActor: 'Equipe PWA',
  checkpointNotes: 'Retirada registrada offline',
  paymentAmount: '125000',
  paymentCurrency: 'PYG',
  attachmentKind: 'photo'
};

export function App() {
  const supabase = useMemo(() => (hasSupabaseConfig ? createSupabaseBrowserClient() : null), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState(defaultDraft);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [statusMessage, setStatusMessage] = useState('Fila local pronta.');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = orders.filter((order) => order.status === 'pending' || order.status === 'failed').length;
  const syncedCount = orders.filter((order) => order.status === 'synced').length;
  const progressValue = orders.length === 0 ? 0 : Math.round((syncedCount / orders.length) * 100);
  const pickupOrders = orders.filter((order) => order.checkpoint?.key.startsWith('pickup_'));
  const deliveryOrders = orders.filter((order) => order.checkpoint?.key.startsWith('delivery_'));
  const attachmentOrders = orders.filter((order) => order.attachment || order.syncedArtifacts?.attachment);
  const paymentOrders = orders.filter((order) => order.payment || order.syncedArtifacts?.payment);

  useEffect(() => {
    void refreshQueue();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function refreshQueue() {
    setOrders(await listPendingOrders());
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage('Configuração pública Supabase ausente no build da PWA.');
      return;
    }

    setIsSigningIn(true);
    setErrorMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSigningIn(false);

    if (error || !data.session) {
      setErrorMessage(error?.message ?? 'Login Supabase falhou.');
      return;
    }

    setSession(data.session);
    setStatusMessage('Sessão ativa. Crie pedidos offline e sincronize quando voltar a conexão.');
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setStatusMessage('Sessão encerrada.');
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    const now = new Date().toISOString();
    const localId = crypto.randomUUID();
    const paymentAmount = Number.parseInt(draft.paymentAmount.replace(/\D/g, ''), 10);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setErrorMessage('Informe um valor de pagamento inteiro maior que zero.');
      return;
    }

    if (attachmentFile && !isSupportedAttachmentType(attachmentFile.type)) {
      setErrorMessage('Anexo deve ser imagem PNG, JPEG ou WebP.');
      return;
    }

    const localOrder: PendingOrder = {
      id: localId,
      clientId: `lia-pwa-${Date.now()}-${localId.slice(0, 8)}`,
      customerName: draft.customerName.trim(),
      customerPhone: draft.customerPhone.trim(),
      deliveryAddress: draft.deliveryAddress.trim(),
      product: draft.product.trim() || 'Molde prótese',
      notes: draft.notes.trim(),
      checkpoint: {
        key: draft.checkpointKey,
        actor: draft.checkpointActor.trim() || 'Equipe PWA',
        notes: draft.checkpointNotes.trim(),
        timestamp: now
      },
      payment: {
        amount: paymentAmount,
        currency: draft.paymentCurrency
      },
      attachment: attachmentFile
        ? {
            kind: draft.attachmentKind,
            filename: attachmentFile.name || `lia-pwa-${localId}.png`,
            contentType: attachmentFile.type,
            size: attachmentFile.size,
            clientAttachmentId: `lia-pwa-attachment-${localId}`,
            capturedAt: now,
            data: await attachmentFile.arrayBuffer()
          }
        : undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    if (!localOrder.customerName || !localOrder.customerPhone || !localOrder.deliveryAddress) {
      setErrorMessage('Informe nome, telefone e endereço antes de salvar.');
      return;
    }

    await savePendingOrder(localOrder);
    setDraft(defaultDraft);
    setAttachmentFile(null);
    setAttachmentInputKey((current) => current + 1);
    await refreshQueue();
    setStatusMessage(isOnline ? 'Pedido, checkpoint, pagamento e anexo salvos na fila local. Use Sincronizar fila para publicar na API.' : 'Pedido com artefatos salvo offline no IndexedDB.');
  }

  async function syncQueue() {
    if (!session?.access_token) {
      setErrorMessage('Faça login Supabase antes de sincronizar.');
      return;
    }
    if (!isOnline) {
      setErrorMessage('Sem conexão. A fila permanece local até voltar online.');
      return;
    }

    setIsSyncing(true);
    setErrorMessage('');
    setStatusMessage('Sincronizando fila com API real...');

    try {
      const rows = await listPendingOrders();
      const candidates = rows.filter((order) => order.status === 'pending' || order.status === 'failed');

      for (const order of candidates) {
        await updatePendingOrder(order.id, { status: 'syncing', error: undefined });
        try {
          const published = await publishPendingOrder(order, session.access_token);
          await updatePendingOrder(order.id, {
            status: 'synced',
            syncedAt: new Date().toISOString(),
            syncedOrderId: published.id,
            syncedArtifacts: published.syncedArtifacts,
            error: undefined
          });
        } catch (error) {
          await updatePendingOrder(order.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Falha ao publicar pedido'
          });
        }
      }

      await refreshQueue();
      setStatusMessage('Sincronização concluída contra API Worker/Hono publicada.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function clearSynced() {
    await clearSyncedOrders();
    await refreshQueue();
    setStatusMessage('Pedidos sincronizados removidos da fila local.');
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <Badge className="w-fit" variant="secondary">Operação em campo</Badge>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">Lia PWA</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                PWA mobile/offline-first com Supabase Auth, fila IndexedDB e sync real via {apiUrl}.
              </p>
            </div>
          </div>
          <Button asChild>
            <a href="https://pwa.aneety.com/">Abrir URL pública</a>
          </Button>
        </div>

        <Alert>
          <ShieldCheck />
          <AlertTitle>Arquitetura vigente</AlertTitle>
          <AlertDescription>Cloudflare Pages Free + Supabase Auth + API real Worker/Hono + Supabase/Postgres. Sem backend local de navegador como aceite.</AlertDescription>
        </Alert>

        {errorMessage && (
          <Alert variant="destructive" data-testid="error-alert">
            <CloudOff />
            <AlertTitle>Ação bloqueada</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Login Supabase</CardTitle>
            <CardDescription>Use credenciais reais do tenant E2E. Service role nunca entra no frontend.</CardDescription>
          </CardHeader>
          <CardContent>
            {session ? (
              <div className="flex flex-col gap-3">
                <Badge className="w-fit" variant="secondary">Sessão ativa</Badge>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
                <Button type="button" variant="outline" onClick={() => void signOut()}>Sair</Button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={(event) => void signIn(event)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">E-mail</FieldLabel>
                    <Input id="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Senha</FieldLabel>
                    <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={isSigningIn || !hasSupabaseConfig}>
                  {isSigningIn && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                  Entrar
                </Button>
                {!hasSupabaseConfig && <p className="text-sm text-destructive">Build sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY.</p>}
              </form>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="novo" className="flex-col gap-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {operationTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="pedidos">
            <OrdersPanel
              title="Pedidos locais"
              description="Lista operacional de pedidos no IndexedDB com status e artefatos de sync."
              orders={orders}
              emptyMessage="Nenhum pedido local."
            />
          </TabsContent>

          <TabsContent value="novo">
            <Card>
              <CardHeader>
                <CardTitle>Novo pedido offline</CardTitle>
                <CardDescription>Funciona sem rede após o login. Pedido, checkpoint, pagamento e anexo ficam em IndexedDB até sincronizar.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 lg:grid-cols-3" onSubmit={(event) => void saveDraft(event)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="customerName">Paciente/cliente</FieldLabel>
                      <Input id="customerName" value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="customerPhone">Telefone</FieldLabel>
                      <Input id="customerPhone" value={draft.customerPhone} onChange={(event) => setDraft((current) => ({ ...current, customerPhone: event.target.value }))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="product">Produto</FieldLabel>
                      <Input id="product" value={draft.product} onChange={(event) => setDraft((current) => ({ ...current, product: event.target.value }))} />
                    </Field>
                  </FieldGroup>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="deliveryAddress">Endereço de entrega</FieldLabel>
                      <Input id="deliveryAddress" value={draft.deliveryAddress} onChange={(event) => setDraft((current) => ({ ...current, deliveryAddress: event.target.value }))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notes">Observações</FieldLabel>
                      <Textarea id="notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                      <FieldDescription>Será enviado para `notes` do pedido quando sincronizar.</FieldDescription>
                    </Field>
                  </FieldGroup>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="checkpointKey">Checkpoint</FieldLabel>
                      <Select value={draft.checkpointKey} onValueChange={(value) => setDraft((current) => ({ ...current, checkpointKey: value as CheckpointKey }))}>
                        <SelectTrigger id="checkpointKey" className="w-full">
                          <SelectValue placeholder="Escolha um checkpoint" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {checkpointOptions.map((checkpoint) => (
                              <SelectItem key={checkpoint.key} value={checkpoint.key}>{checkpoint.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="checkpointActor">Responsável pelo checkpoint</FieldLabel>
                      <Input id="checkpointActor" value={draft.checkpointActor} onChange={(event) => setDraft((current) => ({ ...current, checkpointActor: event.target.value }))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="checkpointNotes">Notas do checkpoint</FieldLabel>
                      <Textarea id="checkpointNotes" value={draft.checkpointNotes} onChange={(event) => setDraft((current) => ({ ...current, checkpointNotes: event.target.value }))} />
                      <FieldDescription>Será publicado via `PATCH /api/orders/:id/checkpoints/:key`.</FieldDescription>
                    </Field>
                  </FieldGroup>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="paymentAmount">Valor do pagamento</FieldLabel>
                      <Input id="paymentAmount" inputMode="numeric" value={draft.paymentAmount} onChange={(event) => setDraft((current) => ({ ...current, paymentAmount: event.target.value }))} />
                      <FieldDescription>Valor inteiro em centavos/unidade operacional enviado ao Worker.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="paymentCurrency">Moeda</FieldLabel>
                      <Select value={draft.paymentCurrency} onValueChange={(value) => setDraft((current) => ({ ...current, paymentCurrency: value as PaymentCurrency }))}>
                        <SelectTrigger id="paymentCurrency" className="w-full">
                          <SelectValue placeholder="Moeda" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="PYG">PYG</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="attachmentFile">Anexo offline</FieldLabel>
                      <Input
                        key={attachmentInputKey}
                        id="attachmentFile"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                      />
                      <FieldDescription>
                        {attachmentFile ? `${attachmentFile.name} · ${Math.round(attachmentFile.size / 1024)} KB` : 'Opcional; será enviado para `/api/orders/:id/attachments`.'}
                      </FieldDescription>
                    </Field>
                    <Button type="submit">Salvar offline</Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retirada">
            <OrdersPanel
              title="Retirada"
              description="Check-ins e check-outs de retirada capturados offline para publicação no Worker."
              orders={pickupOrders}
              emptyMessage="Nenhuma retirada local."
              icon={MapPinned}
            />
          </TabsContent>

          <TabsContent value="entrega">
            <OrdersPanel
              title="Entrega"
              description="Checkpoints de entrega pendentes ou sincronizados na operação mobile."
              orders={deliveryOrders}
              emptyMessage="Nenhuma entrega local."
              icon={PackageCheck}
            />
          </TabsContent>

          <TabsContent value="anexos">
            <OrdersPanel
              title="Anexos"
              description="Fotos e assinaturas permanecem no IndexedDB até sync real em `/api/orders/:id/attachments`."
              orders={attachmentOrders}
              emptyMessage="Nenhum anexo local."
              icon={FileImage}
            />
          </TabsContent>

          <TabsContent value="pagamento">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard />Pagamento</CardTitle>
                <CardDescription>Intenções de pagamento offline; publicação exige conexão e JWT Supabase.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Alert>
                  <Wifi />
                  <AlertTitle>Pagamento online</AlertTitle>
                  <AlertDescription>O valor pode ser preparado offline, mas a intenção só é criada no Supabase/Postgres quando a PWA voltar online.</AlertDescription>
                </Alert>
                <OrderList orders={paymentOrders} emptyMessage="Nenhum pagamento local." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle>Sync API/Postgres</CardTitle>
                <CardDescription>Fila local sincronizada contra `https://api.aneety.com` com token Supabase do usuário.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatusPill label="Rede" value={isOnline ? 'online' : 'offline'} icon={isOnline ? Wifi : CloudOff} />
                  <StatusPill label="Pendentes" value={String(pendingCount)} icon={Activity} />
                  <StatusPill label="Sincronizados" value={String(syncedCount)} icon={Database} />
                </div>
                <Progress aria-label="Progresso de sincronização" value={progressValue} />
                <p className="text-sm text-muted-foreground" data-testid="status-message">{statusMessage}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void syncQueue()} disabled={isSyncing || !session || !isOnline || pendingCount === 0}>
                    {isSyncing && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                    Sincronizar fila
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void clearSynced()} disabled={syncedCount === 0}>Limpar sincronizados</Button>
                </div>
                <Separator />
                <OrderList orders={orders} emptyMessage="Nenhum item na fila local." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="perfil">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserCircle />Perfil</CardTitle>
                <CardDescription>Identidade Supabase, links de operação e baseline shadcn deste frontend.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={session ? 'secondary' : 'outline'}>{session ? 'sessão ativa' : 'sem sessão'}</Badge>
                  <Badge variant="outline">service role fora do frontend</Badge>
                  <Badge variant="outline">components.json versionado</Badge>
                  <Badge variant="outline">Tabs shadcn</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{session?.user.email ?? 'Faça login para sincronizar pedidos reais.'}</p>
                <Separator />
                <nav className="flex flex-wrap gap-3">
                  {links.map((link) => (
                    <Button key={link.href} asChild variant="outline">
                      <a href={link.href}>{link.label}</a>
                    </Button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

type StatusPillProps = {
  label: string;
  value: string;
  icon: typeof Activity;
};

function StatusPill({ label, value, icon: Icon }: StatusPillProps) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon />{label}</div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

type OrdersPanelProps = {
  title: string;
  description: string;
  orders: PendingOrder[];
  emptyMessage: string;
  icon?: typeof Activity;
};

function OrdersPanel({ title, description, orders, emptyMessage, icon: Icon }: OrdersPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{Icon && <Icon />}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <OrderList orders={orders} emptyMessage={emptyMessage} />
      </CardContent>
    </Card>
  );
}

type OrderListProps = {
  orders: PendingOrder[];
  emptyMessage: string;
};

function OrderList({ orders, emptyMessage }: OrderListProps) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <div key={order.id} className="rounded-lg border border-border p-3" data-testid="local-order" data-client-id={order.clientId}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{order.customerName}</p>
              <p className="text-sm text-muted-foreground">{order.product} · {order.deliveryAddress}</p>
              <p className="text-xs text-muted-foreground">clientId: {order.clientId}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {order.checkpoint && <Badge variant="outline">checkpoint: {checkpointLabel(order.checkpoint.key)}</Badge>}
                {order.payment && <Badge variant="outline">pagamento: {order.payment.currency} {order.payment.amount}</Badge>}
                {order.attachment && <Badge variant="outline">anexo: {order.attachment.filename}</Badge>}
              </div>
            </div>
            <Badge variant={order.status === 'synced' ? 'secondary' : order.status === 'failed' ? 'destructive' : 'outline'}>
              {statusLabel(order.status)}
            </Badge>
          </div>
          {order.syncedArtifacts && (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="synced-artifacts">
              {order.syncedArtifacts.checkpoint && <Badge variant="secondary">checkpoint sincronizado</Badge>}
              {order.syncedArtifacts.payment && <Badge variant="secondary">pagamento sincronizado</Badge>}
              {order.syncedArtifacts.attachment && <Badge variant="secondary">anexo sincronizado</Badge>}
            </div>
          )}
          {order.syncedOrderId && <p className="mt-2 text-xs text-muted-foreground">Pedido publicado: {order.syncedOrderId}</p>}
          {order.error && <p className="mt-2 text-xs text-destructive">{order.error}</p>}
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: PendingOrder['status']) {
  if (status === 'synced') return 'sincronizado';
  if (status === 'syncing') return 'sincronizando';
  if (status === 'failed') return 'falhou';
  return 'pendente local';
}

function checkpointLabel(key: NonNullable<PendingOrder['checkpoint']>['key']) {
  return checkpointOptions.find((checkpoint) => checkpoint.key === key)?.label ?? key;
}

function isSupportedAttachmentType(contentType: string) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(contentType);
}

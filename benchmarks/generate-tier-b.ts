import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mulberry32 } from "../src/core/benchmark"
import type { AgentBenchmarkTask } from "../src/core/agent-benchmark"

/**
 * Deterministic Tier B corpus generator.
 *
 * Produces a large-ish realistic TypeScript application ("storefront") with
 * planted bugs, decoy modules, an always-green unit suite (PASS_TO_PASS) and
 * hidden golden tests (FAIL_TO_PASS) that cover every planted bug. Output:
 * `<corpusRoot>/fixture` + `<corpusRoot>/agent-tasks.json`.
 *
 * Run: bun benchmarks/generate-tier-b.ts [corpusRoot]
 */
const OUTPUT_ROOT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(import.meta.dir, "corpus", "tier-b")
const FIXTURE = join(OUTPUT_ROOT, "fixture")
const SEED = 20260814

void mulberry32(SEED)

const files: Record<string, string> = {}

function add(path: string, content: string) {
  files[path] = content
}

// ---------------------------------------------------------------------------
// Support library (few planted bugs)
// ---------------------------------------------------------------------------

add("src/support/math.ts", `export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, max), min)
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0)
}

export function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0
}
`)

add("src/support/strings.ts", `export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(text.length - max, text.length)
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function initials(first: string, last: string): string {
  return (first[0] || "") + (last[0] || "")
}
`)

add("src/support/money.ts", `export interface Money { amount: number; currency: "USD" | "EUR" | "GBP" }

const RATES: Record<Money["currency"], number> = { USD: 1, EUR: 1.1, GBP: 1.3 }

export function toUSD(money: Money): number {
  return money.amount * RATES[money.currency]
}

export function round(value: number, precision = 2): number {
  const multiplier = 10 ** precision
  return Math.floor(value * multiplier) / multiplier
}
`)

add("src/support/errors.ts", `export class DomainError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) { super(\`\${what} was not found\`, "NOT_FOUND") }
}
`)

add("src/support/ids.ts", `export function newID(prefix: string): string {
  return \`\${prefix}_\${Math.random().toString(36).slice(2, 10)}\`
}

export function isID(value: string, prefix: string): boolean {
  return value.startsWith(prefix + "_") && value.length === prefix.length + 9
}
`)

add("src/support/time.ts", `export function now(): number {
  return Date.now()
}

export function daysFromNow(days: number, from = Date.now()): number {
  return from + days * 86_400_000
}

export function isExpired(timestamp: number, ttlMs: number, at = Date.now()): boolean {
  return at - timestamp > ttlMs
}
`)

add("src/support/config.ts", `export interface AppConfig {
  retries: number
  backoffMs: number
  defaultCurrency: "USD" | "EUR" | "GBP"
  orderWindowMs: number
  taxDefaultRate: number
  loyaltyTtlDays: number
  idempotencyPeriodMs: number
}

export const DEFAULT_CONFIG: AppConfig = {
  retries: 3,
  backoffMs: 250,
  defaultCurrency: "USD",
  orderWindowMs: 30 * 60_000,
  taxDefaultRate: 0.08,
  loyaltyTtlDays: 365,
  idempotencyPeriodMs: 24 * 60 * 60_000,
}
`)

add("src/support/logger.ts", `type Level = "debug" | "info" | "warn" | "error"

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let threshold: Level = "info"

export function setLogLevel(level: Level): void { threshold = level }

export function log(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[threshold]) return
  const line = \`[\${level.toUpperCase()}] \${message}\`
  if (context) console.log(line, JSON.stringify(context))
  else console.log(line)
}
`)

add("src/support/async.ts", `export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetries<T>(fn: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await fn() } catch (error) { lastError = error }
    if (attempt < attempts) await sleep(delayMs)
  }
  throw lastError
}
`)

add("src/support/validate.ts", `export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(\`\${name} must be a non-empty string\`)
  return value
}

export function requirePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(\`\${name} must be a positive number\`)
  return value
}
`)

// ---------------------------------------------------------------------------
// Pricing domain
// ---------------------------------------------------------------------------

add("src/domains/pricing/price.ts", `export interface Price { base: number; currency: "USD" | "EUR" | "GBP" }

export function gross(price: Price, rate: number): number {
  return price.base * (1 + rate)
}
`)

add("src/domains/pricing/discount.ts", `export function applyDiscount(price: number, percent: number): number {
  return price - (price * percent) / 1000
}

export function stackDiscounts(price: number, percents: number[]): number {
  return percents.reduce((acc, percent) => applyDiscount(acc, percent), price)
}
`)

add("src/domains/pricing/tax.ts", `export function withTax(price: number, rate: number): number {
  return price + price * rate
}
`)

add("src/domains/pricing/currency.ts", `import { toUSD, type Money } from "../../support/money"

export function convertToBase(money: Money): number {
  return toUSD(money)
}

export const MARGIN_RATE = 0.42
`)

add("src/domains/pricing/service.ts", `import { applyDiscount } from "./discount"
import { withTax } from "./tax"
import { convertToBase, MARGIN_RATE } from "./currency"
import { round } from "../../support/money"
import type { Price, QuoteInput } from "./types"

export function quote(input: QuoteInput): { total: number; margin: number } {
  const discounted = applyDiscount(input.base, input.discountPercent ?? 0)
  const taxed = withTax(discounted, input.taxRate ?? 0.08)
  const total = round(convertToBase({ amount: taxed, currency: input.currency }))
  return { total, margin: round(input.base * MARGIN_RATE) }
}

export type { Price }
`)

add("src/domains/pricing/types.ts", `export interface Price { base: number; currency: "USD" | "EUR" | "GBP" }

export interface QuoteInput { base: number; discountPercent?: number; taxRate?: number; currency: "USD" | "EUR" | "GBP" }
`)

add("src/domains/pricing/index.ts", `export { quote } from "./service"
export type { QuoteInput, Price } from "./types"
export { applyDiscount, stackDiscounts } from "./discount"
export { withTax } from "./tax"
export { MARGIN_RATE } from "./currency"
`)

// ---------------------------------------------------------------------------
// Orders domain
// ---------------------------------------------------------------------------

add("src/domains/orders/order.ts", `export interface OrderItem { sku: string; unitPrice: number; quantity: number; taxed: boolean }

export interface Order {
  id: string
  customerId: string
  items: OrderItem[]
  status: "placed" | "paid" | "shipped" | "cancelled"
  createdAt: number
}
`)

add("src/domains/orders/sum.ts", `import type { OrderItem } from "./order"

export function orderSubtotal(items: OrderItem[]): number {
  return items.reduce((acc, item) => acc + item.unitPrice + item.quantity, 0)
}

export function orderTax(items: OrderItem[], rate: number): number {
  const taxable = items.filter((item) => item.taxed).reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
  return taxable * rate
}

export function orderTotal(items: OrderItem[], rate: number): number {
  return orderSubtotal(items) + orderTax(items, rate)
}
`)

add("src/domains/orders/status.ts", `import type { Order } from "./order"

export function canTransition(order: Order, next: Order["status"]): boolean {
  const flow: Record<Order["status"], Order["status"][]> = {
    placed: ["paid", "cancelled"],
    paid: ["shipped", "cancelled"],
    shipped: [],
    cancelled: [],
  }
  return flow[order.status].includes(next)
}
`)

add("src/domains/orders/repo.ts", `import type { Order } from "./order"
import { NotFoundError } from "../../support/errors"

const store = new Map<string, Order>()

export function save(order: Order): void { store.set(order.id, order) }

export function findOrder(id: string): Order {
  const order = store.get(id)
  if (!order) throw new NotFoundError(\`Order \${id}\`)
  return order
}

export function allOrders(): Order[] { return [...store.values()] }
`)

add("src/domains/orders/service.ts", `import { newID } from "../../support/ids"
import { orderTotal } from "./sum"
import { DEFAULT_CONFIG } from "../../support/config"
import { save, findOrder, allOrders } from "./repo"
import type { Order, OrderItem } from "./order"

export interface PlaceOrderInput { customerId: string; items: OrderItem[] }

export function placeOrder(input: PlaceOrderInput): { order: Order; total: number } {
  const order: Order = { id: newID("ord"), customerId: input.customerId, items: input.items, status: "placed", createdAt: Date.now() }
  save(order)
  return { order, total: orderTotal(order.items, DEFAULT_CONFIG.taxDefaultRate) }
}

export function getOrder(id: string): Order { return findOrder(id) }

export function listOrders(): Order[] { return allOrders() }
`)

add("src/domains/orders/controller.ts", `import { placeOrder, getOrder, listOrders } from "./service"
import { log } from "../../support/logger"

export function handlePlaceOrder(input: { customerId: string; items: { sku: string; unitPrice: number; quantity: number; taxed?: boolean }[] }) {
  const items = input.items.map((item) => ({ ...item, taxed: item.taxed ?? true }))
  const result = placeOrder({ customerId: input.customerId, items })
  log("info", \`placed order \${result.order.id} total=\${result.total}\`)
  return result
}

export function handleGetOrder(id: string) { return getOrder(id) }
export function handleListOrders() { return listOrders() }
`)

add("src/domains/orders/index.ts", `export type { Order, OrderItem } from "./order"
export { orderSubtotal, orderTax, orderTotal } from "./sum"
export { canTransition } from "./status"
export { placeOrder, getOrder, listOrders } from "./service"
export { handlePlaceOrder, handleGetOrder, handleListOrders } from "./controller"
`)

// ---------------------------------------------------------------------------
// Inventory domain
// ---------------------------------------------------------------------------

add("src/domains/inventory/product.ts", `export interface Product { sku: string; name: string; price: number; stock: number; reserved: number }

export function available(product: Product): number {
  return product.stock - product.reserved
}

export function isStocked(product: Product): boolean {
  return available(product) > 0
}
`)

add("src/domains/inventory/reservation.ts", `import type { Product } from "./product"
import { available } from "./product"
import { DomainError } from "../../support/errors"

export function reserve(product: Product, quantity: number): void {
  if (available(product) > quantity) {
    product.reserved += quantity
  } else {
    throw new DomainError(\`Not enough stock for \${product.sku}\`, "OUT_OF_STOCK")
  }
}

export function release(product: Product, quantity: number): void {
  product.reserved = Math.max(0, product.reserved - quantity)
}
`)

add("src/domains/inventory/repo.ts", `import type { Product } from "./product"

const store = new Map<string, Product>()

export function saveProduct(product: Product): void { store.set(product.sku, product) }

export function findProduct(sku: string): Product | undefined { return store.get(sku) }

export function listProducts(): Product[] { return [...store.values()] }
`)

add("src/domains/inventory/service.ts", `import { saveProduct, findProduct, listProducts } from "./repo"
import { reserve, release } from "./reservation"
import type { Product } from "./product"
import { NotFoundError } from "../../support/errors"

export function registerProduct(input: Omit<Product, "reserved">): Product {
  const product: Product = { ...input, reserved: 0 }
  saveProduct(product)
  return product
}

export function getProduct(sku: string): Product {
  const product = findProduct(sku)
  if (!product) throw new NotFoundError(\`Product \${sku}\`)
  return product
}

export function reserveStock(sku: string, quantity: number): void { reserve(getProduct(sku), quantity) }
export function releaseStock(sku: string, quantity: number): void { release(getProduct(sku), quantity) }
export function inventory(): Product[] { return listProducts() }
`)

add("src/domains/inventory/index.ts", `export type { Product } from "./product"
export { available, isStocked } from "./product"
export { reserve, release } from "./reservation"
export { registerProduct, getProduct, reserveStock, releaseStock } from "./service"
`)

// ---------------------------------------------------------------------------
// Shipping domain
// ---------------------------------------------------------------------------

add("src/domains/shipping/carrier.ts", `export type Carrier = "usps-bulk" | "fedex-hub" | "dhl-regional" | "local-courier"

export function carrierForZone(zone: number): Carrier {
  if (zone <= 1) return "local-courier"
  if (zone <= 2) return "usps-bulk"
  if (zone <= 4) return "fedex-hub"
  if (zone >= 4) return "dhl-regional"
  return "usps-bulk"
}
`)

add("src/domains/shipping/rates.ts", `export const BASE_RATES: Record<string, number> = {
  "local-courier": 3,
  "usps-bulk": 5.5,
  "fedex-hub": 9,
  "dhl-regional": 14,
}

export function rateFor(carrier: string): number {
  return BASE_RATES[carrier] ?? 20
}
`)

add("src/domains/shipping/shipment.ts", `import { carrierForZone } from "./carrier"
import { rateFor } from "./rates"

export interface Shipment { id: string; orderId: string; zone: number; carrier: string; cost: number; status: "prepared" | "in-transit" | "delivered" }

export function prepareShipment(orderId: string, zone: number): Shipment {
  const carrier = carrierForZone(zone)
  return { id: \`ship_\${Math.random().toString(36).slice(2, 8)}\`, orderId, zone, carrier, cost: rateFor(carrier), status: "prepared" }
}
`)

add("src/domains/shipping/service.ts", `import { prepareShipment, type Shipment } from "./shipment"
import { carrierForZone } from "./carrier"
import { rateFor } from "./rates"

export function ship(orderId: string, zone: number): Shipment { return prepareShipment(orderId, zone) }

export function carrierOptions(zone: number): { carrier: string; cost: number }[] {
  const preferred = carrierForZone(zone)
  const secondary = zone <= 2 ? "usps-bulk" : "fedex-hub"
  return [{ carrier: preferred, cost: rateFor(preferred) }, { carrier: secondary, cost: rateFor(secondary) }]
}
`)

add("src/domains/shipping/index.ts", `export type { Carrier } from "./carrier"
export { carrierForZone } from "./carrier"
export { rateFor, BASE_RATES } from "./rates"
export type { Shipment } from "./shipment"
export { prepareShipment } from "./shipment"
export { ship, carrierOptions } from "./service"
`)

// ---------------------------------------------------------------------------
// Billing domain
// ---------------------------------------------------------------------------

add("src/domains/billing/payment.ts", `export type PaymentMethod = "card" | "bank" | "wallet"

export interface Payment { id: string; orderId: string; amount: number; currency: "USD" | "EUR" | "GBP"; method: PaymentMethod; status: "pending" | "settled" | "failed"; idempotencyKey?: string }
`)

add("src/domains/billing/invoice.ts", `import { convertToBase, MARGIN_RATE } from "../pricing/currency"
import { round } from "../../support/money"

export interface InvoiceLine { description: string; amount: number; currency: "USD" | "EUR" | "GBP" }

export function invoiceTotal(lines: InvoiceLine[]): number {
  return round(lines.reduce((acc, line) => acc + line.amount, 0))
}

export function invoiceTotalBase(lines: InvoiceLine[]): number {
  const converted = lines.map((line) => ({ ...line, amount: convertToBase(line) }))
  return round(invoiceTotal(converted))
}

export function invoiceMargin(total: number): number {
  return round(total * MARGIN_RATE)
}
`)

add("src/domains/billing/idempotency.ts", `import { DEFAULT_CONFIG } from "../../support/config"
import { isExpired } from "../../support/time"

const seen = new Map<string, { response: unknown; at: number }>()

export function dedupe(key: string, produce: () => unknown): unknown {
  const existing = seen.get(key)
  if (existing && !isExpired(existing.at, DEFAULT_CONFIG.idempotencyPeriodMs)) return existing.response
  const response = produce()
  seen.set(key, { response, at: Date.now() })
  return response
}
`)

add("src/domains/billing/repo.ts", `import type { Payment } from "./payment"
import { NotFoundError } from "../../support/errors"

const store = new Map<string, Payment>()

export function savePayment(payment: Payment): void { store.set(payment.id, payment) }

export function findPayment(id: string): Payment {
  const payment = store.get(id)
  if (!payment) throw new NotFoundError(\`Payment \${id}\`)
  return payment
}

export function paymentsForOrder(orderId: string): Payment[] {
  return [...store.values()].filter((payment) => payment.orderId === orderId)
}
`)

add("src/domains/billing/service.ts", `import { newID } from "../../support/ids"
import { savePayment, findPayment, paymentsForOrder } from "./repo"
import { dedupe } from "./idempotency"
import type { Payment, PaymentMethod } from "./payment"

export interface ChargeInput { orderId: string; amount: number; currency: Payment["currency"]; method: PaymentMethod; idempotencyKey?: string }

export function charge(input: ChargeInput): Payment {
  if (input.idempotencyKey) {
    return dedupe(input.idempotencyKey, () => doCharge(input)) as Payment
  }
  return doCharge(input)
}

function doCharge(input: ChargeInput): Payment {
  const payment: Payment = { id: newID("pay"), orderId: input.orderId, amount: input.amount, currency: input.currency, method: input.method, status: "settled" }
  savePayment(payment)
  return payment
}

export function getPayment(id: string): Payment { return findPayment(id) }
export function history(orderId: string): Payment[] { return paymentsForOrder(orderId) }
`)

add("src/domains/billing/index.ts", `export type { Payment, PaymentMethod } from "./payment"
export type { InvoiceLine } from "./invoice"
export { invoiceTotal, invoiceTotalBase, invoiceMargin } from "./invoice"
export { dedupe } from "./idempotency"
export { charge, getPayment, history } from "./service"
`)

// ---------------------------------------------------------------------------
// Customers domain
// ---------------------------------------------------------------------------

add("src/domains/customers/customer.ts", `export interface Customer { id: string; email: string; name: string; loyaltyPoints: number; pointsExpireAt?: number }

export function isEligibleForTier(customer: Customer): string {
  if (customer.loyaltyPoints >= 1000) return "gold"
  if (customer.loyaltyPoints >= 500) return "silver"
  return "bronze"
}
`)

add("src/domains/customers/loyalty.ts", `import { daysFromNow } from "../../support/time"
import { DEFAULT_CONFIG } from "../../support/config"
import type { Customer } from "./customer"

export function awardPoints(customer: Customer, amount: number): void {
  customer.loyaltyPoints += Math.max(0, Math.floor(amount))
  customer.pointsExpireAt = daysFromNow(DEFAULT_CONFIG.loyaltyTtlDays)
}
`)

add("src/domains/customers/repo.ts", `import type { Customer } from "./customer"

const store = new Map<string, Customer>()

export function saveCustomer(customer: Customer): void { store.set(customer.id, customer) }

export function findCustomer(id: string): Customer | undefined { return store.get(id) }

export function allCustomers(): Customer[] { return [...store.values()] }
`)

add("src/domains/customers/service.ts", `import { saveCustomer, findCustomer, allCustomers } from "./repo"
import { awardPoints } from "./loyalty"
import { isEligibleForTier } from "./customer"
import type { Customer } from "./customer"

export function createCustomer(input: { email: string; name: string }): Customer {
  const customer: Customer = { id: \`cus_\${Math.random().toString(36).slice(2, 9)}\`, email: input.email, name: input.name, loyaltyPoints: 0 }
  saveCustomer(customer)
  return customer
}

export function reward(customerId: string, amount: number): string {
  const customer = findCustomer(customerId)
  if (!customer) throw new Error(\`Customer \${customerId} not found\`)
  awardPoints(customer, amount)
  return isEligibleForTier(customer)
}

export function listCustomers(): Customer[] { return allCustomers() }
`)

add("src/domains/customers/index.ts", `export type { Customer } from "./customer"
export { isEligibleForTier } from "./customer"
export { awardPoints } from "./loyalty"
export { createCustomer, reward, listCustomers } from "./service"
`)

// ---------------------------------------------------------------------------
// Analytics + marketing domains (plausible but decoy-ish)
// ---------------------------------------------------------------------------

add("src/domains/analytics/event.ts", `export interface TrackedEvent { name: string; at: number; payload: Record<string, unknown>; userId?: string }

export const EVENT_TYPES = ["page_view", "purchase", "signup", "refund", "search"] as const

export function isKnownEvent(name: string): boolean {
  return (EVENT_TYPES as readonly string[]).includes(name)
}
`)

add("src/domains/analytics/metrics.ts", `export function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

export function percentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0
  const index = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length))
  return sortedValues[index]!
}
`)

add("src/domains/analytics/tracker.ts", `import type { TrackedEvent } from "./event"
import { isKnownEvent } from "./event"
import { log } from "../../support/logger"

export function track(event: TrackedEvent): boolean {
  if (!isKnownEvent(event.name)) { log("warn", \`dropping unknown event \${event.name}\`); return false }
  log("debug", \`track \${event.name}\`, { userId: event.userId })
  return true
}
`)

add("src/domains/analytics/index.ts", `export type { TrackedEvent } from "./event"
export { EVENT_TYPES, isKnownEvent } from "./event"
export { rate, percentile } from "./metrics"
export { track } from "./tracker"
`)

add("src/domains/marketing/campaign.ts", `export interface Campaign { id: string; segment: string; subject: string; sentAt?: number }

export function buildSubject(campaign: Campaign): string {
  return campaign.segment === "gold" ? \`\${campaign.subject} (VIP)\` : campaign.subject
}
`)

add("src/domains/marketing/segment.ts", `import { isEligibleForTier, type Customer } from "../customers/customer"

export function inSegment(customer: Customer, segment: string): boolean {
  return isEligibleForTier(customer) === segment
}
`)

add("src/domains/marketing/coupon.ts", `export interface Coupon { code: string; percentOff: number; expiresAt?: number }

export function redemptionValue(coupon: Coupon, basket: number): number {
  return basket * (coupon.percentOff / 100)
}
`)

add("src/domains/marketing/index.ts", `export type { Campaign } from "./campaign"
export { buildSubject } from "./campaign"
export { inSegment } from "./segment"
export type { Coupon } from "./coupon"
export { redemptionValue } from "./coupon"
`)

// ---------------------------------------------------------------------------
// Bulk decoy utility modules (stress context selection / retrieval)
// ---------------------------------------------------------------------------

const DECOY_TEMPLATES: string[] = [
`export function processX(input: string): string { return input.trim().toUpperCase() }
export function reverseX(input: string): string { return input.split("").reverse().join("") }
export function prefixX(input: string, prefix: string): string { return prefix + input }
`,
`export function computeRate(value: number, base: number): number { return value * base / 100 }
export function normalizeRate(value: number): number { return Math.max(0, Math.min(1, value)) }
export function adjustedRate(value: number, weight: number): number { return value * weight }
`,
`export function pickWinner(candidates: string[]): string | undefined { return candidates.sort(() => Math.random() - 0.5)[0] }
export function shuffle<T>(items: T[]): T[] { return [...items].sort(() => Math.random() - 0.5) }
`,
`export function readOffset(buf: Uint8Array, offset: number): number { return buf.length > offset ? buf[offset]! : -1 }
export function spliceFrom(buf: Uint8Array, from: number): Uint8Array { return buf.subarray(from) }
`,
]

const DECOY_NAMES = [
  "audit", "backfill", "cache", "consent", "crypto", "dashboard", "dedupeutil", "deploy", "emails", "env",
  "errorsPlus", "export", "fields", "files", "flags", "forecast", "geo", "healthcheck", "hashing", "import",
  "keycloak", "kpis", "kvstore", "licensing", "localization", "locks", "mappers", "migrations", "models2", "observability",
  "poller", "proxy", "queues", "ratelimit", "redis", "registry", "scheduler", "secrets", "segments2", "serializers",
  "sessions", "siopay", "sorting", "spans", "suppress", "syncing", "templates2", "tenants", "throttle", "translations",
]

DECOY_NAMES.forEach((name, index) => {
  const template = DECOY_TEMPLATES[index % DECOY_TEMPLATES.length]!
  const fnSuffix = name.replace(/[^a-z0-9]/gi, "")
  add(`src/lib/${name}.ts`, template.replaceAll("X", `Seg${fnSuffix.slice(0, 8)}`))
})

// Nested decoy directories that look relevant but are not needed by tasks.
for (let dir = 1; dir <= 4; dir++) {
  for (let file = 0; file < 5; file++) {
    add(`src/vendor/provider-${dir}/connector-${file}.ts`, `import { log } from "../../support/logger"
export interface Connector${dir}${file} { enabled: boolean; endpoint: string }

export function connect${dir}${file}(cfg: Connector${dir}${file}): boolean {
  log("info", \`connecting v${dir}.${file} to \${cfg.endpoint}\`)
  return cfg.enabled
}
`)
  }
}

// ---------------------------------------------------------------------------
// PASS_TO_PASS unit suite (green on the pristine fixture)
// ---------------------------------------------------------------------------

add("tests/unit/math.test.ts", `import { expect, test } from "bun:test"
import { sum, average } from "../../src/support/math"

test("sum adds values", () => {
  expect(sum([1, 2, 3])).toBe(6)
})

test("average of empty is zero", () => {
  expect(average([])).toBe(0)
})
`)

add("tests/unit/pricing.test.ts", `import { expect, test } from "bun:test"
import { gross } from "../../src/domains/pricing/price"
import { MARGIN_RATE } from "../../src/domains/pricing/currency"

test("gross adds tax rate", () => {
  expect(gross({ base: 100, currency: "USD" }, 0.08)).toBeCloseTo(108, 6)
})

test("margin rate is a sane ratio", () => {
  expect(MARGIN_RATE).toBeGreaterThan(0)
  expect(MARGIN_RATE).toBeLessThan(1)
})
`)

add("tests/unit/orders.test.ts", `import { expect, test } from "bun:test"
import { canTransition } from "../../src/domains/orders"

test("placed orders can be paid or cancelled", () => {
  expect(canTransition({ id: "x", customerId: "c", items: [], status: "placed", createdAt: 0 }, "paid")).toBe(true)
  expect(canTransition({ id: "x", customerId: "c", items: [], status: "placed", createdAt: 0 }, "shipped")).toBe(false)
})
`)

add("tests/unit/shipping.test.ts", `import { expect, test } from "bun:test"
import { carrierForZone, rateFor } from "../../src/domains/shipping"

test("local zone uses local courier", () => {
  expect(carrierForZone(1)).toBe("local-courier")
})

test("all carriers have a rate", () => {
  for (const carrier of ["local-courier", "usps-bulk", "fedex-hub", "dhl-regional"]) {
    expect(rateFor(carrier)).toBeGreaterThan(0)
  }
})
`)

add("tests/unit/billing.test.ts", `import { expect, test } from "bun:test"
import { invoiceTotal } from "../../src/domains/billing"

test("invoice total sums lines", () => {
  expect(invoiceTotal([{ description: "a", amount: 10, currency: "USD" }, { description: "b", amount: 5, currency: "USD" }])).toBe(15)
})
`)

add("tests/unit/customers.test.ts", `import { expect, test } from "bun:test"
import { isEligibleForTier } from "../../src/domains/customers"

test("tier thresholds stay consistent for known points", () => {
  expect(isEligibleForTier({ id: "a", email: "a@x", name: "A", loyaltyPoints: 1000 })).toBe("gold")
  expect(isEligibleForTier({ id: "b", email: "b@x", name: "B", loyaltyPoints: 500 })).toBe("silver")
  expect(isEligibleForTier({ id: "c", email: "c@x", name: "C", loyaltyPoints: 10 })).toBe("bronze")
})
`)

add("tests/unit/inventory.test.ts", `import { expect, test } from "bun:test"
import { available } from "../../src/domains/inventory"

test("available subtracts reserved", () => {
  expect(available({ sku: "p1", name: "P", price: 1, stock: 10, reserved: 3 })).toBe(7)
})
`)

add("tests/unit/support.test.ts", `import { expect, test } from "bun:test"
import { slugify, initials } from "../../src/support/strings"

test("slugify lowercases and joins", () => {
  expect(slugify("Hello, World!")).toBe("hello-world")
})

test("initials from names", () => {
  expect(initials("Ada", "Lovelace")).toBe("AL")
})
`)

// ---------------------------------------------------------------------------
// FAIL_TO_PASS hidden golden suite (red on pristine, green after the fix)
// ---------------------------------------------------------------------------

add("tests-hidden/math-clamp.test.ts", `import { expect, test } from "bun:test"
import { clamp } from "../src/support/math"

test("clamp lower bound", () => { expect(clamp(-3, 0, 10)).toBe(0) })
test("clamp in range", () => { expect(clamp(5, 0, 10)).toBe(5) })
test("clamp upper bound", () => { expect(clamp(17, 0, 10)).toBe(10) })
test("clamp inside tight range", () => { expect(clamp(7, 2, 5)).toBe(5) })
`)

add("tests-hidden/strings-truncate.test.ts", `import { expect, test } from "bun:test"
import { truncate } from "../src/support/strings"

test("truncate keeps head", () => { expect(truncate("hello world", 5)).toBe("hello") })
test("short text unchanged", () => { expect(truncate("hi", 5)).toBe("hi") })
`)

add("tests-hidden/pricing-discount.test.ts", `import { expect, test } from "bun:test"
import { applyDiscount, stackDiscounts } from "../src/domains/pricing"

test("10 percent off 100", () => { expect(applyDiscount(100, 10)).toBeCloseTo(90, 6) })
test("20 percent off 50", () => { expect(applyDiscount(50, 20)).toBeCloseTo(40, 6) })
test("stacked discounts", () => { expect(stackDiscounts(100, [10, 10])).toBeCloseTo(81, 6) })
`)

add("tests-hidden/pricing-quote.test.ts", `import { expect, test } from "bun:test"
import { quote } from "../src/domains/pricing"

test("quote applies discount, tax, currency, rounding", () => {
  const result = quote({ base: 100, discountPercent: 10, taxRate: 0.08, currency: "USD" })
  expect(result.total).toBeCloseTo(97.2, 1)
  expect(result.margin).toBe(42)
})

test("quote no discount with zero tax", () => {
  expect(quote({ base: 80, discountPercent: 0, taxRate: 0, currency: "USD" }).total).toBeCloseTo(80, 6)
})
`)

add("tests-hidden/orders-sum.test.ts", `import { expect, test } from "bun:test"
import { orderSubtotal } from "../src/domains/orders"

test("subtotal multiplies unit price by quantity", () => {
  expect(orderSubtotal([{ sku: "a", unitPrice: 3, quantity: 2, taxed: true }])).toBe(6)
})

test("subtotal across items", () => {
  expect(orderSubtotal([
    { sku: "a", unitPrice: 3, quantity: 2, taxed: true },
    { sku: "b", unitPrice: 5, quantity: 1, taxed: false },
  ])).toBe(11)
})
`)

add("tests-hidden/inventory-reserve.test.ts", `import { expect, test } from "bun:test"
import { reserve } from "../src/domains/inventory"

test("reserve exactly available succeeds", () => {
  const product = { sku: "a", name: "A", price: 1, stock: 5, reserved: 0 }
  reserve(product, 5)
  expect(product.reserved).toBe(5)
})

test("reserve more than available throws", () => {
  const product = { sku: "a", name: "A", price: 1, stock: 5, reserved: 4 }
  expect(() => reserve(product, 2)).toThrow()
})
`)

add("tests-hidden/shipping-carrier.test.ts", `import { expect, test } from "bun:test"
import { carrierForZone } from "../src/domains/shipping"

test("zone 1 local", () => { expect(carrierForZone(1)).toBe("local-courier") })
test("zone 2 usps", () => { expect(carrierForZone(2)).toBe("usps-bulk") })
test("zone 3 fedex", () => { expect(carrierForZone(3)).toBe("fedex-hub") })
test("zone 4 regional", () => { expect(carrierForZone(4)).toBe("dhl-regional") })
test("zone 5 regional", () => { expect(carrierForZone(5)).toBe("dhl-regional") })
`)

add("tests-hidden/money-round.test.ts", `import { expect, test } from "bun:test"
import { round } from "../src/support/money"

test("round up", () => { expect(round(2.567, 2)).toBe(2.57) })
test("round half up", () => { expect(round(1.005, 2)).toBe(1.01) })
`)

add("tests-hidden/billing-invoice.test.ts", `import { expect, test } from "bun:test"
import { invoiceTotalBase } from "../src/domains/billing"

test("invoice total base converts currencies", () => {
  expect(invoiceTotalBase([
    { description: "a", amount: 10, currency: "USD" },
    { description: "b", amount: 20, currency: "EUR" },
  ])).toBe(32)
})
`)

add("tests-hidden/billing-idempotency.test.ts", `import { expect, test } from "bun:test"
import { charge, getPayment } from "../src/domains/billing"

test("charge persists the idempotency key", () => {
  const paid = charge({ orderId: "o1", amount: 10, currency: "USD", method: "card", idempotencyKey: "k1" })
  const stored = getPayment(paid.id)
  expect(stored.idempotencyKey).toBe("k1")
})
`)

add("tests-hidden/loyalty-tiers.test.ts", `import { expect, test } from "bun:test"
import { awardPoints, isEligibleForTier, createCustomer } from "../src/domains/customers"

test("awarding 300 pushes to silver", () => {
  const customer = createCustomer({ email: "a@x", name: "A" })
  awardPoints(customer, 300)
  expect(isEligibleForTier(customer)).toBe("silver")
})
`)

// Long-horizon golden: requires a cross-domain change (orders -> shipping).
add("tests-hidden-lh/order-shipment.test.ts", `import { expect, test } from "bun:test"
import { orderSubtotal } from "../src/domains/orders"
import { fulfill } from "../src/domains/orders/fulfill"

test("subtotal multiplies unit price by quantity", () => {
  expect(orderSubtotal([{ sku: "a", unitPrice: 3, quantity: 2, taxed: true }])).toBe(6)
})

test("fulfill prepares a local shipment for zone 1", () => {
  const shipment = fulfill("o1", 1)
  expect(shipment.orderId).toBe("o1")
  expect(shipment.carrier).toBe("local-courier")
})
`)

// Rename golden: expects prepareShipment renamed to createShipment.
add("tests-hidden-lh/shipping-rename.test.ts", `import { expect, test } from "bun:test"
import { createShipment } from "../src/domains/shipping"

test("createShipment prepares a shipment", () => {
  const shipment = createShipment("o2", 2)
  expect(shipment.orderId).toBe("o2")
  expect(shipment.carrier).toBe("usps-bulk")
})
`)

// ---------------------------------------------------------------------------
// Docs + scripts + project scaffolding
// ---------------------------------------------------------------------------

add("README.md", `# Storefront (Tier B corpus)

A deliberately simple order/inventory/billing demo used by the NIMBL
Edge-to-Edge benchmark. Not a real product.
`)

add("docs/architecture.md", `# Architecture

- src/domains/*: feature domains (pricing, orders, inventory, shipping, billing, customers, analytics, marketing).
- src/support/*: shared utilities (money, ids, time, errors, config, logging, validation).
- src/lib and src/vendor: bulk generators / adapter stubs, not part of product logic.

Idempotency is owned by the billing domain via src/domains/billing/idempotency.ts.
`)

add("docs/runbook.md", `# Runbook

bun test                      # run the PASS_TO_PASS unit suite
bun test ./tests-hidden       # run the FAIL_TO_PASS golden suite
bun test ./tests-hidden-lh    # long-horizon golden suite
`)

add("docs/glossary.md", `# Glossary

- MARGIN_RATE: target gross margin ratio, defined in src/domains/pricing/currency.ts.
- Base currency: USD. Conversion rates live in src/support/money.ts.
- Zone: shipping zone 1..5 mapped to carriers in src/domains/shipping/carrier.ts.
- fulfill: orders-domain dispatch that prepares a shipment (long-horizon task).
`)

add("package.json", `{
  "name": "tier-b-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test"
  }
}
`)

add("tsconfig.json", `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
`)

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

const runTest = (path: string) => ({ type: "command" as const, kind: "failToPass" as const, command: `bun test ${path}` })

const tasks: AgentBenchmarkTask[] = [
  {
    id: "bf-clamp",
    tags: ["bug-fix"],
    difficulty: "easy",
    prompt: "The clamp function in src/support/math.ts is broken: it returns values outside the requested bounds. Fix clamp so it always returns a value within [min, max]. Run the hidden test to confirm: bun test ./tests-hidden/math-clamp.test.ts",
    verify: [runTest("./tests-hidden/math-clamp.test.ts")],
  },
  {
    id: "bf-truncate",
    tags: ["bug-fix"],
    difficulty: "easy",
    prompt: "truncate in src/support/strings.ts keeps the tail instead of the head of a string. Fix it to keep the first `max` characters. Verify with: bun test ./tests-hidden/strings-truncate.test.ts",
    verify: [runTest("./tests-hidden/strings-truncate.test.ts")],
  },
  {
    id: "bf-discount",
    tags: ["bug-fix"],
    difficulty: "easy",
    prompt: "applyDiscount in src/domains/pricing/discount.ts is too aggressive (divides by 1000 instead of 100), so discounts are basically free. Fix the math so a 10% discount on 100 yields 90. Verify with: bun test ./tests-hidden/pricing-discount.test.ts",
    verify: [runTest("./tests-hidden/pricing-discount.test.ts")],
  },
  {
    id: "bf-subtotal",
    tags: ["bug-fix"],
    difficulty: "medium",
    prompt: "orderSubtotal in src/domains/orders/sum.ts adds unitPrice + quantity instead of multiplying. Fix it so subtotal = sum(unitPrice * quantity). Verify with: bun test ./tests-hidden/orders-sum.test.ts",
    verify: [runTest("./tests-hidden/orders-sum.test.ts")],
  },
  {
    id: "bf-reserve",
    tags: ["bug-fix", "shell-loop"],
    difficulty: "medium",
    prompt: "inventory reserve() in src/domains/inventory/reservation.ts incorrectly allows overselling when available quantity is greater than (instead of >=) the requested quantity, and it should throw when there is not enough stock. Fix reserve so it only reserves when available >= quantity and throws otherwise. Verify with: bun test ./tests-hidden/inventory-reserve.test.ts",
    verify: [runTest("./tests-hidden/inventory-reserve.test.ts")],
  },
  {
    id: "bf-carrier",
    tags: ["bug-fix"],
    difficulty: "easy",
    prompt: "carrierForZone in src/domains/shipping/carrier.ts has an off-by-one that keeps zone 4 (and 5) on fedex-hub. Zone 4 and 5 must map to dhl-regional. Verify with: bun test ./tests-hidden/shipping-carrier.test.ts",
    verify: [runTest("./tests-hidden/shipping-carrier.test.ts")],
  },
  {
    id: "bf-round",
    tags: ["bug-fix"],
    difficulty: "medium",
    prompt: "round() in src/support/money.ts floors instead of rounding, so totals silently truncate cents. Fix it to round half-up to the given precision. Verify with: bun test ./tests-hidden/money-round.test.ts",
    verify: [runTest("./tests-hidden/money-round.test.ts")],
  },
  {
    id: "bf-invoice",
    tags: ["bug-fix"],
    difficulty: "hard",
    prompt: "invoiceTotalBase in src/domains/billing/invoice.ts sums line amounts without converting mixed currencies into the base currency, so invoices are wrong when lines use EUR/GBP. Convert each line with convertToBase first, then sum. Verify with: bun test ./tests-hidden/billing-invoice.test.ts",
    verify: [runTest("./tests-hidden/billing-invoice.test.ts")],
  },
  {
    id: "bf-loyalty-threshold",
    tags: ["bug-fix"],
    difficulty: "medium",
    prompt: "isEligibleForTier in src/domains/customers/customer.ts promotes to silver only at 500 points, but the product expects 250. A customer with 300 points must be silver. Fix the threshold (gold still at 1000) and keep the existing unit test green. Verify with: bun test ./tests-hidden/loyalty-tiers.test.ts and bun test ./tests/unit/customers.test.ts",
    verify: [runTest("./tests-hidden/loyalty-tiers.test.ts")],
  },
  {
    id: "ret-margin",
    tags: ["retrieval"],
    difficulty: "easy",
    prompt: "Find the target gross margin ratio used by the pricing service and report the exact number. Hint: it lives in the pricing domain. Answer with just the number.",
    verify: [
      { type: "answerContains", kind: "plain", text: "0.42" },
      { type: "fileContains", kind: "plain", path: "src/domains/pricing/currency.ts", text: "MARGIN_RATE = 0.42" },
    ],
  },
  {
    id: "ret-carrier-zone5",
    tags: ["retrieval"],
    difficulty: "medium",
    prompt: "Which carrier handles shipping zone 5 for this storefront? Find the authoritative mapping in the shipping domain and report the carrier name exactly.",
    verify: [
      { type: "answerContains", kind: "plain", text: "dhl-regional" },
      { type: "fileContains", kind: "plain", path: "src/domains/shipping/carrier.ts", text: "dhl-regional" },
    ],
  },
  {
    id: "ret-retries",
    tags: ["retrieval"],
    difficulty: "easy",
    prompt: "How many retry attempts does the default app config configure for external calls? Find the retries field and report the number.",
    verify: [
      { type: "answerContains", kind: "plain", text: "3" },
      { type: "fileContains", kind: "plain", path: "src/support/config.ts", text: "retries: 3" },
    ],
  },
  {
    id: "ret-idempotency-owner",
    tags: ["retrieval"],
    difficulty: "easy",
    prompt: "Which domain owns idempotency for payments? Consult the architecture document and the code, then report the domain name.",
    verify: [
      { type: "answerContains", kind: "plain", text: "billing" },
      { type: "fileContains", kind: "plain", path: "src/domains/billing/idempotency.ts", text: "dedupe" },
    ],
  },
  {
    id: "ret-base-currency",
    tags: ["retrieval"],
    difficulty: "easy",
    prompt: "What is the base currency that all money is converted into? Report the ISO code.",
    verify: [
      { type: "answerContains", kind: "plain", text: "USD" },
      { type: "fileContains", kind: "plain", path: "src/support/money.ts", text: "USD: 1" },
    ],
  },
  {
    id: "mf-quote-margin",
    tags: ["multi-file", "bug-fix"],
    difficulty: "medium",
    prompt: "Pricing must produce correct quotes end to end: a quote of base=100, discountPercent=10, taxRate=0.08, currency USD must total 97.2 with margin 42. This can require fixes across discount.ts, money.ts and service.ts. Fix the pipeline so quote works; verify with: bun test ./tests-hidden/pricing-quote.test.ts. Do not weaken the existing unit tests.",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden/pricing-quote.test.ts" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit" },
    ],
  },
  {
    id: "mf-fulfill-dispatch",
    tags: ["multi-file"],
    difficulty: "medium",
    prompt: "Orders must be able to dispatch a shipment. Add a function fulfill(orderId, zone) in src/domains/orders/fulfill.ts (new file) that calls prepareShipment from the shipping domain and returns the shipment. Export it from the orders module. A hidden test imports it; it currently fails to import at all. Expected: for zone 1 the shipment uses local-courier. Verify with: bun test ./tests-hidden-lh/order-shipment.test.ts",
    verify: [runTest("./tests-hidden-lh/order-shipment.test.ts")],
  },
  {
    id: "mf-billing-idempotency",
    tags: ["multi-file"],
    difficulty: "hard",
    prompt: "Charges accept an idempotency key but the key never reaches the persisted Payment record, so callers cannot verify idempotency. Thread the idempotencyKey from charge() into the Payment object that doCharge saves. Keep the unit suite green. Verify with: bun test ./tests-hidden/billing-idempotency.test.ts",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden/billing-idempotency.test.ts" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit" },
    ],
  },
  {
    id: "tw-round",
    tags: ["test-writing", "bug-fix"],
    difficulty: "medium",
    prompt: "There is no unit coverage for money rounding in tests/unit. Write tests/unit/money.test.ts asserting round(2.567, 2) === 2.57 and round(1.005, 2) === 1.01 (import round from ../../src/support/money). Then run the suite; you will find round() is actually broken (it floors) and must fix it in src/support/money.ts. All tests must pass: bun test ./tests/unit",
    verify: [{ type: "command", kind: "failToPass", command: "bun test ./tests/unit/money.test.ts" }],
  },
  {
    id: "tw-carriers",
    tags: ["test-writing"],
    difficulty: "medium",
    prompt: "Add a test file tests/unit/carriers.test.ts that covers carrierForZone for every zone 1..5 and asserts rateFor returns a positive number for the four base carriers listed in src/domains/shipping/rates.ts. Then run the suite - you will find carrierForZone has an off-by-one (zone 4 should be dhl-regional, not fedex-hub). Fix the source until your new test and the whole unit suite pass: bun test ./tests/unit",
    verify: [{ type: "command", kind: "failToPass", command: "bun test ./tests/unit/carriers.test.ts" }],
  },
  {
    id: "sh-hidden-green",
    tags: ["shell-loop", "bug-fix"],
    difficulty: "hard",
    prompt: "Run the hidden golden suite: bun test ./tests-hidden. Read the failures to discover which source modules are wrong, fix them all, and get the whole hidden suite green. Do not modify or delete any file under tests-hidden.",
    verify: [{ type: "command", kind: "failToPass", command: "bun test ./tests-hidden" }],
  },
  {
    id: "sh-suite-green",
    tags: ["shell-loop"],
    difficulty: "medium",
    prompt: "Run the full test suite (bun test). Drive the tests, read the failures, and fix every broken source file until the entire suite is green. Do not delete or weaken tests.",
    verify: [{ type: "command", kind: "failToPass", command: "bun test ./tests" }],
  },
  {
    id: "dl-award-points",
    tags: ["delegation", "bug-fix"],
    difficulty: "medium",
    prompt: "A customer was awarded 300 points but their tier did not update to silver. Use a subagent to research how awardPoints and isEligibleForTier interact in the customers domain, then implement the correct threshold behavior in the parent session so a 300-point customer is silver. This is a delegated research task: spawn a subagent for the investigation, then apply the fix yourself.",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden/loyalty-tiers.test.ts" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit/customers.test.ts" },
    ],
  },
  {
    id: "dl-idempotency",
    tags: ["delegation", "multi-file"],
    difficulty: "hard",
    prompt: "Payments must be idempotent: the idempotency key must be persisted on the stored Payment record. Delegate research to a subagent to map how idempotency.ts, service.ts and repo.ts relate in the billing domain and whether the key is persisted. Then, in the parent session, implement persistence of the idempotencyKey in doCharge and keep the unit suite green.",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden/billing-idempotency.test.ts" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit" },
    ],
  },
  {
    id: "lh-forced-context-rename",
    tags: ["long-horizon"],
    difficulty: "hard",
    prompt: "Rename the exported function prepareShipment in src/domains/shipping to createShipment and update every importer across the repository (search for import sites), keeping the behavior identical and the unit suite green. A hidden test imports createShipment and currently fails to import. Verify with: bun test ./tests-hidden-lh/shipping-rename.test.ts and bun test ./tests/unit",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden-lh/shipping-rename.test.ts" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit" },
    ],
  },
  {
    id: "lh-fix-all",
    tags: ["long-horizon", "multi-file"],
    difficulty: "hard",
    prompt: "The storefront has several subtle bugs (subtotal math, reservation oversell, quote pipeline, currency conversion). Work top-down: audit the domains, fix all of them so the hidden suites pass, and keep the unit suite green. Verify with: bun test ./tests-hidden and bun test ./tests/unit",
    verify: [
      { type: "command", kind: "failToPass", command: "bun test ./tests-hidden" },
      { type: "command", kind: "passToPass", command: "bun test ./tests/unit" },
    ],
  },
]

mkdirSync(OUTPUT_ROOT, { recursive: true })
mkdirSync(FIXTURE, { recursive: true })
rmSync(FIXTURE, { recursive: true, force: true })

for (const [path, content] of Object.entries(files)) {
  const target = join(FIXTURE, path)
  mkdirSync(join(target, ".."), { recursive: true })
  writeFileSync(target, content, "utf8")
}
writeFileSync(join(OUTPUT_ROOT, "agent-tasks.json"), JSON.stringify({ generator: "generate-tier-b.ts", seed: SEED, tasks }, null, 2), "utf8")

const counts = Object.entries(files).reduce((acc, [path]) => { const ext = path.split(".").pop() || ""; acc[ext] = (acc[ext] || 0) + 1; return acc }, {} as Record<string, number>)
console.log(`Tier B corpus generated at ${OUTPUT_ROOT}`)
console.log(`  seed=${SEED} files=${Object.keys(files).length} tasks=${tasks.length}`, counts)